const cron = require("node-cron");
const { query } = require("../db/pool");
const { submitAttempt } = require("../utils/submitAttempt");
const { SYNC_GRACE_MINUTES } = require("../utils/attemptSync");

// Safety net for dropped connections: a candidate whose device went offline keeps working, and
// submits (with all locally-held answers) as soon as it is back online. If it never comes back,
// this job finalises the attempt from the answers already saved on the server once the sync
// window after the deadline has passed - so every started exam always ends up with a result.
async function finaliseExpiredAttempts() {
    const rows = await query(
        `SELECT ea.* FROM exam_attempts ea
         WHERE ea.status = 'in_progress'
           AND ea.ends_at < now() - ($1 || ' minutes')::interval`,
        [String(SYNC_GRACE_MINUTES)]
    );
    for (const attempt of rows) {
        try {
            const [exam] = await query("SELECT * FROM exams WHERE id = $1", [attempt.exam_id]);
            if (!exam) continue;
            await submitAttempt(attempt, exam, "timeout");
            console.log(`[SWEEP] Finalised expired attempt ${attempt.id} (exam ${attempt.exam_id}).`);
        } catch (error) {
            console.error(`[SWEEP] Could not finalise attempt ${attempt.id}:`, error.message);
        }
    }
}

function scheduleExpiredAttemptJob() {
    cron.schedule("* * * * *", () => {
        finaliseExpiredAttempts().catch((error) => console.error("[SWEEP] failed:", error.message));
    });
}

module.exports = { scheduleExpiredAttemptJob, finaliseExpiredAttempts };
