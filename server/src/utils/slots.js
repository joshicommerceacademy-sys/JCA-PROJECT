const { query } = require("../db/pool");
const { generateHallTickets } = require("./hallTicketGenerator");
const { sendHallTicketEmail } = require("./hallTicketMail");

// Automatic batch allocation: every candidate registered for an exam who has no batch yet is placed
// in the batch (date/time slot) that currently has the fewest candidates, so the batches fill evenly.
// A hall ticket is issued for the chosen batch, and candidates who are already verified get their
// ticket PDF emailed automatically (in the background, one after another).
async function autoAssignSlots(registeredExamId) {
    if (!registeredExamId) return { assigned: 0 };
    const slots = await query(
        "SELECT id, standard_id FROM exams WHERE registered_exam_id = $1 AND status != 'cancelled' ORDER BY exam_date, start_time, id",
        [registeredExamId]
    );
    if (!slots.length) return { assigned: 0 };

    const unassigned = await query(
        "SELECT id, status FROM students WHERE registered_exam_id = $1 AND exam_id IS NULL ORDER BY id",
        [registeredExamId]
    );
    if (!unassigned.length) return { assigned: 0 };

    const counts = new Map();
    for (const slot of slots) {
        const [row] = await query("SELECT COUNT(*)::int AS n FROM students WHERE exam_id = $1", [slot.id]);
        counts.set(slot.id, row.n);
    }

    const toEmail = [];
    let assigned = 0;
    for (const student of unassigned) {
        const target = [...slots].sort((a, b) => counts.get(a.id) - counts.get(b.id))[0];
        const { created } = await generateHallTickets({ studentIds: [student.id], standardId: target.standard_id, examId: target.id });
        if (created.length) {
            counts.set(target.id, counts.get(target.id) + 1);
            assigned += 1;
            if (student.status === "allowed") toEmail.push(created[0].hallTicketId);
        }
    }

    if (toEmail.length) {
        (async () => {
            for (const ticketId of toEmail) {
                try { await sendHallTicketEmail(ticketId); }
                catch (error) { console.error("Hall ticket email failed:", error.message); }
            }
        })();
    }
    return { assigned };
}

module.exports = { autoAssignSlots };
