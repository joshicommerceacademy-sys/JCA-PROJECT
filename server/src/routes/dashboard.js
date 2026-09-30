const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/stats",
    asyncHandler(async (req, res) => {
        const [
            [{ count: totalStudents }],
            [{ count: allowedStudents }],
            [{ count: pendingStudents }],
            [{ count: totalQuestions }],
            [{ count: totalExams }],
            [{ count: totalResults }],
            [{ avg: avgPercentage }],
        ] = await Promise.all([
            query("SELECT COUNT(*) FROM students"),
            query("SELECT COUNT(*) FROM students WHERE status = 'allowed'"),
            query("SELECT COUNT(*) FROM students WHERE status = 'pending'"),
            query("SELECT COUNT(*) FROM questions WHERE status = 'published'"),
            query("SELECT COUNT(*) FROM exams"),
            query("SELECT COUNT(*) FROM exam_attempts WHERE status = 'submitted'"),
            query("SELECT AVG(percentage) FROM exam_attempts WHERE status = 'submitted'"),
        ]);

        const recentStudents = await query(
            `SELECT id, roll_number, full_name, status, created_at FROM students ORDER BY id DESC LIMIT 5`
        );
        const upcomingExams = await query(
            `SELECT id, name, exam_date, start_time, status FROM exams
             WHERE status IN ('upcoming', 'ongoing') ORDER BY exam_date ASC LIMIT 5`
        );

        res.json({
            status: "success",
            data: {
                totalStudents: Number(totalStudents),
                allowedStudents: Number(allowedStudents),
                pendingStudents: Number(pendingStudents),
                totalQuestions: Number(totalQuestions),
                totalExams: Number(totalExams),
                totalResults: Number(totalResults),
                averagePercentage: avgPercentage ? Number(avgPercentage).toFixed(1) : "0.0",
                recentStudents,
                upcomingExams,
            },
        });
    })
);

module.exports = router;
