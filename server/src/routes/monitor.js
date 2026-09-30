const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        if (!examId) throw new ApiError(400, "examId is required.");

        const [exam] = await query(
            `SELECT e.*, (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS question_count_actual
             FROM exams e WHERE e.id = $1`,
            [examId]
        );
        if (!exam) throw new ApiError(404, "Exam not found.");

        const candidates = await query(
            `SELECT st.id, st.roll_number, st.full_name, c.name AS centre_name, s.name AS standard_name,
                    st.checked_in_at, ea.started_at, ea.ends_at, ea.status AS attempt_status,
                    ea.submitted_at, ea.submit_reason, ea.ip_address,
                    (SELECT COUNT(*) FROM exam_attempt_answers a WHERE a.attempt_id = ea.id) AS answered_count
             FROM students st
             LEFT JOIN centres c ON c.id = st.centre_id
             LEFT JOIN standards s ON s.id = st.standard_id
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = st.exam_id
             WHERE st.status = 'allowed' AND st.exam_id = $1
             ORDER BY st.roll_number`,
            [examId]
        );

        res.json({
            status: "success",
            data: {
                exam: {
                    id: exam.id,
                    name: exam.name,
                    examDate: exam.exam_date,
                    startTime: exam.start_time,
                    durationMinutes: exam.duration_minutes,
                    questionCount: Number(exam.question_count_actual),
                    status: exam.status,
                },
                candidates,
            },
        });
    })
);

module.exports = router;
