const { query } = require("../db/pool");

// Records answer selections for the Activity Log PDF: who picked which option for which question, and
// when. `entries` = [{ questionId, option, previous }]. synced = delivered later from a device that was
// offline (the time is then the time the server received it). Never throws.
async function logAnswers(attempt, entries, synced = false) {
    try {
        const changed = entries.filter((e) => e.option && e.option !== e.previous);
        if (!changed.length) return;
        const order = Array.isArray(attempt.question_order) ? attempt.question_order : [];
        await query(
            `INSERT INTO exam_answer_log (exam_id, student_id, attempt_id, question_id, question_no, selected_option, previous_option, synced)
             SELECT $1, $2, $3, t.qid, NULLIF(t.qno, 0), t.opt, NULLIF(t.prev, ''), $4
             FROM unnest($5::int[], $6::int[], $7::text[], $8::text[]) AS t(qid, qno, opt, prev)`,
            [
                attempt.exam_id, attempt.student_id, attempt.id, synced,
                changed.map((e) => e.questionId),
                changed.map((e) => order.indexOf(e.questionId) + 1),
                changed.map((e) => e.option),
                changed.map((e) => e.previous || ""),
            ]
        );
    } catch (error) {
        console.error("[ANSWERLOG] could not log:", error.message);
    }
}

module.exports = { logAnswers };
