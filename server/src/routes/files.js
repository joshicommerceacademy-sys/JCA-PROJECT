const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();

// Serves a candidate's photo / signature stored in the database.
router.get(
    "/students/:id/:kind",
    asyncHandler(async (req, res) => {
        const { id, kind } = req.params;
        if (!/^\d+$/.test(id) || !["photo", "signature"].includes(kind)) return res.status(404).end();
        const [row] = await query("SELECT mime, data FROM student_files WHERE student_id = $1 AND kind = $2", [id, kind]);
        if (!row) return res.status(404).end();
        res.set("Content-Type", row.mime);
        res.set("Cache-Control", "private, max-age=3600");
        res.send(row.data);
    })
);

module.exports = router;
