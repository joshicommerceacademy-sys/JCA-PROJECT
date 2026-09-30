const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");

async function migrate() {
    const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    console.log("Running migrations against Neon Postgres...");
    try {
        await pool.query(sql);
        console.log("Migration complete.");
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

migrate();
