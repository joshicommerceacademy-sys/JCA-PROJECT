const { Pool, types } = require("pg");
require("dotenv").config();

// PostgreSQL DATE values are calendar dates, not moments in time. Keep them as
// YYYY-MM-DD strings so exam dates never shift because of timezone conversion.
types.setTypeParser(1082, (value) => value);

if (!process.env.DATABASE_URL) {
    console.warn(
        "WARNING: DATABASE_URL is not set. Add your Neon connection string to server/.env"
    );
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
});

async function query(text, params) {
    const result = await pool.query(text, params);
    return result.rows;
}

module.exports = { pool, query };
