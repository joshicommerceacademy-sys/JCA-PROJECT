const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

const SELECT_BANK = `
    SELECT qb.*, s.name AS standard_name,
           (SELECT COUNT(*) FROM questions q WHERE q.bank_id = qb.id) AS question_count
    FROM question_banks qb
    LEFT JOIN standards s ON s.id = qb.standard_id
`;

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const banks = await query(`${SELECT_BANK} ORDER BY qb.id DESC`);
        res.json({ status: "success", data: banks });
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { name, standardId, subject, description, status } = req.body;
        if (!name || !standardId) throw new ApiError(400, "Name and standard are required.");

        const [existing] = await query("SELECT id FROM question_banks WHERE lower(name) = lower($1)", [name]);
        if (existing) throw new ApiError(409, "A question bank with this name already exists.");

        const [bank] = await query(
            `INSERT INTO question_banks (name, standard_id, subject, description, status)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, standardId, subject || null, description || null, status || "draft"]
        );
        res.status(201).json({ status: "success", data: bank });
    })
);

router.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const { name, standardId, subject, description, status } = req.body;
        if (!name || !standardId) throw new ApiError(400, "Name and standard are required.");

        const dup = await query(
            "SELECT id FROM question_banks WHERE lower(name) = lower($1) AND id != $2",
            [name, req.params.id]
        );
        if (dup.length) throw new ApiError(409, "A question bank with this name already exists.");

        const [bank] = await query(
            `UPDATE question_banks SET name = $1, standard_id = $2, subject = $3, description = $4,
                status = $5, updated_at = now() WHERE id = $6 RETURNING *`,
            [name, standardId, subject || null, description || null, status || "draft", req.params.id]
        );
        if (!bank) throw new ApiError(404, "Question bank not found.");
        res.json({ status: "success", data: bank });
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const result = await query("DELETE FROM question_banks WHERE id = $1 RETURNING id", [req.params.id]);
        if (!result.length) throw new ApiError(404, "Question bank not found.");
        res.json({ status: "success", message: "Question bank and its questions deleted." });
    })
);

module.exports = router;
