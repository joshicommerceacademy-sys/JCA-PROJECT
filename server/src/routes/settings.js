const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { getSettings } = require("../utils/settings");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const settings = await getSettings();
        res.json({ status: "success", data: settings });
    })
);

router.put(
    "/",
    asyncHandler(async (req, res) => {
        const {
            seatNumberEnabled, ipCaptureEnabled, registrationAlertEnabled,
            studentLoginEnabled, maxSecurityWarnings, disableCopyEnabled,
        } = req.body;

        if (maxSecurityWarnings !== undefined) {
            const n = Number(maxSecurityWarnings);
            if (!Number.isInteger(n) || n < 0) {
                throw new ApiError(400, "maxSecurityWarnings must be a whole number of 0 or more.");
            }
        }

        const current = await getSettings();
        const [updated] = await query(
            `UPDATE app_settings SET
                seat_number_enabled = $1,
                ip_capture_enabled = $2,
                registration_alert_enabled = $3,
                student_login_enabled = $4,
                max_security_warnings = $5,
                disable_copy_enabled = $6,
                updated_at = now()
             WHERE id = 1 RETURNING *`,
            [
                seatNumberEnabled ?? current.seat_number_enabled,
                ipCaptureEnabled ?? current.ip_capture_enabled,
                registrationAlertEnabled ?? current.registration_alert_enabled,
                studentLoginEnabled ?? current.student_login_enabled,
                maxSecurityWarnings ?? current.max_security_warnings,
                disableCopyEnabled ?? current.disable_copy_enabled,
            ]
        );
        res.json({ status: "success", data: updated });
    })
);

router.put(
    "/password",
    asyncHandler(async (req, res) => {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            throw new ApiError(400, "Current password, new password and confirmation are all required.");
        }
        if (newPassword !== confirmNewPassword) {
            throw new ApiError(400, "New password and confirmation do not match.");
        }
        if (newPassword.length < 6) {
            throw new ApiError(400, "New password must be at least 6 characters.");
        }

        const [admin] = await query("SELECT * FROM admin_users WHERE id = $1", [req.admin.id]);
        if (!admin) throw new ApiError(404, "Admin account not found.");

        const valid = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!valid) throw new ApiError(401, "Current password is incorrect.");

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await query("UPDATE admin_users SET password_hash = $1 WHERE id = $2", [passwordHash, admin.id]);

        res.json({ status: "success", message: "Password updated." });
    })
);

module.exports = router;
