const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { buildResultPdf } = require("../utils/resultPdf");
const { sendMail, sendMailBatch } = require("../utils/mailer");
const { assertConfirmPassword } = require("../utils/emailGate");
const { buildSubjectBreakdown } = require("../utils/subjectBreakdown");

const router = express.Router();
router.use(requireAdmin);

const SELECT_RESULT = `
    SELECT ea.*, st.roll_number, st.full_name AS student_name, st.email, st.centre_id, c.name AS centre_name,
           st.standard_id, s.name AS standard_name, st.photo_url, e.name AS exam_name
    FROM exam_attempts ea
    JOIN students st ON st.id = ea.student_id
    JOIN exams e ON e.id = ea.exam_id
    LEFT JOIN centres c ON c.id = st.centre_id
    LEFT JOIN standards s ON s.id = st.standard_id
    WHERE ea.status = 'submitted'
`;

async function loadAnswers(attemptId) {
    return query(
        `SELECT eaa.*, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
                q.correct_answer, q.marks AS question_marks
         FROM exam_attempt_answers eaa
         JOIN questions q ON q.id = eaa.question_id
         WHERE eaa.attempt_id = $1
         ORDER BY q.id`,
        [attemptId]
    );
}

// Deliberately minimal: the body only ever states the percentage. The full breakdown
// (per-question correctness, per-subject marks) stays inside the attached PDF, which the
// student has to actually open rather than see at a glance in their inbox.
function resultEmailHtml({ studentName, examName, percentage }) {
    return `
        <p>Dear ${studentName},</p>
        <p>Your result for <strong>${examName}</strong> has been declared.</p>
        <p><strong>Percentage: ${percentage}%</strong></p>
        <p>Your full result and answer sheet are attached as a PDF.</p>
        <p>Joshi's Commerce Academy</p>
    `;
}

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { examId, centreId, resultStatus, search } = req.query;
        const clauses = [];
        const params = [];

        if (examId) {
            params.push(examId);
            clauses.push(`ea.exam_id = $${params.length}`);
        }
        if (centreId) {
            params.push(centreId);
            clauses.push(`st.centre_id = $${params.length}`);
        }
        if (resultStatus) {
            params.push(resultStatus);
            clauses.push(`ea.result_status = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            clauses.push(`(st.full_name ILIKE $${params.length} OR st.roll_number ILIKE $${params.length})`);
        }

        const extra = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
        const results = await query(
            `${SELECT_RESULT} ${extra} ORDER BY ea.submitted_at DESC`,
            params
        );
        res.json({ status: "success", data: results });
    })
);

router.get(
    "/:id",
    asyncHandler(async (req, res) => {
        const [result] = await query(`${SELECT_RESULT} AND ea.id = $1`, [req.params.id]);
        if (!result) throw new ApiError(404, "Result not found.");

        const answers = await loadAnswers(req.params.id);
        const subjects = await buildSubjectBreakdown(result.id, result.exam_id);

        res.json({ status: "success", data: { ...result, answers, subjects } });
    })
);

router.get(
    "/:id/pdf",
    asyncHandler(async (req, res) => {
        const [result] = await query(`${SELECT_RESULT} AND ea.id = $1`, [req.params.id]);
        if (!result) throw new ApiError(404, "Result not found.");

        const answers = await loadAnswers(req.params.id);
        const pdfBuffer = await buildResultPdf(result, answers);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="Result-${result.roll_number}.pdf"`);
        res.send(pdfBuffer);
    })
);

router.post(
    "/:id/send",
    asyncHandler(async (req, res) => {
        await assertConfirmPassword(req, req.body.confirmPassword);

        const [result] = await query(`${SELECT_RESULT} AND ea.id = $1`, [req.params.id]);
        if (!result) throw new ApiError(404, "Result not found.");

        const answers = await loadAnswers(req.params.id);
        const pdfBuffer = await buildResultPdf(result, answers);

        await sendMail({
            to: result.email,
            subject: `Result Declared — ${result.exam_name}`,
            html: resultEmailHtml({
                studentName: result.student_name,
                examName: result.exam_name,
                percentage: result.percentage,
            }),
            attachments: [{ filename: `Result-${result.roll_number}.pdf`, content: pdfBuffer }],
            type: "result_notification",
        });
        await query("UPDATE exam_attempts SET result_sent_at = now() WHERE id = $1", [result.id]);

        res.json({ status: "success", message: "Result emailed." });
    })
);

router.post(
    "/bulk-send",
    asyncHandler(async (req, res) => {
        await assertConfirmPassword(req, req.body.confirmPassword);

        const { resultIds } = req.body;
        if (!Array.isArray(resultIds) || resultIds.length === 0) {
            throw new ApiError(400, "resultIds must be a non-empty array.");
        }

        const results = await query(`${SELECT_RESULT} AND ea.id = ANY($1::int[])`, [resultIds]);

        const { succeeded, failed } = await sendMailBatch(results, async (result) => {
            const answers = await loadAnswers(result.id);
            const pdfBuffer = await buildResultPdf(result, answers);
            await sendMail({
                to: result.email,
                subject: `Result Declared — ${result.exam_name}`,
                html: resultEmailHtml({
                    studentName: result.student_name,
                    examName: result.exam_name,
                    percentage: result.percentage,
                    resultStatus: result.result_status,
                }),
                attachments: [{ filename: `Result-${result.roll_number}.pdf`, content: pdfBuffer }],
                type: "result_notification",
            });
            await query("UPDATE exam_attempts SET result_sent_at = now() WHERE id = $1", [result.id]);
        });

        res.json({
            status: "success",
            message: `Sent ${succeeded.length}/${results.length} result email(s).`,
            data: {
                sentCount: succeeded.length,
                failedCount: failed.length,
                failed: failed.map(({ item, error }) => ({
                    resultId: item.id,
                    studentName: item.student_name,
                    email: item.email,
                    error,
                })),
            },
        });
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const result = await query("DELETE FROM exam_attempts WHERE id = $1 RETURNING id", [req.params.id]);
        if (!result.length) throw new ApiError(404, "Result not found.");
        res.json({ status: "success", message: "Result deleted." });
    })
);

module.exports = router;
