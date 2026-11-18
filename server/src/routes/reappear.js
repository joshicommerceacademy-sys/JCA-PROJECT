const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { grantReappear } = require("../utils/grantReappear");

const router = express.Router();
router.use(requireAdmin);

const SELECT_REAPPEAR = `
    SELECT rr.*, st.roll_number, st.full_name AS student_name, e.name AS exam_name
    FROM reappear_requests rr
    JOIN students st ON st.id = rr.student_id
    JOIN exams e ON e.id = rr.exam_id
`;

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        const clauses = [];
        const params = [];
        if (examId) {
            params.push(examId);
            clauses.push(`rr.exam_id = $${params.length}`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const requests = await query(`${SELECT_REAPPEAR} ${where} ORDER BY rr.id DESC`, params);
        res.json({ status: "success", data: requests });
    })
);

// Candidates reappear can actually apply to: their exam was started (a live attempt exists)
// and never reached a proper submission — i.e. it's still 'in_progress'. A student who never
// started, or who already submitted (for any reason, including an anti-cheat auto-submit),
// is not eligible — that's a completed outcome, not an interruption.
router.get(
    "/eligible",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        if (!examId) throw new ApiError(400, "examId is required.");

        const [exam] = await query("SELECT duration_minutes FROM exams WHERE id = $1", [examId]);
        if (!exam) throw new ApiError(404, "Exam not found.");

        const rows = await query(
            `SELECT st.id, st.roll_number, st.full_name, ea.id AS attempt_id, ea.started_at, ea.ends_at,
                    (SELECT COUNT(*) FROM exam_attempt_answers a WHERE a.attempt_id = ea.id) AS answered_count,
                    (SELECT MAX(a.answered_at) FROM exam_attempt_answers a WHERE a.attempt_id = ea.id) AS last_activity_at
             FROM students st
             JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = st.exam_id
             WHERE st.exam_id = $1 AND st.status = 'allowed' AND ea.status = 'in_progress'
             ORDER BY st.roll_number`,
            [examId]
        );

        const candidates = rows.map((r) => {
            const stopReference = r.last_activity_at || r.started_at;
            const elapsedMinutes = (new Date(stopReference).getTime() - new Date(r.started_at).getTime()) / 60000;
            const detectedRemainingMinutes = Math.max(1, Math.round(exam.duration_minutes - elapsedMinutes));
            const windowExpired = new Date() >= new Date(r.ends_at);
            return { ...r, detected_remaining_minutes: detectedRemainingMinutes, window_expired: windowExpired };
        });

        res.json({ status: "success", data: candidates });
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { studentId, examId, reason } = req.body;
        if (!studentId || !examId) {
            throw new ApiError(400, "studentId and examId are required.");
        }
        const data = await grantReappear(studentId, examId, reason);
        res.status(201).json({ status: "success", message: "Reappear granted.", data });
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const result = await query("DELETE FROM reappear_requests WHERE id = $1 RETURNING id", [req.params.id]);
        if (!result.length) throw new ApiError(404, "Reappear record not found.");
        res.json({ status: "success", message: "Reappear record deleted." });
    })
);

module.exports = router;
