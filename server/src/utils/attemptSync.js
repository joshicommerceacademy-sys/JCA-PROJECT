const { query } = require("../db/pool");

// How long after an attempt's deadline the server still waits for a device that lost its
// connection to report its locally-held answers before it finalises the attempt from whatever
// has already been saved. Env-configurable.
const SYNC_GRACE_MINUTES = Number(process.env.OFFLINE_SYNC_GRACE_MINUTES || 120);

function syncDeadline(attempt) {
    return new Date(new Date(attempt.ends_at).getTime() + SYNC_GRACE_MINUTES * 60000);
}

// Merges a { questionId: "A".."D" } map into the attempt's saved answers. Only accepted while the
// attempt is still in progress and inside the sync window - so a device that was offline when its
// timer hit zero can still deliver the answers it recorded before the deadline. Unknown question
// ids and invalid options are ignored. Returns how many answers were stored.
async function mergeAnswers(attempt, exam, answers) {
    if (!answers || typeof answers !== "object") return 0;
    if (attempt.status !== "in_progress" || exam.stopped_at) return 0;
    if (new Date() > syncDeadline(attempt)) return 0;

    const valid = await query("SELECT question_id FROM exam_questions WHERE exam_id = $1", [attempt.exam_id]);
    const validIds = new Set(valid.map((r) => r.question_id));
    const ids = [];
    const options = [];
    for (const [qid, option] of Object.entries(answers)) {
        const id = Number(qid);
        if (!validIds.has(id) || !["A", "B", "C", "D"].includes(option)) continue;
        ids.push(id);
        options.push(option);
    }
    if (!ids.length) return 0;

    await query(
        `INSERT INTO exam_attempt_answers (attempt_id, question_id, selected_option, answered_at)
         SELECT $1, t.qid, t.opt, now() FROM unnest($2::int[], $3::text[]) AS t(qid, opt)
         ON CONFLICT (attempt_id, question_id)
         DO UPDATE SET selected_option = EXCLUDED.selected_option, answered_at = now()`,
        [attempt.id, ids, options]
    );
    return ids.length;
}

module.exports = { SYNC_GRACE_MINUTES, syncDeadline, mergeAnswers };
