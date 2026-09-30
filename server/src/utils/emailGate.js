const bcrypt = require("bcryptjs");
const { query } = require("../db/pool");
const { ApiError } = require("./asyncHandler");

// Confirmation gate required before any hall-ticket or result email (single or bulk) goes
// out, so nobody fat-fingers a send to the wrong batch of students. Checked against the
// requesting admin's own current login password (not a separately-stored secret) so it
// can never drift out of sync with a password changed from the Settings page.
async function assertConfirmPassword(req, value) {
    const [admin] = await query("SELECT password_hash FROM admin_users WHERE id = $1", [req.admin.id]);
    if (!admin) throw new ApiError(404, "Admin account not found.");

    const valid = await bcrypt.compare(String(value || ""), admin.password_hash);
    if (!valid) {
        throw new ApiError(403, "Incorrect confirmation password.");
    }
}

module.exports = { assertConfirmPassword };
