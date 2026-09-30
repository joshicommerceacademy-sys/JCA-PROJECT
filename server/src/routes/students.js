const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { uploadStudentFiles } = require("../middleware/upload");
const { formatDobPassword, nextStudentCode } = require("../utils/idGenerators");
const { sendMail, sendMailBatch } = require("../utils/mailer");
const { getSettings } = require("../utils/settings");

const router = express.Router();
router.use(requireAdmin);

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
           st.exam_id, e.name AS exam_name, st.photo_url, st.signature_url, st.status, st.checked_in_at,
           st.created_at, st.updated_at
    FROM students st
    LEFT JOIN centres c ON c.id = st.centre_id
    LEFT JOIN standards s ON s.id = st.standard_id
    LEFT JOIN exams e ON e.id = st.exam_id
`;

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { examId, status, search } = req.query;
        const clauses = [];
        const params = [];

        if (examId) {
            params.push(examId);
            clauses.push(`st.exam_id = $${params.length}`);
        }
        if (status) {
            params.push(status);
            clauses.push(`st.status = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            clauses.push(`(st.full_name ILIKE $${params.length} OR st.roll_number ILIKE $${params.length})`);
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
        const { fullName, email, phone, dob, gender, address, centreId } = req.body;
        if (!fullName || !email || !phone || !dob || !centreId) {
            throw new ApiError(400, "Full name, email, phone, DOB and centre are required.");
        }

        const [existing] = await query("SELECT id FROM students WHERE email = $1", [email]);
        if (existing) throw new ApiError(409, "A student with this email is already registered.");

        const defaultPassword = formatDobPassword(dob);
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        const photoUrl = req.files?.photo?.[0] ? `/uploads/photos/${req.files.photo[0].filename}` : null;
        const signatureUrl = req.files?.signature?.[0] ? `/uploads/photos/${req.files.signature[0].filename}` : null;

        // Standard and exam are deliberately not collected here — a student registers
        // once and is assigned a standard/exam later, per generated hall ticket, on the
        // Generate Hall Ticket page. roll_number is assigned there too.
        const [student] = await query(
            `INSERT INTO students
                (full_name, email, phone, dob, gender, address, centre_id, photo_url, signature_url, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id, full_name, email, status`,
            [fullName, email, phone, dob, gender || null, address || null, centreId, photoUrl, signatureUrl, passwordHash]
        );

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

router.put(
    "/:id",
    uploadStudentFiles,
    asyncHandler(async (req, res) => {
        const { fullName, phone, gender, address, centreId } = req.body;
        if (!fullName || !centreId) {
            throw new ApiError(400, "Full name and centre are required.");
        }

        const photoUrl = req.files?.photo?.[0] ? `/uploads/photos/${req.files.photo[0].filename}` : undefined;
        const signatureUrl = req.files?.signature?.[0] ? `/uploads/photos/${req.files.signature[0].filename}` : undefined;

        const [student] = await query(
            `UPDATE students SET full_name = $1, phone = $2, gender = $3, address = $4,
                centre_id = $5,
                photo_url = COALESCE($6, photo_url), signature_url = COALESCE($7, signature_url), updated_at = now()
             WHERE id = $8 RETURNING id, roll_number, full_name, status, exam_id`,
            [fullName, phone || null, gender || null, address || null, centreId, photoUrl, signatureUrl, req.params.id]
        );
        if (!student) throw new ApiError(404, "Student not found.");
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

router.put(
    "/:id/allow",
    asyncHandler(async (req, res) => {
        const { seatNumber } = req.body;
        const [student] = await query("SELECT * FROM students WHERE id = $1", [req.params.id]);
        if (!student) throw new ApiError(404, "Student not found.");

        // Exam security: when this student's assigned exam has seat_number_required on, a
        // seat number must be supplied here — the admin can't move them to 'allowed' without
        // individually assigning a seat, rather than a bulk approval carrying no seat info.
        let exam = null;
        if (student.exam_id) {
            [exam] = await query("SELECT id, seat_number_required FROM exams WHERE id = $1", [student.exam_id]);
        }
        if (exam?.seat_number_required && !String(seatNumber || "").trim()) {
            throw new ApiError(400, "This exam requires a seat number — enter one to allow this student.");
        }

        // Auto-marks attendance the moment a student is allowed, so the Attendance log is
        // populated without a separate manual check-in step. COALESCE keeps an existing
        // checked_in_at untouched if this student was somehow allowed more than once.
        await query(
            "UPDATE students SET status = 'allowed', checked_in_at = COALESCE(checked_in_at, now()), updated_at = now() WHERE id = $1",
            [student.id]
        );

        let savedSeatNumber = null;
        if (exam?.seat_number_required) {
            const trimmed = String(seatNumber).trim();
            const [ticket] = await query(
                "UPDATE hall_tickets SET seat_number = $1 WHERE student_id = $2 AND exam_id = $3 RETURNING seat_number",
                [trimmed, student.id, exam.id]
            );
            savedSeatNumber = ticket?.seat_number ?? trimmed;
        }

        res.json({
            status: "success",
            message: "Student allowed.",
            data: { rollNumber: student.roll_number, seatNumber: savedSeatNumber },
        });
    })
);

router.put(
    "/:id/disallow",
    asyncHandler(async (req, res) => {
        const result = await query(
            `UPDATE students SET status = 'pending', checked_in_at = NULL, updated_at = now()
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

        // A bulk approval can't collect an individual seat number per student, so it's
        // refused outright whenever any selected student's exam requires one — the admin
        // must use the per-row Allow (with its seat number field) for those instead.
        const [seatRequiredHit] = await query(
            `SELECT 1 FROM students st JOIN exams e ON e.id = st.exam_id
             WHERE st.id = ANY($1::int[]) AND e.seat_number_required = true LIMIT 1`,
            [studentIds]
        );
        if (seatRequiredHit) {
            throw new ApiError(400, "One or more selected students' exam requires individual seat number assignment — allow them one at a time.");
        }

        await query(
            `UPDATE students SET status = 'allowed', checked_in_at = COALESCE(checked_in_at, now()), updated_at = now()
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
            "UPDATE students SET status = 'pending', checked_in_at = NULL, updated_at = now() WHERE id = ANY($1::int[])",
            [studentIds]
        );
        res.json({ status: "success", message: "Selected students disallowed." });
    })
);

module.exports = router;
