const { query } = require("../db/pool");

// The settings row is seeded by schema.sql (id=1), but queried fresh each call rather than
// cached in-process — this is an admin-facing config panel with negligible read volume, and
// a fresh read means a setting change takes effect on the very next request everywhere
// (student login, attempt start, hall-ticket generation) with no cache-invalidation to manage.
async function getSettings() {
    const [settings] = await query("SELECT * FROM app_settings WHERE id = 1");
    return settings;
}

module.exports = { getSettings };
