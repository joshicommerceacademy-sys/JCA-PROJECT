const { query } = require("../db/pool");
const { ApiError } = require("./asyncHandler");

// A Verification Desk token is scoped to one exam: it may only touch students who are on that
// exam's roster — assigned to it, or registered for the same registered-exam name.
async function assertDeskStudents(desk, studentIds) {
    const ids = [...new Set((studentIds || []).map(Number))];
    if (!ids.length) throw new ApiError(400, "No students given.");
    const rows = await query(
        `SELECT st.id FROM students st
         WHERE st.id = ANY($1::int[])
           AND (st.exam_id = $2 OR ($3::int IS NOT NULL AND st.registered_exam_id = $3))
           AND ($4::int IS NULL OR st.centre_id = $4)`,
        [ids, desk.examId, desk.registeredExamId || null, desk.centreId || null]
    );
    if (rows.length !== ids.length) throw new ApiError(403, "That student is not on this desk's exam roster.");
}

module.exports = { assertDeskStudents };
