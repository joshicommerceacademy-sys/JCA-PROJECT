const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const standards = await query("SELECT * FROM standards ORDER BY id ASC");
        res.json({ status: "success", data: standards });
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { name, code, description, status } = req.body;
        if (!name || !code) throw new ApiError(400, "Name and code are required.");

        const [existing] = await query("SELECT id FROM standards WHERE code = $1", [code.toUpperCase()]);
        if (existing) throw new ApiError(409, "A standard with this code already exists.");

        const [standard] = await query(
            `INSERT INTO standards (name, code, description, status) VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, code.toUpperCase(), description || "Not Provided", status || "active"]
        );
        res.status(201).json({ status: "success", data: standard });
    })
);

router.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const { name, code, description, status } = req.body;
        if (!name || !code) throw new ApiError(400, "Name and code are required.");

        const dup = await query(
            "SELECT id FROM standards WHERE code = $1 AND id != $2",
            [code.toUpperCase(), req.params.id]
        );
        if (dup.length) throw new ApiError(409, "A standard with this code already exists.");

        const [standard] = await query(
            `UPDATE standards SET name = $1, code = $2, description = $3, status = $4, updated_at = now()
             WHERE id = $5 RETURNING *`,
            [name, code.toUpperCase(), description || "Not Provided", status || "active", req.params.id]
        );
        if (!standard) throw new ApiError(404, "Standard not found.");
        res.json({ status: "success", data: standard });
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const result = await query("DELETE FROM standards WHERE id = $1 RETURNING id", [req.params.id]);
        if (!result.length) throw new ApiError(404, "Standard not found.");
        res.json({ status: "success", message: "Standard deleted." });
    })
);

module.exports = router;
