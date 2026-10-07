const express = require("express");
const { query, pool } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { sendMail, sendMailBatch } = require("../utils/mailer");
const { buildHallTicketPdf } = require("../utils/hallTicketPdf");
const { assertConfirmPassword } = require("../utils/emailGate");
const { nextHallTicketNumber, nextStudentRollNumber, nextStudentCode, nextSeatNumber } = require("../utils/idGenerators");
const { studentLoginLink } = require("../utils/links");

const router = express.Router();
router.use(requireAdmin);

const SELECT_TICKET_JOIN = `
    SELECT ht.*, st.roll_number, st.full_name AS student_name, st.photo_url, st.signature_url, st.email, st.dob,
           st.standard_id, s.name AS standard_name, e.name AS exam_name,
           e.exam_date, e.start_time, e.duration_minutes, c.name AS centre_name,
           c.address AS centre_address, c.city AS centre_city
    FROM hall_tickets ht
    JOIN students st ON st.id = ht.student_id
    JOIN exams e ON e.id = ht.exam_id
    LEFT JOIN standards s ON s.id = st.standard_id
    LEFT JOIN centres c ON c.id = st.centre_id
`;

function cityLine(ticket) {
    return ticket.centre_city ? `${ticket.centre_city}, ${ticket.centre_address}` : (ticket.centre_address || "—");
}

function hallTicketEmailHtml(ticket) {
    const link = studentLoginLink(ticket.exam_id);
    return `
        <p>Dear ${ticket.student_name},</p>
        <p>Please find attached your hall ticket for <strong>${ticket.exam_name}</strong>.</p>
        <ul>
            <li><strong>Date:</strong> ${new Date(ticket.exam_date).toLocaleDateString()}</li>
            <li><strong>Time:</strong> ${ticket.start_time}</li>
            <li><strong>City:</strong> ${cityLine(ticket)}</li>
            <li><strong>Hall Ticket No.:</strong> ${ticket.hall_ticket_number}</li>
        </ul>
        <p>The attached PDF is password-protected — enter your date of birth in
        <strong>DDMMYYYY</strong> format to open it.</p>
        <p>When it's time for your exam, log in here: <a href="${link}">${link}</a></p>
        <p>Joshi's Commerce Academy</p>
    `;
}

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        const clauses = ["ht.status = 'generated'"];
        const params = [];
        if (examId) {
            params.push(examId);
            clauses.push(`ht.exam_id = $${params.length}`);
        }

        const tickets = await query(
            `${SELECT_TICKET_JOIN} WHERE ${clauses.join(" AND ")} ORDER BY ht.id DESC`,
            params
        );
        res.json({ status: "success", data: tickets });
    })
);

// Bulk-selects already-registered students, assigns each a roll number if it doesn't
// have one yet, assigns the chosen standard/exam onto the student record, and issues a
// hall ticket. Students that already have a ticket for this exam are skipped, not
// duplicated (hall_tickets has a UNIQUE (student_id, exam_id) constraint as a backstop).
router.post(
    "/generate",
    asyncHandler(async (req, res) => {
        const { studentIds, standardId, examId } = req.body;
        if (!Array.isArray(studentIds) || studentIds.length === 0 || !standardId || !examId) {
            throw new ApiError(400, "studentIds, standardId and examId are required.");
        }

        const created = [];
        const skipped = [];

        for (const studentId of studentIds) {
            const [student] = await query("SELECT * FROM students WHERE id = $1", [studentId]);
            if (!student) {
                skipped.push({ studentId, reason: "Student not found." });
                continue;
            }

            const [existingTicket] = await query(
                "SELECT id FROM hall_tickets WHERE student_id = $1 AND exam_id = $2",
                [studentId, examId]
            );
            if (existingTicket) {
                skipped.push({ studentId, studentName: student.full_name, reason: "Already has a hall ticket for this exam." });
                continue;
            }

            const client = await pool.connect();
            try {
                await client.query("BEGIN");

                let rollNumber = student.roll_number;
                if (!rollNumber) {
                    rollNumber = await nextStudentRollNumber();
                }
                let studentCode = student.student_code;
                if (!studentCode) {
                    studentCode = await nextStudentCode();
                }

                // A student's "allowed" status is specific to the exam they were allowed for —
                // being approved for exam A must never carry over as automatic access to exam B.
                // If this hall ticket assigns the student to a *different* exam than the one
                // currently on their record, reset status/check-in back to pending so the admin
                // has to explicitly re-approve them on the Verification page for the new exam.
                // Re-generating a ticket for the same exam (exam_id unchanged) leaves status alone.
                const isDifferentExam = student.exam_id && Number(student.exam_id) !== Number(examId);

                await client.query(
                    `UPDATE students SET roll_number = $1, student_code = $2, standard_id = $3, exam_id = $4,
                        status = CASE WHEN $6 THEN 'pending' ELSE status END,
                        checked_in_at = CASE WHEN $6 THEN NULL ELSE checked_in_at END,
                        updated_at = now()
                     WHERE id = $5`,
                    [rollNumber, studentCode, standardId, examId, studentId, isDifferentExam]
                );

                const hallTicketNumber = await nextHallTicketNumber();
                const seatNumber = await nextSeatNumber(examId);
                const ticketResult = await client.query(
                    `INSERT INTO hall_tickets (student_id, exam_id, hall_ticket_number, seat_number)
                     VALUES ($1, $2, $3, $4) RETURNING id`,
                    [studentId, examId, hallTicketNumber, seatNumber]
                );

                await client.query("COMMIT");
                created.push({
                    studentId,
                    studentName: student.full_name,
                    hallTicketId: ticketResult.rows[0].id,
                    rollNumber,
                });
            } catch (error) {
                await client.query("ROLLBACK");
                skipped.push({ studentId, studentName: student.full_name, reason: error.message });
            } finally {
                client.release();
            }
        }

        // Hall-ticket generation only creates the tickets.
        // Emailing is intentionally manual from the Hall Tickets page so the admin can
        // choose exactly which students should receive their PDF.
        res.status(201).json({
            status: "success",
            message: `Generated ${created.length} hall ticket(s), skipped ${skipped.length}.`,
            data: {
                created,
                skipped,
            },
        });
    })
);

