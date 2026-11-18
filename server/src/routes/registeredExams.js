const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

const SELECT_REGISTERED = `
    SELECT r.id, r.name, r.created_at,
           (SELECT COUNT(*) FROM students st WHERE st.registered_exam_id = r.id)::int AS student_count,
           (SELECT e.id FROM exams e WHERE e.registered_exam_id = r.id OR lower(e.name) = lower(r.name) LIMIT 1) AS scheduled_exam_id
    FROM registered_exams r
`;

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const rows = await query(`${SELECT_REGISTERED} ORDER BY r.name`);
        res.json({ status: "success", data: rows });
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const name = String(req.body.name || "").trim();
        if (!name) throw new ApiError(400, "Exam name is required.");
        const [dup] = await query("SELECT id FROM registered_exams WHERE lower(name) = lower($1)", [name]);
        if (dup) throw new ApiError(409, "This exam name is already registered.");
        const [row] = await query("INSERT INTO registered_exams (name) VALUES ($1) RETURNING id", [name]);
        const [created] = await query(`${SELECT_REGISTERED} WHERE r.id = $1`, [row.id]);
        res.status(201).json({ status: "success", data: created });
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const [row] = await query(`${SELECT_REGISTERED} WHERE r.id = $1`, [req.params.id]);
        if (!row) throw new ApiError(404, "Registered exam not found.");
        if (row.scheduled_exam_id) throw new ApiError(409, "This exam is already scheduled — delete it from the Exam Schedule first.");
        if (row.student_count > 0) throw new ApiError(409, `${row.student_count} student(s) are registered for this exam, so it can't be removed.`);
        await query("DELETE FROM registered_exams WHERE id = $1", [req.params.id]);
        res.json({ status: "success", message: "Registered exam removed." });
    })
);

module.exports = router;
