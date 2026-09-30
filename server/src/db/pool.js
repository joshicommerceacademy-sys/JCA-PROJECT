const { Pool } = require("pg");
require("dotenv").config();

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
