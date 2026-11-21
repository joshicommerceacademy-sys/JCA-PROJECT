const { query } = require("../db/pool");
const { ApiError } = require("./asyncHandler");
const { logExamEvent } = require("./eventLog");

// Re-enables a candidate whose exam was started but interrupted: records a pending reappear (the
// deadline is extended at the moment they log back in, see routes/studentAuth.js) and releases
// their roll-number claim so they can select it again from any PC.
//
// Used by both the Reappear page and the Attendance page's "Re-enable" action.
async function grantReappear(studentId, examId, reason) {
    const [student] = await query("SELECT id, exam_id FROM students WHERE id = $1", [studentId]);
    if (!student) throw new ApiError(404, "Student not found.");
    if (student.exam_id !== Number(examId)) {
        throw new ApiError(400, "This student is not assigned to that exam.");
    }

    const [exam] = await query("SELECT duration_minutes FROM exams WHERE id = $1", [examId]);
    if (!exam) throw new ApiError(404, "Exam not found.");

    const [attempt] = await query(
        "SELECT * FROM exam_attempts WHERE student_id = $1 AND exam_id = $2",
        [studentId, examId]
    );
    if (!attempt) {
        throw new ApiError(400, "This student never started this exam — reappear is only for an interrupted live attempt.");
    }
    if (attempt.status === "submitted") {
        throw new ApiError(400, "This student already submitted this exam — reappear isn't available after a completed submission.");
    }

    const [existing] = await query(
        "SELECT id FROM reappear_requests WHERE student_id = $1 AND exam_id = $2 AND status = 'pending'",
        [studentId, examId]
    );
    if (existing) throw new ApiError(409, "This student already has a pending reappear for this exam.");

    // Detect how much exam time was actually left when the attempt stopped, using the last
    // saved answer as the best available signal of when activity ceased (falls back to the
    // start time if nothing was ever answered) — not how much time is left in "now".
    const [{ last_activity_at: lastActivityAt }] = await query(
        "SELECT MAX(answered_at) AS last_activity_at FROM exam_attempt_answers WHERE attempt_id = $1",
        [attempt.id]
    );
    const stopReference = lastActivityAt || attempt.started_at;
    const elapsedMinutes = (new Date(stopReference).getTime() - new Date(attempt.started_at).getTime()) / 60000;
    let minutes = Math.max(1, Math.round(exam.duration_minutes - elapsedMinutes));
    // Stopped on the spot with Restart Exam: the candidate continues with exactly the time that was
    // left at that moment (the clock was paused).
    if (attempt.force_stopped_at) {
        minutes = Math.max(1, Math.ceil((new Date(attempt.ends_at).getTime() - new Date(attempt.force_stopped_at).getTime()) / 60000));
    }

    const [inserted] = await query(
        `INSERT INTO reappear_requests (student_id, exam_id, reason, remaining_minutes)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [studentId, examId, reason || null, minutes]
    );
    await query("UPDATE students SET login_session_id = NULL, login_claimed_at = NULL WHERE id = $1", [studentId]);
    // The pending reappear now carries the paused time; the stop is lifted.
    await query("UPDATE exam_attempts SET force_stopped_at = NULL WHERE id = $1", [attempt.id]);
    await logExamEvent({ examId, studentId, type: "reappear_granted", detail: `Reappear granted (${minutes} min left)${reason ? ` - ${reason}` : ""}` });
    return { id: inserted.id, remainingMinutes: minutes };
}

// A roll number that was selected on the login page but whose exam never actually started has no
// attempt to resume - re-enabling it just releases the claim.
async function releaseRollClaim(studentId) {
    await query("UPDATE students SET login_session_id = NULL, login_claimed_at = NULL WHERE id = $1", [studentId]);
}

module.exports = { grantReappear, releaseRollClaim };
