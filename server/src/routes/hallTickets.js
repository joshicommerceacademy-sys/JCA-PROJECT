const express = require("express");
const { query, pool } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin, requireAdminOrDesk } = require("../middleware/auth");
const { generateHallTickets } = require("../utils/hallTicketGenerator");
const { sendMail, sendMailBatch } = require("../utils/mailer");
const { buildHallTicketPdf } = require("../utils/hallTicketPdf");
const { assertConfirmPassword } = require("../utils/emailGate");
const { nextHallTicketNumber, nextStudentRollNumber, nextStudentCode, nextSeatNumber } = require("../utils/idGenerators");
const { assertDeskStudents } = require("../utils/deskScope");
const { SELECT_TICKET_JOIN, hallTicketEmailHtml, sendHallTicketEmail } = require("../utils/hallTicketMail");

const router = express.Router();
// Everything here is admin-only except POST /generate, which a Verification Desk session (scoped
// to a single exam) may also call.
router.use((req, res, next) =>
    req.method === "POST" && req.path === "/generate" ? requireAdminOrDesk(req, res, next) : requireAdmin(req, res, next)
);

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
        if (!Array.isArray(studentIds) || studentIds.length === 0 || !examId) {
            throw new ApiError(400, "studentIds and examId are required.");
        }
        if (req.desk) {
            if (Number(examId) !== Number(req.desk.examId)) throw new ApiError(403, "This desk can only work on its own exam.");
            await assertDeskStudents(req.desk, studentIds);
        }

        const { created, skipped } = await generateHallTickets({ studentIds, standardId, examId });

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
