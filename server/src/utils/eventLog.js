const { query } = require("../db/pool");

// Internal record of exam events that cannot be rebuilt from other tables. Used only by the
// Activity Log PDF. Never throws.
async function logExamEvent({ examId, studentId = null, type, detail = null, ip = null }) {
    try {
        await query(
            "INSERT INTO exam_event_log (exam_id, student_id, event_type, detail, ip_address) VALUES ($1, $2, $3, $4, $5)",
            [examId || null, studentId, type, detail, ip]
        );
    } catch (error) {
        console.error("[EVENT] could not log:", error.message);
    }
}

module.exports = { logExamEvent };
