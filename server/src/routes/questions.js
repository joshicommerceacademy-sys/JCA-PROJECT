const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

const SELECT_QUESTION = `
    SELECT q.*, qb.name AS bank_name, qb.subject, s.name AS standard_name
    FROM questions q
    JOIN question_banks qb ON qb.id = q.bank_id
    LEFT JOIN standards s ON s.id = qb.standard_id
`;

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { bankId, standardId, subject, status, search, difficulty } = req.query;
        const clauses = [];
        const params = [];

        if (bankId) {
            params.push(bankId);
            clauses.push(`q.bank_id = $${params.length}`);
        }
        if (standardId) {
            params.push(standardId);
            clauses.push(`qb.standard_id = $${params.length}`);
        }
        if (subject) {
            params.push(subject);
            clauses.push(`qb.subject = $${params.length}`);
        }
        if (status) {
            params.push(status);
            clauses.push(`q.status = $${params.length}`);
        }
        if (difficulty) {
            params.push(difficulty);
            clauses.push(`q.difficulty = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            clauses.push(`q.question_text ILIKE $${params.length}`);
        }

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const questions = await query(`${SELECT_QUESTION} ${where} ORDER BY q.id DESC`, params);
        res.json({ status: "success", data: questions });
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const {
            bankId, questionText, optionA, optionB, optionC, optionD,
            correctAnswer, marks, difficulty, status, explanation,
        } = req.body;

        if (!bankId || !questionText || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
            throw new ApiError(400, "Question text, all four options, bank and correct answer are required.");
        }

        const [existing] = await query(
            "SELECT id FROM questions WHERE lower(question_text) = lower($1)",
            [questionText]
        );
        if (existing) throw new ApiError(409, "An identical question already exists.");

        const [question] = await query(
            `INSERT INTO questions
                (bank_id, question_text, option_a, option_b, option_c, option_d,
                 correct_answer, marks, difficulty, status, explanation)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [
                bankId, questionText, optionA, optionB, optionC, optionD,
                correctAnswer, marks || 2, difficulty || "medium", status || "published",
                explanation || null,
            ]
        );
        res.status(201).json({ status: "success", data: question });
    })
);

router.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const {
            questionText, optionA, optionB, optionC, optionD,
            correctAnswer, marks, difficulty, status, explanation,
        } = req.body;

        if (!questionText || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
            throw new ApiError(400, "Question text, all four options and correct answer are required.");
        }

        const [question] = await query(
            `UPDATE questions SET question_text = $1, option_a = $2, option_b = $3, option_c = $4,
                option_d = $5, correct_answer = $6, marks = $7, difficulty = $8, status = $9,
                explanation = $10, updated_at = now()
             WHERE id = $11 RETURNING *`,
            [
                questionText, optionA, optionB, optionC, optionD, correctAnswer,
                marks || 2, difficulty || "medium", status || "published", explanation || null,
                req.params.id,
            ]
        );
        if (!question) throw new ApiError(404, "Question not found.");
        res.json({ status: "success", data: question });
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const result = await query("DELETE FROM questions WHERE id = $1 RETURNING id", [req.params.id]);
        if (!result.length) throw new ApiError(404, "Question not found.");
        res.json({ status: "success", message: "Question deleted." });
    })
);

router.post(
    "/bulk-status",
    asyncHandler(async (req, res) => {
        const { questionIds, status } = req.body;
        if (!Array.isArray(questionIds) || questionIds.length === 0) {
            throw new ApiError(400, "questionIds must be a non-empty array.");
        }
        if (!["draft", "published"].includes(status)) throw new ApiError(400, "Invalid status.");

        await query(
            "UPDATE questions SET status = $1, updated_at = now() WHERE id = ANY($2::int[])",
            [status, questionIds]
        );
        res.json({ status: "success", message: `${questionIds.length} question(s) updated.` });
    })
);

router.post(
    "/bulk-delete",
    asyncHandler(async (req, res) => {
        const { questionIds } = req.body;
        if (!Array.isArray(questionIds) || questionIds.length === 0) {
            throw new ApiError(400, "questionIds must be a non-empty array.");
        }
        const result = await query("DELETE FROM questions WHERE id = ANY($1::int[]) RETURNING id", [questionIds]);
        res.json({ status: "success", message: `${result.length} question(s) deleted.` });
    })
);

// Bulk paste/CSV import into one bank — validates each row the same way the single-question
// POST / does, skips exact-duplicate question text instead of failing the whole batch, and
// reports created/skipped counts (same shape as hallTickets.js's bulk-send).
router.post(
    "/bulk-import",
    asyncHandler(async (req, res) => {
        const { bankId, rows } = req.body;
        if (!bankId) throw new ApiError(400, "bankId is required.");
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new ApiError(400, "rows must be a non-empty array.");
        }

        const created = [];
        const skipped = [];

        for (const [index, row] of rows.entries()) {
            const {
                questionText, optionA, optionB, optionC, optionD,
                correctAnswer, marks, difficulty, explanation,
            } = row;

            if (!questionText || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
                skipped.push({ row: index + 1, reason: "Missing question text, an option, or the correct answer." });
                continue;
            }
            if (!["A", "B", "C", "D"].includes(String(correctAnswer).toUpperCase())) {
                skipped.push({ row: index + 1, reason: "Correct answer must be A, B, C or D." });
                continue;
            }

            const [existing] = await query(
                "SELECT id FROM questions WHERE lower(question_text) = lower($1)",
                [questionText]
            );
            if (existing) {
                skipped.push({ row: index + 1, reason: "An identical question already exists." });
                continue;
            }

            const [question] = await query(
                `INSERT INTO questions
                    (bank_id, question_text, option_a, option_b, option_c, option_d,
                     correct_answer, marks, difficulty, status, explanation)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', $10) RETURNING id`,
                [
                    bankId, questionText, optionA, optionB, optionC, optionD,
                    String(correctAnswer).toUpperCase(), Number(marks) || 2, difficulty || "medium",
                    explanation || null,
                ]
            );
            created.push(question.id);
        }

        res.status(201).json({
            status: "success",
            message: `Imported ${created.length} question(s), skipped ${skipped.length}.`,
            data: { createdCount: created.length, skipped },
        });
    })
);

module.exports = router;
