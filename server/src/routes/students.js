const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdminOrDesk } = require("../middleware/auth");
const { assertDeskStudents } = require("../utils/deskScope");
const { saveStudentUploads } = require("../utils/studentFiles");
const { assignSeat, releaseSeat } = require("../utils/seats");
const { releaseRollClaim, grantReappear } = require("../utils/grantReappear");
const { isDeskClosed, isDeskNotOpen, deskWindow } = require("../utils/deskUser");
const { autoAssignSlots } = require("../utils/slots");
const { generateHallTickets } = require("../utils/hallTicketGenerator");
const { sendHallTicketEmail } = require("../utils/hallTicketMail");
const { uploadStudentFiles } = require("../middleware/upload");
const { formatDobPassword, nextStudentCode } = require("../utils/idGenerators");
const { sendMail, sendMailBatch } = require("../utils/mailer");
const { getSettings } = require("../utils/settings");

const router = express.Router();
router.use(requireAdminOrDesk);

// A Verification Desk session (scoped to one exam) may only use the verification actions, and
// only on students from its own exam roster. Everything else here stays admin-only.
const DESK_ROUTES = [
    ["GET", /^\/$/],
    ["PUT", /^\/(\d+)\/(desk-allow|desk-disallow|desk-reappear|live-photo|assign-slot)$/],
    ["PUT", /^\/(desk-verify-all|desk-revoke-all)$/],
];
router.use(
    asyncHandler(async (req, res, next) => {
        if (!req.desk) return next();
        const match = DESK_ROUTES.find(([method, re]) => method === req.method && re.test(req.path));
        if (!match) throw new ApiError(403, "The verification desk cannot do this.");
        const idMatch = req.path.match(/^\/(\d+)\//);
        if (idMatch) await assertDeskStudents(req.desk, [idMatch[1]]);
        else if (req.method === "POST") await assertDeskStudents(req.desk, req.body.studentIds);
        next();
    })
);

function adminNewRegistrationEmailHtml({ fullName, email, phone }) {
    return `
        <p>A new student has registered and is awaiting verification:</p>
        <ul>
            <li><strong>Name:</strong> ${fullName}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Phone:</strong> ${phone || "—"}</li>
        </ul>
        <p>Please review this registration on the Verification page.</p>
    `;
}

const SELECT_STUDENT = `
    SELECT st.id, st.roll_number, st.student_code, st.full_name, st.email, st.phone, st.dob, st.gender, st.address,
           st.centre_id, c.name AS centre_name, st.standard_id, s.name AS standard_name,
           st.exam_id, e.name AS exam_name, st.registered_exam_id, re.name AS registered_exam_name, st.application_id, st.disallow_reason,
           (SELECT ht.seat_number FROM hall_tickets ht WHERE ht.student_id = st.id AND ht.exam_id = st.exam_id AND ht.status = 'generated' ORDER BY ht.id DESC LIMIT 1) AS seat_number,
           EXISTS (SELECT 1 FROM reappear_requests rr WHERE rr.student_id = st.id AND rr.exam_id = st.exam_id AND rr.status = 'pending') AS has_reappear, st.photo_url, st.signature_url, st.status, st.checked_in_at, st.exam_access_allowed, st.exam_access_allowed_at, st.login_at, st.marked_absent,
           st.created_at, st.updated_at
    FROM students st
    LEFT JOIN centres c ON c.id = st.centre_id
    LEFT JOIN standards s ON s.id = st.standard_id
    LEFT JOIN exams e ON e.id = st.exam_id
    LEFT JOIN registered_exams re ON re.id = st.registered_exam_id
`;

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { examId, status, search, registeredExamId } = req.query;
        const clauses = [];
        const params = [];

        if (req.desk) {
            // Desk sessions only ever see their own exam's roster, whatever the query says.
            params.push(req.desk.examId, req.desk.registeredExamId || null);
            clauses.push(`(st.exam_id = $1 OR ($2::int IS NOT NULL AND st.registered_exam_id = $2))`);
            // A per-centre desk login only ever sees its own centre's candidates.
            if (req.desk.centreId) {
                params.push(req.desk.centreId);
                clauses.push(`st.centre_id = $${params.length}`);
            }
            if (req.query.slotId) {
                const [slot] = await query(
                    "SELECT id FROM exams WHERE id = $1 AND (id = $2 OR ($3::int IS NOT NULL AND registered_exam_id = $3))",
                    [req.query.slotId, req.desk.examId, req.desk.registeredExamId || null]
                );
                if (!slot) throw new ApiError(403, "That slot is not part of this desk's exam.");
                params.push(slot.id);
                clauses.push(`st.exam_id = $${params.length}`);
            }

        } else if (registeredExamId) {
            params.push(registeredExamId);
            clauses.push(`st.registered_exam_id = $${params.length}`);
        } else if (examId) {
            params.push(examId);
            clauses.push(`(st.exam_id = $${params.length} OR st.exam_id IS NULL)`);
        }
        if (status) {
            params.push(status);
            clauses.push(`st.status = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            clauses.push(`(st.full_name ILIKE $${params.length} OR st.roll_number ILIKE $${params.length} OR st.application_id ILIKE $${params.length})`);
        }

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const students = await query(`${SELECT_STUDENT} ${where} ORDER BY st.id DESC`, params);
        res.json({ status: "success", data: students });
    })
);

router.get(
    "/:id",
    asyncHandler(async (req, res) => {
        const [student] = await query(`${SELECT_STUDENT} WHERE st.id = $1`, [req.params.id]);
        if (!student) throw new ApiError(404, "Student not found.");
        res.json({ status: "success", data: student });
    })
);

router.post(
    "/",
    uploadStudentFiles,
    asyncHandler(async (req, res) => {
        const { fullName, email, phone, dob, gender, address, centreId, registeredExamId } = req.body;
        if (!fullName || !email || !phone || !dob || !centreId) {
            throw new ApiError(400, "Full name, email, phone, DOB and centre are required.");
        }

        const [existing] = await query("SELECT id FROM students WHERE email = $1", [email]);
        if (existing) throw new ApiError(409, "A student with this email is already registered.");

        const defaultPassword = formatDobPassword(dob);
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        // Standard and exam are deliberately not collected here — a student registers
        // once and is assigned a standard/exam later, per generated hall ticket, on the
        // Generate Hall Ticket page. roll_number is assigned there too.
        const [student] = await query(
            `INSERT INTO students
                (full_name, email, phone, dob, gender, address, centre_id, photo_url, signature_url, password_hash, registered_exam_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id, full_name, email, status`,
            [fullName, email, phone, dob, gender || null, address || null, centreId, null, null, passwordHash, registeredExamId ? Number(registeredExamId) : null]
        );
        await saveStudentUploads(student.id, req.files);
        if (registeredExamId) autoAssignSlots(Number(registeredExamId)).catch((error) => console.error("Auto batch allocation failed:", error.message));

        res.status(201).json({
            status: "success",
            message: "Student registered successfully.",
            data: { ...student, defaultPassword },
        });

        // The student-facing welcome email is deliberately not sent here — credentials are shown
        // to the admin on-screen instead, and the hall ticket (with a PDF) is only ever emailed
        // manually from the Hall Ticket page. The admin alert itself is gated by the Settings
        // page's "Email admins on new registration" toggle.
        getSettings()
            .then((settings) => {
                if (!settings.registration_alert_enabled) return;
                return query("SELECT email FROM admin_users").then((admins) =>
                    sendMailBatch(admins, (admin) =>
                        sendMail({
                            to: admin.email,
                            subject: `New Student Registration Pending Verification — ${fullName}`,
                            html: adminNewRegistrationEmailHtml({ fullName, email, phone }),
                            type: "admin_new_registration",
                        })
                    )
                );
            })
            .catch((error) => console.error("Admin registration alert failed:", error.message));
    })
);

// Students a desk (or admin) bulk action applies to: one slot's roster, limited to the desk's own
// exam / centre. Admin passes the exam id as slotId.
async function bulkRoster(req) {
    const slotId = Number(req.body.slotId || req.body.examId || req.desk?.examId);
    if (!slotId) throw new ApiError(400, "slotId is required.");
    const [exam] = await query("SELECT * FROM exams WHERE id = $1", [slotId]);
    if (!exam) throw new ApiError(404, "Exam / batch not found.");
    if (req.desk && !(exam.id === req.desk.examId || (req.desk.registeredExamId && exam.registered_exam_id === req.desk.registeredExamId))) {
        throw new ApiError(403, "That batch is not part of this desk's exam.");
    }
    const params = [slotId];
    let centreClause = "";
    if (req.desk?.centreId) {
        params.push(req.desk.centreId);
        centreClause = "AND st.centre_id = $2";
    }
    const students = await query(
        `SELECT st.id, st.roll_number, st.centre_id, st.exam_access_allowed, st.disallow_reason, st.login_at, st.login_claimed_at,
                EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.student_id = st.id AND ea.exam_id = st.exam_id) AS has_attempt
         FROM students st
         WHERE st.exam_id = $1 ${centreClause}`,
        params
    );
    return { exam, students };
}

// Verify All: allows every candidate of the batch still waiting at the desk (not yet allowed and
// not explicitly disallowed), assigning seats when Seating Arrangement is on. Follows the same
// desk open / closed rules as a single Allow. The live photo step is skipped for the bulk action.
router.put(
    "/desk-verify-all",
    asyncHandler(async (req, res) => {
        const { exam, students } = await bulkRoster(req);
        if (isDeskNotOpen(exam)) {
            throw new ApiError(403, "Verification desk is not open yet.", "DESK_NOT_OPEN");
        }
        if (isDeskClosed(exam)) {
            throw new ApiError(403, "Verification desk is closed. Candidates cannot be allowed and are marked Absent.", "DESK_CLOSED");
        }
        const waiting = students.filter((s) => !s.exam_access_allowed && !s.disallow_reason);
        let allowed = 0;
        const failed = [];
        for (const s of waiting) {
            try {
                if (exam.seat_number_required) await assignSeat(s, exam.id);
                await query(
                    `UPDATE students SET status = 'allowed', exam_access_allowed = true, disallow_reason = NULL, marked_absent = false,
                        exam_access_allowed_at = COALESCE(exam_access_allowed_at, now()), updated_at = now() WHERE id = $1`,
                    [s.id]
                );
                allowed += 1;
            } catch (error) {
                failed.push({ rollNumber: s.roll_number, error: error.message });
            }
        }
        res.json({ status: "success", data: { allowed, failed } });
    })
);

// Revoke All: takes back exam access from every allowed candidate who has not logged in at all
// (no roll number selected, no login, no attempt) and marks them Absent. Anyone who has already
// selected a roll number, logged in or started is left alone.
router.put(
    "/desk-revoke-all",
    asyncHandler(async (req, res) => {
        const { exam, students } = await bulkRoster(req);
        const targets = students.filter((s) => s.exam_access_allowed && !s.login_at && !s.login_claimed_at && !s.has_attempt);
        for (const s of targets) {
            await query(
                `UPDATE students SET exam_access_allowed = false, exam_access_allowed_at = NULL, marked_absent = true, updated_at = now() WHERE id = $1`,
                [s.id]
            );
            await releaseSeat(s.id, exam.id);
        }
        res.json({ status: "success", data: { revoked: targets.length } });
    })
);

router.put(
    "/:id",
    uploadStudentFiles,
    asyncHandler(async (req, res) => {
        const { fullName, phone, gender, address, centreId } = req.body;
        if (!fullName || !centreId) {
            throw new ApiError(400, "Full name and centre are required.");
        }

        const [student] = await query(
            `UPDATE students SET full_name = $1, phone = $2, gender = $3, address = $4,
                centre_id = $5,
                updated_at = now()
             WHERE id = $6 RETURNING id, roll_number, full_name, status, exam_id`,
            [fullName, phone || null, gender || null, address || null, centreId, req.params.id]
        );
        if (!student) throw new ApiError(404, "Student not found.");
        await saveStudentUploads(student.id, req.files);
        res.json({ status: "success", data: student });
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const result = await query("DELETE FROM students WHERE id = $1 RETURNING id", [req.params.id]);
        if (!result.length) throw new ApiError(404, "Student not found.");
        res.json({ status: "success", message: "Student deleted." });
    })
);

// Called by the Generate Hall Ticket page the moment a student is checked/selected —
// idempotent, so re-checking an already-coded student is a no-op.
router.put(
    "/:id/assign-code",
    asyncHandler(async (req, res) => {
        const [student] = await query(`${SELECT_STUDENT} WHERE st.id = $1`, [req.params.id]);
        if (!student) throw new ApiError(404, "Student not found.");
        if (student.student_code) {
            return res.json({ status: "success", data: student });
        }
        const code = await nextStudentCode();
        const [updated] = await query(
            "UPDATE students SET student_code = $1, updated_at = now() WHERE id = $2 RETURNING id",
            [code, req.params.id]
        );
        const [full] = await query(`${SELECT_STUDENT} WHERE st.id = $1`, [updated.id]);
        res.json({ status: "success", data: full });
    })
);

// Registration verification (Reports > Registrations). Verifying a candidate issues their hall
// ticket when their exam is already scheduled, then emails the PDF. If the exam is not scheduled
// yet, the ticket (and email) follow automatically when it is. Admin-only.
router.post(
    "/verify",
    asyncHandler(async (req, res) => {
        const ids = Array.isArray(req.body.studentIds) ? req.body.studentIds.map(Number).filter(Number.isFinite) : [];
        if (!ids.length) throw new ApiError(400, "studentIds must be a non-empty array.");

        const students = await query("SELECT id, registered_exam_id, exam_id FROM students WHERE id = ANY($1::int[])", [ids]);
        const result = { verified: 0, ticketsIssued: 0, emailed: 0, emailFailed: [] };

        for (const student of students) {
            let exam = null;
            if (student.exam_id) {
                [exam] = await query("SELECT id, standard_id FROM exams WHERE id = $1 AND status != 'cancelled'", [student.exam_id]);
            } else if (student.registered_exam_id) {
                // Several slots and no slot picked yet: no ticket until the admin assigns one.
                const slots = await query("SELECT id, standard_id FROM exams WHERE registered_exam_id = $1 AND status != 'cancelled'", [student.registered_exam_id]);
                if (slots.length === 1) exam = slots[0];
            }
            if (exam) {
                // Ticket first: generation resets status when moving a student between exams.
                const { created } = await generateHallTickets({ studentIds: [student.id], standardId: exam.standard_id, examId: exam.id });
                result.ticketsIssued += created.length;
            }
            await query("UPDATE students SET status = 'allowed', updated_at = now() WHERE id = $1", [student.id]);
            result.verified += 1;

            if (exam) {
                const [ticket] = await query("SELECT id, email_sent_at FROM hall_tickets WHERE student_id = $1 AND exam_id = $2 AND status = 'generated'", [student.id, exam.id]);
                if (ticket && !ticket.email_sent_at) {
                    try {
                        await sendHallTicketEmail(ticket.id);
                        result.emailed += 1;
                    } catch (error) {
                        result.emailFailed.push({ studentId: student.id, error: error.message });
                    }
                }
            }
        }
        res.json({ status: "success", data: result });
    })
);

// Places a candidate into one of their exam's date/time slots and issues the ticket for it.
router.put(
    "/:id/assign-slot",
    asyncHandler(async (req, res) => {
        const examId = Number(req.body.examId);
        const [student] = await query("SELECT id, status, registered_exam_id, exam_id FROM students WHERE id = $1", [req.params.id]);
        if (!student) throw new ApiError(404, "Student not found.");
        const [exam] = await query("SELECT id, standard_id, registered_exam_id FROM exams WHERE id = $1", [examId]);
        if (!exam || !student.registered_exam_id || exam.registered_exam_id !== student.registered_exam_id) {
            throw new ApiError(400, "That slot does not belong to this candidate's exam.");
        }
        const [attempt] = await query("SELECT id FROM exam_attempts WHERE student_id = $1 LIMIT 1", [student.id]);
        if (attempt) throw new ApiError(409, "This candidate has already started an exam, so the slot can't be changed.");

        // Retire tickets for the other slots, then (re)activate or issue the one for this slot.
        await query(
            `UPDATE hall_tickets SET status = 'revoked', seat_number = NULL, seat_lab_id = NULL
             WHERE student_id = $1 AND exam_id != $2 AND status = 'generated'`,
            [student.id, exam.id]
        );
        const [existing] = await query("SELECT id FROM hall_tickets WHERE student_id = $1 AND exam_id = $2", [student.id, exam.id]);
        let ticketId;
        if (existing) {
            await query("UPDATE hall_tickets SET status = 'generated' WHERE id = $1", [existing.id]);
            await query("UPDATE students SET exam_id = $1, updated_at = now() WHERE id = $2", [exam.id, student.id]);
            ticketId = existing.id;
        } else {
            const { created } = await generateHallTickets({ studentIds: [student.id], standardId: exam.standard_id, examId: exam.id });
            ticketId = created[0]?.hallTicketId;
        }

        let emailed = false;
        if (student.status === "allowed" && ticketId) {
            try { await sendHallTicketEmail(ticketId); emailed = true; } catch (error) { console.error("Hall ticket email failed:", error.message); }
        }
        res.json({ status: "success", data: { emailed } });
    })
);

// ---- Verification Desk actions ----
// Allow: gives the candidate exam access (and verifies them if they weren't yet). With Seating
// Arrangement on, the next free seat from their centre's labs is assigned and returned.
router.put(
    "/:id/desk-allow",
    asyncHandler(async (req, res) => {
        const [student] = await query("SELECT id, roll_number, exam_id, centre_id FROM students WHERE id = $1", [req.params.id]);
        if (!student) throw new ApiError(404, "Student not found.");
        if (!student.exam_id) throw new ApiError(400, "This candidate has no hall ticket yet — the exam has not been scheduled for them.");
        const [exam] = await query("SELECT * FROM exams WHERE id = $1", [student.exam_id]);
        if (exam && isDeskNotOpen(exam)) {
            const { opensAt } = deskWindow(exam);
            const when = opensAt ? opensAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "";
            throw new ApiError(403, `Verification desk is not open yet. It opens at ${when}.`, "DESK_NOT_OPEN");
        }
        if (exam && isDeskClosed(exam)) {
            throw new ApiError(403, "Verification desk is closed. This candidate cannot be allowed and is marked Absent.", "DESK_CLOSED");
        }
        let seat = null;
        if (exam?.seat_number_required) {
            seat = await assignSeat(student, exam.id);
        }
        await query(
            `UPDATE students SET status = 'allowed', exam_access_allowed = true, disallow_reason = NULL, marked_absent = false,
                exam_access_allowed_at = COALESCE(exam_access_allowed_at, now()), updated_at = now() WHERE id = $1`,
            [student.id]
        );
        res.json({ status: "success", data: { rollNumber: student.roll_number, seatNumber: seat?.seatNumber ?? null, labName: seat?.labName ?? null } });
    })
);

router.put(
    "/:id/desk-disallow",
    asyncHandler(async (req, res) => {
        const [student] = await query("SELECT id, exam_id FROM students WHERE id = $1", [req.params.id]);
        if (!student) throw new ApiError(404, "Student not found.");
        const reason = String(req.body.reason || "").trim().slice(0, 500);
        if (!reason) throw new ApiError(400, "Please give a reason for disallowing this candidate.");
        await query(
            "UPDATE students SET exam_access_allowed = false, exam_access_allowed_at = NULL, disallow_reason = $2, updated_at = now() WHERE id = $1",
            [student.id, reason]
        );
        if (student.exam_id) await releaseSeat(student.id, student.exam_id);
        res.json({ status: "success", message: "Candidate disallowed." });
    })
);

// Reappear: lets a candidate whose live attempt was interrupted log back in and continue.
router.put(
    "/:id/desk-reappear",
    asyncHandler(async (req, res) => {
        const [student] = await query("SELECT id, exam_id FROM students WHERE id = $1", [req.params.id]);
        if (!student?.exam_id) throw new ApiError(404, "Candidate or exam not found.");
        const [attempt] = await query("SELECT status FROM exam_attempts WHERE student_id = $1 AND exam_id = $2", [student.id, student.exam_id]);
        if (attempt?.status === "submitted") throw new ApiError(400, "This candidate has already submitted the exam.");
        if (!attempt) {
            // Exam not started yet: the candidate may only have selected the roll number on the
            // login page (or be stuck on another PC) - release it so it can be selected again.
            await releaseRollClaim(student.id);
            return res.json({ status: "success", message: "Roll number released." });
        }
        const [existing] = await query(
            "SELECT id FROM reappear_requests WHERE student_id = $1 AND exam_id = $2 AND status = 'pending'",
            [student.id, student.exam_id]
        );
        if (existing) return res.json({ status: "success", message: "Already marked Reappear." });
        await grantReappear(student.id, student.exam_id, "Marked at verification desk");
        res.json({ status: "success", message: "Marked Reappear." });
    })
);

// Live photo captured by the desk camera replaces the candidate's photo.
router.put(
    "/:id/live-photo",
    uploadStudentFiles,
    asyncHandler(async (req, res) => {
        if (!req.files?.photo?.[0]) throw new ApiError(400, "No photo received.");
        const { photoUrl } = await saveStudentUploads(req.params.id, { photo: req.files.photo });
        res.json({ status: "success", data: { photoUrl } });
    })
);

router.put(
    "/:id/allow",
    asyncHandler(async (req, res) => {
        const [student] = await query("SELECT * FROM students WHERE id = $1", [req.params.id]);
        if (!student) throw new ApiError(404, "Student not found.");

        // Auto-marks attendance the moment a student is allowed, so the Attendance log is
        // populated without a separate manual check-in step. COALESCE keeps an existing
        // checked_in_at untouched if this student was somehow allowed more than once.
        await query(
            "UPDATE students SET status = 'allowed', updated_at = now() WHERE id = $1",
            [student.id]
        );

        res.json({
            status: "success",
            message: "Student allowed.",
            data: { rollNumber: student.roll_number, seatNumber: null },
        });
    })
);

router.put(
    "/:id/exam-allow",
    asyncHandler(async (req, res) => {
        const [student] = await query("SELECT id, status, exam_id FROM students WHERE id = $1", [req.params.id]);
        if (!student) throw new ApiError(404, "Student not found.");
        if (student.status !== "allowed") throw new ApiError(400, "Hall-ticket registration must be verified first.");
        if (!student.exam_id) throw new ApiError(400, "Assign an exam to this candidate before granting exam access.");
        const [updated] = await query(
            "UPDATE students SET exam_access_allowed = true, exam_access_allowed_at = now(), updated_at = now() WHERE id = $1 RETURNING exam_access_allowed_at",
            [student.id]
        );
        res.json({ status: "success", message: "Exam access allowed.", data: updated });
    })
);

router.put(
    "/:id/disallow",
    asyncHandler(async (req, res) => {
        const result = await query(
            `UPDATE students SET status = 'pending', exam_access_allowed = false, exam_access_allowed_at = NULL, checked_in_at = NULL, updated_at = now()
             WHERE id = $1 RETURNING id`,
            [req.params.id]
        );
        if (!result.length) throw new ApiError(404, "Student not found.");
        res.json({ status: "success", message: "Student disallowed." });
    })
);

// Exam-day: invigilator marks a student physically present at the exam lab. Record-keeping
// only — does not gate login (a student can log in as soon as `status = 'allowed'`).
router.put(
    "/:id/check-in",
    asyncHandler(async (req, res) => {
        const [student] = await query("SELECT status FROM students WHERE id = $1", [req.params.id]);
        if (!student) throw new ApiError(404, "Student not found.");
        if (student.status !== "allowed") {
            throw new ApiError(400, "Student must be allowed (registration approved) before checking in.");
        }
        await query(
            "UPDATE students SET checked_in_at = now(), updated_at = now() WHERE id = $1",
            [req.params.id]
        );
        res.json({ status: "success", message: "Student checked in." });
    })
);

router.put(
    "/:id/check-out",
    asyncHandler(async (req, res) => {
        const result = await query(
            "UPDATE students SET checked_in_at = NULL, updated_at = now() WHERE id = $1 RETURNING id",
            [req.params.id]
        );
        if (!result.length) throw new ApiError(404, "Student not found.");
        res.json({ status: "success", message: "Check-in undone." });
    })
);

router.post(
    "/bulk-check-in",
    asyncHandler(async (req, res) => {
        const { studentIds } = req.body;
        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            throw new ApiError(400, "studentIds must be a non-empty array.");
        }
        await query(
            `UPDATE students SET checked_in_at = now(), updated_at = now()
             WHERE id = ANY($1::int[]) AND status = 'allowed'`,
            [studentIds]
        );
        res.json({ status: "success", message: "Selected students checked in." });
    })
);

router.post(
    "/bulk-allow",
    asyncHandler(async (req, res) => {
        const { studentIds } = req.body;
        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            throw new ApiError(400, "studentIds must be a non-empty array.");
        }

        await query(
            `UPDATE students SET status = 'allowed', updated_at = now()
             WHERE id = ANY($1::int[])`,
            [studentIds]
        );
        res.json({ status: "success", message: "Selected students allowed." });
    })
);

router.post(
    "/bulk-disallow",
    asyncHandler(async (req, res) => {
        const { studentIds } = req.body;
        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            throw new ApiError(400, "studentIds must be a non-empty array.");
        }
        await query(
            "UPDATE students SET status = 'pending', exam_access_allowed = false, exam_access_allowed_at = NULL, checked_in_at = NULL, updated_at = now() WHERE id = ANY($1::int[])",
            [studentIds]
        );
        res.json({ status: "success", message: "Selected students disallowed." });
    })
);

module.exports = router;
