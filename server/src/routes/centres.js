const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const centres = await query(
            `SELECT c.*,
                    COALESCE((SELECT SUM(l.capacity) FROM centre_labs l WHERE l.centre_id = c.id), 0)::int AS total_capacity,
                    COALESCE((SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'capacity', l.capacity,
                                'seats', COALESCE((SELECT json_agg(s.seat_number ORDER BY length(s.seat_number), s.seat_number) FROM lab_seats s WHERE s.lab_id = l.id), '[]'::json)) ORDER BY l.name)
                              FROM centre_labs l WHERE l.centre_id = c.id), '[]'::json) AS labs
             FROM centres c ORDER BY c.id DESC`
        );
        res.json({ status: "success", data: centres });
    })
);

// ---- Labs (each lab has a seat capacity) ----
function parseLab(body) {
    const name = String(body.name || "").trim();
    const capacity = Number(body.capacity);
    if (!name) throw new ApiError(400, "Lab name is required.");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000) {
        throw new ApiError(400, "Capacity must be a whole number between 1 and 5000.");
    }
    return { name, capacity };
}

router.post(
    "/:id/labs",
    asyncHandler(async (req, res) => {
        const { name, capacity } = parseLab(req.body);
        const [centre] = await query("SELECT id FROM centres WHERE id = $1", [req.params.id]);
        if (!centre) throw new ApiError(404, "Centre not found.");
        const [dup] = await query("SELECT id FROM centre_labs WHERE centre_id = $1 AND lower(name) = lower($2)", [req.params.id, name]);
        if (dup) throw new ApiError(409, "This centre already has a lab with that name.");
        const [lab] = await query(
            "INSERT INTO centre_labs (centre_id, name, capacity) VALUES ($1, $2, $3) RETURNING *",
            [req.params.id, name, capacity]
        );
        res.status(201).json({ status: "success", data: lab });
    })
);

router.put(
    "/labs/:labId",
    asyncHandler(async (req, res) => {
        const { name, capacity } = parseLab(req.body);
        const [existing] = await query("SELECT centre_id FROM centre_labs WHERE id = $1", [req.params.labId]);
        if (!existing) throw new ApiError(404, "Lab not found.");
        const [dup] = await query(
            "SELECT id FROM centre_labs WHERE centre_id = $1 AND lower(name) = lower($2) AND id != $3",
            [existing.centre_id, name, req.params.labId]
        );
        if (dup) throw new ApiError(409, "This centre already has a lab with that name.");
        const [lab] = await query(
            "UPDATE centre_labs SET name = $1, capacity = $2 WHERE id = $3 RETURNING *",
            [name, capacity, req.params.labId]
        );
        res.json({ status: "success", data: lab });
    })
);

// "Add Seat Number": accepts a single number, a comma list, or ranges, e.g. "1-30, 35, A1".
function parseSeats(input) {
    const out = [];
    for (const part of String(input || "").split(",").map((p) => p.trim()).filter(Boolean)) {
        const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (range) {
            const from = Number(range[1]);
            const to = Number(range[2]);
            if (to < from || to - from > 2000) throw new ApiError(400, `Invalid range "${part}".`);
            for (let n = from; n <= to; n++) out.push(String(n));
        } else {
            out.push(part.slice(0, 40));
        }
    }
    return [...new Set(out)];
}

router.post(
    "/labs/:labId/seats",
    asyncHandler(async (req, res) => {
        const [lab] = await query("SELECT id FROM centre_labs WHERE id = $1", [req.params.labId]);
        if (!lab) throw new ApiError(404, "Lab not found.");
        const seats = parseSeats(req.body.seatNumbers);
        if (!seats.length) throw new ApiError(400, "Enter at least one seat number.");
        let added = 0;
        for (const seat of seats) {
            const r = await query(
                "INSERT INTO lab_seats (lab_id, seat_number) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id",
                [lab.id, seat]
            );
            added += r.length;
        }
        res.status(201).json({ status: "success", message: `Added ${added} seat(s).`, data: { added } });
    })
);

router.delete(
    "/labs/:labId/seats/:seatNumber",
    asyncHandler(async (req, res) => {
        const result = await query(
            "DELETE FROM lab_seats WHERE lab_id = $1 AND seat_number = $2 RETURNING id",
            [req.params.labId, req.params.seatNumber]
        );
        if (!result.length) throw new ApiError(404, "Seat not found.");
        res.json({ status: "success", message: "Seat removed." });
    })
);

router.delete(
    "/labs/:labId",
    asyncHandler(async (req, res) => {
        const result = await query("DELETE FROM centre_labs WHERE id = $1 RETURNING id", [req.params.labId]);
        if (!result.length) throw new ApiError(404, "Lab not found.");
        res.json({ status: "success", message: "Lab deleted." });
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
