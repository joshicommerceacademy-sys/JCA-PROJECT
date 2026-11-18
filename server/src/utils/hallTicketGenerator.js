const { query, pool } = require("../db/pool");
const { nextHallTicketNumber, nextStudentRollNumber, nextStudentCode, nextSeatNumber } = require("./idGenerators");

// Issues hall tickets (assigning roll number / student code / seat as needed) for the given
// students. Students that already have a ticket for this exam are skipped. Never sends email.
async function generateHallTickets({ studentIds, standardId, examId }) {
    const created = [];
    const skipped = [];

    for (const studentId of studentIds) {
        const [student] = await query("SELECT * FROM students WHERE id = $1", [studentId]);
        if (!student) {
            skipped.push({ studentId, reason: "Student not found." });
            continue;
        }

        const [existingTicket] = await query(
            "SELECT id FROM hall_tickets WHERE student_id = $1 AND exam_id = $2",
            [studentId, examId]
        );
        if (existingTicket) {
            skipped.push({ studentId, studentName: student.full_name, reason: "Already has a hall ticket for this exam." });
            continue;
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            let rollNumber = student.roll_number;
            if (!rollNumber) {
                rollNumber = await nextStudentRollNumber();
            }
            let studentCode = student.student_code;
            if (!studentCode) {
                studentCode = await nextStudentCode();
            }

            // A student's "allowed" status is specific to the exam they were allowed for —
            // being approved for exam A must never carry over as automatic access to exam B.
            // If this hall ticket assigns the student to a *different* exam than the one
            // currently on their record, reset status/check-in back to pending so the admin
            // has to explicitly re-approve them on the Verification page for the new exam.
            // Re-generating a ticket for the same exam (exam_id unchanged) leaves status alone.
            let isDifferentExam = student.exam_id && Number(student.exam_id) !== Number(examId);
            if (isDifferentExam) {
                // Slots of the same exam share a registry entry — moving between them is not a new exam.
                const [pair] = await query(
                    `SELECT (a.registered_exam_id IS NOT NULL AND a.registered_exam_id = b.registered_exam_id) AS same_group
                     FROM exams a, exams b WHERE a.id = $1 AND b.id = $2`,
                    [student.exam_id, examId]
                );
                if (pair?.same_group) isDifferentExam = false;
            }

            await client.query(
                `UPDATE students SET roll_number = $1, student_code = $2, standard_id = COALESCE($3, standard_id), exam_id = $4,
                    status = CASE WHEN $6 THEN 'pending' ELSE status END,
                    checked_in_at = CASE WHEN $6 THEN NULL ELSE checked_in_at END,
                    updated_at = now()
                 WHERE id = $5`,
                [rollNumber, studentCode, Number(standardId) || null, examId, studentId, isDifferentExam]
            );

            const hallTicketNumber = await nextHallTicketNumber();
            const seatNumber = null;
            const ticketResult = await client.query(
                `INSERT INTO hall_tickets (student_id, exam_id, hall_ticket_number, seat_number)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [studentId, examId, hallTicketNumber, seatNumber]
            );

            await client.query("COMMIT");
            created.push({
                studentId,
                studentName: student.full_name,
                hallTicketId: ticketResult.rows[0].id,
                rollNumber,
            });
        } catch (error) {
            await client.query("ROLLBACK");
            skipped.push({ studentId, studentName: student.full_name, reason: error.message });
        } finally {
            client.release();
        }
    }
    return { created, skipped };
}

module.exports = { generateHallTickets };
