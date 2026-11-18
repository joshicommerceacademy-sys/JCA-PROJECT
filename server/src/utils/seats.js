const { query } = require("../db/pool");
const { ApiError } = require("./asyncHandler");

// Seating Arrangement: hands the candidate the next free seat from their centre's labs
// (lab_seats, configured on the Centres page). A candidate who already holds a seat keeps it.
async function assignSeat(student, examId) {
    const [ticket] = await query(
        `SELECT ht.id, ht.seat_number, ht.seat_lab_id, l.name AS lab_name
         FROM hall_tickets ht LEFT JOIN centre_labs l ON l.id = ht.seat_lab_id
         WHERE ht.student_id = $1 AND ht.exam_id = $2 AND ht.status = 'generated'
         ORDER BY ht.id DESC LIMIT 1`,
        [student.id, examId]
    );
    if (!ticket) throw new ApiError(400, "This candidate has no hall ticket for this exam.");
    if (ticket.seat_number && ticket.seat_lab_id) return { seatNumber: ticket.seat_number, labName: ticket.lab_name };

    const [free] = await query(
        `SELECT s.seat_number, l.id AS lab_id, l.name AS lab_name
         FROM lab_seats s JOIN centre_labs l ON l.id = s.lab_id
         WHERE l.centre_id = $1
           AND NOT EXISTS (
               SELECT 1 FROM hall_tickets x
               WHERE x.exam_id = $2 AND x.seat_lab_id = l.id AND x.seat_number = s.seat_number AND x.id != $3
           )
         ORDER BY l.name, length(s.seat_number), s.seat_number
         LIMIT 1`,
        [student.centre_id, examId, ticket.id]
    );
    if (!free) {
        throw new ApiError(400, "No free seat is available for this candidate's centre. Add labs and seat numbers on the Centres page.");
    }
    await query("UPDATE hall_tickets SET seat_number = $1, seat_lab_id = $2 WHERE id = $3", [free.seat_number, free.lab_id, ticket.id]);
    return { seatNumber: free.seat_number, labName: free.lab_name };
}

async function releaseSeat(studentId, examId) {
    await query(
        "UPDATE hall_tickets SET seat_number = NULL, seat_lab_id = NULL WHERE student_id = $1 AND exam_id = $2",
        [studentId, examId]
    );
}

module.exports = { assignSeat, releaseSeat };
