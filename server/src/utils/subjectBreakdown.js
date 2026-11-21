const { query } = require("../db/pool");
const { getAttemptQuestionIds } = require("./attemptQuestions");

// Per-subject score breakdown for one submitted attempt. Grouped from exam_questions
// (the exam's full, fixed question set) rather than exam_attempt_answers, because an
// unanswered question never gets an answer row — grouping from the answers table would
// silently drop it from both the unanswered count and the subject's total marks.
// Exams created before subject sections existed have no section_id, so everything
// falls into one "General" bucket.
async function buildSubjectBreakdown(attemptId, examId) {
    // The candidate's own question set (it differs per seat when the exam hands out seat-wise blocks);
    // each question is placed in the exam section built from its bank.
    const [attempt] = await query("SELECT * FROM exam_attempts WHERE id = $1", [attemptId]);
    const questionIds = await getAttemptQuestionIds(attempt);
    const rows = await query(
        `SELECT COALESCE(es.subject_label, 'General') AS label,
                COUNT(*) FILTER (WHERE eaa.is_correct = true) AS correct_count,
                COUNT(*) FILTER (WHERE eaa.is_correct = false) AS wrong_count,
                COUNT(*) FILTER (WHERE eaa.question_id IS NULL) AS unanswered_count,
                COALESCE(SUM(eaa.marks_obtained), 0) AS marks_obtained,
                SUM(q.marks) AS total_marks
         FROM questions q
         LEFT JOIN LATERAL (
             SELECT s.subject_label, s.ordinal FROM exam_sections s
             WHERE s.exam_id = $2 AND s.bank_id = q.bank_id ORDER BY s.ordinal LIMIT 1
         ) es ON true
         LEFT JOIN exam_attempt_answers eaa ON eaa.attempt_id = $1 AND eaa.question_id = q.id
         WHERE q.id = ANY($3::int[])
         GROUP BY es.ordinal, es.subject_label
         ORDER BY es.ordinal NULLS LAST`,
        [attemptId, examId, questionIds]
    );
    return rows.map((r) => {
        const totalMarks = Number(r.total_marks);
        const marksObtained = Number(r.marks_obtained);
        return {
            label: r.label,
            correctCount: Number(r.correct_count),
            wrongCount: Number(r.wrong_count),
            unansweredCount: Number(r.unanswered_count),
            marksObtained,
            totalMarks,
            percentage: totalMarks > 0 ? Number(((marksObtained / totalMarks) * 100).toFixed(2)) : 0,
        };
    });
}

module.exports = { buildSubjectBreakdown };
