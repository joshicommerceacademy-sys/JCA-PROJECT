const { query } = require("../db/pool");
const { ApiError } = require("./asyncHandler");

const ALREADY_SELECTED = "This candidate roll number is already selected.";

// Claims a roll number for one browser session the moment a candidate selects and submits it on
// the login page. The claim shows up immediately on the admin Attendance page and blocks everyone
// else (another PC, another tab with a different session) from using the same roll number.
//
//  - Same session again (refresh, back button, password step)  -> fine, idempotent.
//  - Different session                                          -> 409 ROLL_ALREADY_SELECTED.
//  - The exam was already started for this roll number          -> 409 ROLL_ALREADY_SELECTED, unless
//    an admin has re-enabled it (pending reappear), which is the one way back in.
//  - Already submitted                                          -> 403 EXAM_ALREADY_SUBMITTED.
//
// The UPDATE is a single atomic compare-and-set, so two people submitting the same roll number at
// the same instant can never both win.
async function claimRoll(student, exam, sessionId) {
    const session = String(sessionId || "").trim().slice(0, 64);
    if (!session) throw new ApiError(400, "Session could not be identified. Please reload the page and try again.");

    const [attempt] = await query(
        "SELECT status FROM exam_attempts WHERE student_id = $1 AND exam_id = $2",
        [student.id, exam.id]
    );
    const [pendingReappear] = await query(
        "SELECT id FROM reappear_requests WHERE student_id = $1 AND exam_id = $2 AND status = 'pending'",
        [student.id, exam.id]
    );

    if (attempt?.status === "submitted") {
        throw new ApiError(
            403,
            "You have already submitted this exam. An exam that has already been started and completed cannot be started again.",
            "EXAM_ALREADY_SUBMITTED"
        );
    }
    if (attempt && !pendingReappear) {
        throw new ApiError(409, ALREADY_SELECTED, "ROLL_ALREADY_SELECTED");
    }

    // An admin re-enable hands the roll number to whoever selects it next.
    const takeOver = !!pendingReappear;
    const [claimed] = await query(
        `UPDATE students
            SET login_session_id = $1,
                login_claimed_at = CASE WHEN login_session_id = $1 AND login_claimed_at IS NOT NULL THEN login_claimed_at ELSE now() END
          WHERE id = $2 AND ($3::boolean OR login_session_id IS NULL OR login_session_id = $1)
          RETURNING login_claimed_at`,
        [session, student.id, takeOver]
    );
    if (!claimed) throw new ApiError(409, ALREADY_SELECTED, "ROLL_ALREADY_SELECTED");
    return claimed.login_claimed_at;
}

module.exports = { claimRoll, ALREADY_SELECTED };
