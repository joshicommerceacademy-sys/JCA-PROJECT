const express = require("express");
const jwt = require("jsonwebtoken");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { deskLogins, isDeskClosed, deskWindow } = require("../utils/deskUser");
const { requireAdminOrDesk } = require("../middleware/auth");

function requireDesk(req, res, next) {
    requireAdminOrDesk(req, res, () => {
        if (!req.desk) return res.status(403).json({ status: "error", message: "Verification desk access required." });
        next();
    });
}

const router = express.Router();

// Verification Desk login: user ID = first 5 characters of the exam name + "verify", password =
// that exam's access password. The token is scoped to that one exam (see middleware/auth.js).
router.post(
    "/",
    asyncHandler(async (req, res) => {
        const userId = String(req.body.userId || "").trim().toLowerCase();
        const password = String(req.body.password || "").trim();
        if (!userId || !password) throw new ApiError(400, "User ID and password are required.");

        const exams = await query("SELECT * FROM exams WHERE access_password IS NOT NULL AND status != 'cancelled'");
        const centreRows = await query(
            `SELECT ec.exam_id, c.id, c.name, c.code FROM exam_centres ec JOIN centres c ON c.id = ec.centre_id ORDER BY c.name`
        );
        let exam = null;
        let login = null;
        for (const e of exams) {
            if (e.access_password !== password) continue;
            const centres = centreRows.filter((r) => r.exam_id === e.id);
            login = deskLogins(e, centres).find((l) => l.userId.toLowerCase() === userId);
            if (login) { exam = e; break; }
        }
        if (!exam) throw new ApiError(401, "Invalid user ID or password.");

        const token = jwt.sign(
            { role: "desk", userId: login.userId, examId: exam.id, registeredExamId: exam.registered_exam_id || null, centreId: login.centreId || null },
            process.env.JWT_SECRET,
            { expiresIn: "12h" }
        );
        await query(
            `INSERT INTO desk_sessions (exam_id, user_id) VALUES ($1, $2)
             ON CONFLICT (exam_id, user_id) DO UPDATE SET last_login_at = now(), last_seen_at = now()`,
            [exam.id, login.userId]
        );
        res.json({
            status: "success",
            data: {
                token,
                exam: {
                    id: exam.id,
                    name: exam.name,
                    standard_id: exam.standard_id,
                    seat_number_required: exam.seat_number_required,
                    live_photo_capture: exam.live_photo_capture,
                    show_photo_signature: exam.show_photo_signature,
                    exam_date: exam.exam_date,
                    start_time: exam.start_time,
                    desk_centre: login.centreId ? { id: login.centreId, name: login.centreName, code: login.centreCode } : null,
                },
            },
        });
    })
);

// Fresh exam settings for the desk (Seating Arrangement / Live Photo Capture can change after sign-in).
router.get(
    "/exam",
    requireDesk,
    asyncHandler(async (req, res) => {
        const [exam] = await query(
            "SELECT * FROM exams WHERE id = $1",
            [req.desk.examId]
        );
        if (!exam) throw new ApiError(404, "Exam not found.");
        const slots = await query(
            `SELECT id, exam_date, start_time, verification_open_minutes, verification_close_minutes FROM exams
             WHERE id = $1 OR ($2::int IS NOT NULL AND registered_exam_id = $2 AND status != 'cancelled')
             ORDER BY exam_date, start_time`,
            [exam.id, exam.registered_exam_id || null]
        );
        const slotsWithState = slots.map((s) => {
            const w = deskWindow(s);
            return { id: s.id, exam_date: s.exam_date, start_time: s.start_time, desk_state: w.state, desk_opens_at: w.opensAt, desk_closes_at: w.closesAt };
        });
        res.json({
            status: "success",
            data: {
                slots: slotsWithState,
                id: exam.id,
                name: exam.name,
                standard_id: exam.standard_id,
                seat_number_required: exam.seat_number_required,
                live_photo_capture: exam.live_photo_capture,
                show_photo_signature: exam.show_photo_signature,
                desk_closed: isDeskClosed(exam),
                exam_date: exam.exam_date,
                start_time: exam.start_time,
            },
        });
    })
);

module.exports = router;
