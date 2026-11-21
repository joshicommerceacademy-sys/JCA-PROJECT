const { query } = require("../db/pool");

// Position (0-based) of the candidate's seat among the centre's seats, in lab / seat-number order.
// Stable: it depends on where the seat sits in the lab layout, not on the order seats were handed out.
async function getSeatIndex(student, examId) {
    const [row] = await query(
        `SELECT t.rn FROM (
             SELECT s.seat_number, l.id AS lab_id,
                    row_number() OVER (ORDER BY l.name, length(s.seat_number), s.seat_number) AS rn
             FROM lab_seats s JOIN centre_labs l ON l.id = s.lab_id
             WHERE l.centre_id = $1
         ) t
         JOIN hall_tickets ht ON ht.seat_lab_id = t.lab_id AND ht.seat_number = t.seat_number
         WHERE ht.student_id = $2 AND ht.exam_id = $3
         ORDER BY ht.id DESC LIMIT 1`,
        [student.centre_id, student.id, examId]
    );
    return row ? Number(row.rn) - 1 : null;
}

// The block of `count` questions for a seat: the pool (in question order) is cut into blocks of
// `count`; the seat takes block (seatIndex mod number-of-blocks). A short last block wraps round to
// the start of the pool so every candidate still gets `count` questions.
function blockForSeat(pool, count, seatIndex) {
    const blocks = Math.ceil(pool.length / count);
    const start = (seatIndex % blocks) * count;
    return Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]);
}

// The question ids this attempt was given: its own saved set, or the exam's frozen set for attempts
// that pre-date personal sets.
async function getAttemptQuestionIds(attempt) {
    if (Array.isArray(attempt.question_order) && attempt.question_order.length) return attempt.question_order;
    const rows = await query("SELECT question_id FROM exam_questions WHERE exam_id = $1", [attempt.exam_id]);
    return rows.map((r) => r.question_id);
}

module.exports = { getSeatIndex, blockForSeat, getAttemptQuestionIds };