router.put(
    "/:id/seat",
    asyncHandler(async (req, res) => {
        const { seatNumber } = req.body;
        if (!seatNumber) throw new ApiError(400, "seatNumber is required.");

        const [ticket] = await query(
            "UPDATE hall_tickets SET seat_number = $1 WHERE id = $2 RETURNING *",
            [seatNumber, req.params.id]
        );
        if (!ticket) throw new ApiError(404, "Hall ticket not found.");
        res.json({ status: "success", data: ticket });
    })
);

router.post(
    "/:id/send",
    asyncHandler(async (req, res) => {
        await assertConfirmPassword(req, req.body.confirmPassword);

        const [ticket] = await query(`${SELECT_TICKET_JOIN} WHERE ht.id = $1`, [req.params.id]);
        if (!ticket) throw new ApiError(404, "Hall ticket not found.");

        const pdfBuffer = await buildHallTicketPdf(ticket);
        await sendMail({
            to: ticket.email,
            subject: `Hall Ticket - ${ticket.exam_name}`,
            html: hallTicketEmailHtml(ticket),
            attachments: [{ filename: `${ticket.hall_ticket_number}.pdf`, content: pdfBuffer }],
            type: "hall_ticket",
        });
        await query("UPDATE hall_tickets SET email_sent_at = now() WHERE id = $1", [ticket.id]);

        res.json({ status: "success", message: "Hall ticket emailed." });
    })
);

router.post(
    "/bulk-send",
    asyncHandler(async (req, res) => {
        await assertConfirmPassword(req, req.body.confirmPassword);

        const { ticketIds } = req.body;
        if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
            throw new ApiError(400, "ticketIds must be a non-empty array.");
        }

        const tickets = await query(`${SELECT_TICKET_JOIN} WHERE ht.id = ANY($1::int[])`, [ticketIds]);

        const { succeeded, failed } = await sendMailBatch(tickets, async (ticket) => {
            const pdfBuffer = await buildHallTicketPdf(ticket);
            await sendMail({
                to: ticket.email,
                subject: `Hall Ticket - ${ticket.exam_name}`,
                html: hallTicketEmailHtml(ticket),
                attachments: [{ filename: `${ticket.hall_ticket_number}.pdf`, content: pdfBuffer }],
                type: "hall_ticket",
            });
            await query("UPDATE hall_tickets SET email_sent_at = now() WHERE id = $1", [ticket.id]);
        });

        res.json({
            status: "success",
            message: `Sent ${succeeded.length}/${tickets.length} hall ticket email(s).`,
            data: {
                sentCount: succeeded.length,
                failedCount: failed.length,
                failed: failed.map(({ item, error }) => ({
                    ticketId: item.id,
                    studentName: item.student_name,
                    email: item.email,
                    error,
                })),
            },
        });
    })
);

router.put(
    "/:id/revoke",
    asyncHandler(async (req, res) => {
        const result = await query(
            "UPDATE hall_tickets SET status = 'revoked' WHERE id = $1 RETURNING id",
            [req.params.id]
        );
        if (!result.length) throw new ApiError(404, "Hall ticket not found.");
        res.json({ status: "success", message: "Hall ticket revoked." });
    })
);

module.exports = router;
