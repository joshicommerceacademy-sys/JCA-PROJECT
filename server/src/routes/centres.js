const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const centres = await query("SELECT * FROM centres ORDER BY id DESC");
        res.json({ status: "success", data: centres });
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { name, code, address, city, status } = req.body;
        if (!name || !code) throw new ApiError(400, "Name and code are required.");

        const [existing] = await query("SELECT id FROM centres WHERE code = $1", [code.toUpperCase()]);
        if (existing) throw new ApiError(409, "A centre with this code already exists.");

        const [centre] = await query(
            `INSERT INTO centres (name, code, address, city, status) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, code.toUpperCase(), address || "Not Provided", city || null, status || "active"]
        );
        res.status(201).json({ status: "success", data: centre });
    })
);

router.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const { name, code, address, city, status } = req.body;
        if (!name || !code) throw new ApiError(400, "Name and code are required.");

        const dup = await query(
            "SELECT id FROM centres WHERE code = $1 AND id != $2",
            [code.toUpperCase(), req.params.id]
        );
        if (dup.length) throw new ApiError(409, "A centre with this code already exists.");

        const [centre] = await query(
            `UPDATE centres SET name = $1, code = $2, address = $3, city = $4, status = $5, updated_at = now()
             WHERE id = $6 RETURNING *`,
            [name, code.toUpperCase(), address || "Not Provided", city || null, status || "active", req.params.id]
        );
        if (!centre) throw new ApiError(404, "Centre not found.");
        res.json({ status: "success", data: centre });
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const result = await query("DELETE FROM centres WHERE id = $1 RETURNING id", [req.params.id]);
        if (!result.length) throw new ApiError(404, "Centre not found.");
        res.json({ status: "success", message: "Centre deleted." });
    })
);

module.exports = router;
