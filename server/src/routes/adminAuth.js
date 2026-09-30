const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const router = express.Router();

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
            throw new ApiError(400, "Email and password are required.");
        }

        const [admin] = await query("SELECT * FROM admin_users WHERE email = $1", [email]);
        if (!admin) {
            throw new ApiError(401, "Invalid email or password.");
        }

        const valid = await bcrypt.compare(password, admin.password_hash);
        if (!valid) {
            throw new ApiError(401, "Invalid email or password.");
        }

        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: "admin" },
            process.env.JWT_SECRET,
            { expiresIn: "12h" }
        );

        res.json({
            status: "success",
            data: {
                token,
                admin: { id: admin.id, email: admin.email, fullName: admin.full_name },
            },
        });
    })
);

module.exports = router;
