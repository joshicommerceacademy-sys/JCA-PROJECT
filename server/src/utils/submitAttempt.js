const { query } = require("../db/pool");

// Scores and closes one in-progress attempt. Used by a candidate's own submit, by the admin's
// "Stop Exam" (which ends every running attempt at once) and by the expired-attempt sweeper.
//
// Idempotent: the final UPDATE only matches a still-in-progress row, so two racing callers (e.g.
// the candidate's device reconnecting at the same moment the sweeper fires) can never score
// twice or overwrite each other - the loser simply gets the already-submitted row back.
async function submitAttempt(attempt, exam, submitReason) {
    const questions = await query(
        "SELECT q.id, q.correct_answer, q.marks FROM exam_questions eq JOIN questions q ON q.id = eq.question_id WHERE eq.exam_id = $1",
        [attempt.exam_id]
    );
    const answers = await query(
        "SELECT question_id, selected_option FROM exam_attempt_answers WHERE attempt_id = $1",
        [attempt.id]
    );
    const answerMap = new Map(answers.map((a) => [a.question_id, a.selected_option]));

    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    let marksObtained = 0;
    let totalMarks = 0;
    const graded = [];

    for (const q of questions) {
        totalMarks += q.marks;
        const selected = answerMap.get(q.id);
        if (!selected) {
            unanswered += 1;
            continue;
        }
        const isCorrect = selected === q.correct_answer;
        // Negative marking (when enabled for this exam) deducts a fixed 25% of the
        // question's own marks for a wrong answer.
        const obtained = isCorrect ? q.marks : exam.negative_marking ? -(q.marks * 0.25) : 0;
        if (isCorrect) correct += 1;
        else wrong += 1;
        marksObtained += obtained;
        graded.push({ id: q.id, isCorrect, obtained });
    }

    const percentage = totalMarks > 0 ? Number(((marksObtained / totalMarks) * 100).toFixed(2)) : 0;
    const resultStatus = percentage >= Number(exam.passing_percentage) ? "passed" : "failed";

    const [updated] = await query(
        `UPDATE exam_attempts SET status = 'submitted', submitted_at = now(), submit_reason = $1,
            total_questions = $2, correct_count = $3, wrong_count = $4, unanswered_count = $5,
            marks_obtained = $6, total_marks = $7, percentage = $8, result_status = $9
         WHERE id = $10 AND status = 'in_progress' RETURNING *`,
        [submitReason, questions.length, correct, wrong, unanswered, marksObtained, totalMarks, percentage, resultStatus, attempt.id]
    );
    if (!updated) {
        const [existing] = await query("SELECT * FROM exam_attempts WHERE id = $1", [attempt.id]);
        return existing;
    }

    // Per-question marks are written only by the caller that actually closed the attempt.
    for (const g of graded) {
        await query(
            `UPDATE exam_attempt_answers SET is_correct = $1, marks_obtained = $2
             WHERE attempt_id = $3 AND question_id = $4`,
            [g.isCorrect, g.obtained, attempt.id, g.id]
        );
    }
    return updated;
}

module.exports = { submitAttempt };
