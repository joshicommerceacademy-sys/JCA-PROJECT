const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

// Empirical difficulty from real attempts — not a prediction. A question with a low correct
// rate across everyone who actually answered it is, by definition, the hard one.
function difficultyLabel(correctRate) {
    if (correctRate === null) return "unattempted";
    if (correctRate >= 70) return "easy";
    if (correctRate >= 40) return "medium";
    return "hard";
}

router.get(
    "/exam/:examId",
    asyncHandler(async (req, res) => {
        const { examId } = req.params;
        const [exam] = await query("SELECT id, name FROM exams WHERE id = $1", [examId]);
        if (!exam) throw new ApiError(404, "Exam not found.");

        const [summary] = await query(
            `SELECT
                COUNT(*) AS participant_count,
                ROUND(AVG(percentage)::numeric, 2) AS avg_percentage,
                (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY percentage))::numeric(5,2) AS median_percentage,
                MAX(percentage) AS highest_percentage,
                MIN(percentage) AS lowest_percentage,
                COUNT(*) FILTER (WHERE result_status = 'passed') AS passed_count
             FROM exam_attempts WHERE exam_id = $1 AND status = 'submitted'`,
            [examId]
        );

        const questionStats = await query(
            `SELECT q.id, q.question_text, q.marks, qb.subject,
                    COUNT(a.attempt_id) AS attempted_count,
                    COUNT(a.attempt_id) FILTER (WHERE a.is_correct = true) AS correct_count,
                    COUNT(a.attempt_id) FILTER (WHERE a.is_correct = false) AS wrong_count
             FROM exam_questions eq
             JOIN questions q ON q.id = eq.question_id
             LEFT JOIN question_banks qb ON qb.id = q.bank_id
             LEFT JOIN exam_attempt_answers a
                 ON a.question_id = q.id
                AND a.attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = $1 AND status = 'submitted')
             WHERE eq.exam_id = $1
             GROUP BY q.id, q.question_text, q.marks, qb.subject
             ORDER BY q.id`,
            [examId]
        );

        const questionDifficulty = questionStats.map((q) => {
            const attempted = Number(q.attempted_count);
            const correct = Number(q.correct_count);
            const correctRate = attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : null;
            return {
                id: q.id,
                questionText: q.question_text,
                subject: q.subject,
                marks: q.marks,
                attemptedCount: attempted,
                correctCount: correct,
                wrongCount: Number(q.wrong_count),
                correctRate,
                difficulty: difficultyLabel(correctRate),
            };
        });

        const bySubject = new Map();
        for (const q of questionDifficulty) {
            const key = q.subject || "Unspecified";
            if (!bySubject.has(key)) bySubject.set(key, { correct: 0, attempted: 0 });
            const entry = bySubject.get(key);
            entry.correct += q.correctCount;
            entry.attempted += q.attemptedCount;
        }
        const weakSubjects = [...bySubject.entries()]
            .map(([subject, { correct, attempted }]) => ({
                subject,
                attempted,
                correctRate: attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : null,
            }))
            .filter((s) => s.attempted > 0)
            .sort((a, b) => a.correctRate - b.correctRate);

        res.json({
            status: "success",
            data: {
                exam: { id: exam.id, name: exam.name },
                summary: {
                    participantCount: Number(summary.participant_count),
                    avgPercentage: summary.avg_percentage !== null ? Number(summary.avg_percentage) : null,
                    medianPercentage: summary.median_percentage !== null ? Number(summary.median_percentage) : null,
                    highestPercentage: summary.highest_percentage !== null ? Number(summary.highest_percentage) : null,
                    lowestPercentage: summary.lowest_percentage !== null ? Number(summary.lowest_percentage) : null,
                    passRate:
                        Number(summary.participant_count) > 0
                            ? Math.round((Number(summary.passed_count) / Number(summary.participant_count)) * 1000) / 10
                            : null,
                },
                questionDifficulty,
                weakSubjects,
            },
        });
    })
);

// Batch = standard. Aggregates across every exam a standard's students have taken, so admins
// can compare cohorts (e.g. "11th Commerce" vs "B.Com") rather than one exam at a time.
router.get(
    "/batches",
    asyncHandler(async (req, res) => {
        const rows = await query(
            `SELECT s.id AS standard_id, s.name AS standard_name,
                    COUNT(ea.id) AS attempt_count,
                    ROUND(AVG(ea.percentage)::numeric, 2) AS avg_percentage,
                    COUNT(ea.id) FILTER (WHERE ea.result_status = 'passed') AS passed_count
             FROM standards s
             LEFT JOIN students st ON st.standard_id = s.id
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.status = 'submitted'
             GROUP BY s.id, s.name
             ORDER BY s.name`
        );

        const batches = rows.map((r) => {
            const attemptCount = Number(r.attempt_count);
            return {
                standardId: r.standard_id,
                standardName: r.standard_name,
                attemptCount,
                avgPercentage: r.avg_percentage !== null ? Number(r.avg_percentage) : null,
                passRate: attemptCount > 0 ? Math.round((Number(r.passed_count) / attemptCount) * 1000) / 10 : null,
            };
        });

        res.json({ status: "success", data: batches });
    })
);

module.exports = router;
