const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query } = require("../db/pool");
const { formatDobPassword } = require("./idGenerators");

// System password shaped like ABCD12J: 4 letters, 2 digits, 1 letter, all capitals
// (look-alike characters I, O, 0, 1 are left out).
function generateSystemPassword() {
    const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const D = "23456789";
    const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join("");
    return `${pick(L, 4)}${pick(D, 2)}${pick(L, 1)}`;
}

// Works out one candidate's exam login password from the exam's password mode.
//  dob    - the candidate's date of birth (DDMMYYYY)
//  system - a generated code (kept, so it can be printed on the hall ticket)
//  own    - the password the admin typed in on the exam schedule
// Returns { hash, plain } - plain is only returned for the modes that are printed on the hall ticket.
async function resolveExamPassword(exam, student, existingSystemPassword = null) {
    const mode = exam.password_mode || "dob";
    if (mode === "own" && exam.own_password) {
        return { hash: await bcrypt.hash(exam.own_password, 10), plain: null };
    }
    if (mode === "system") {
        const plain = existingSystemPassword || generateSystemPassword();
        return { hash: await bcrypt.hash(plain, 10), plain };
    }
    const plain = formatDobPassword(student.dob);
    return { hash: await bcrypt.hash(plain, 10), plain };
}

// Re-applies the exam's password mode to every candidate of the exam (used when the admin edits the
// mode). System passwords that were already issued are kept so printed hall tickets stay valid.
async function reapplyExamPasswords(exam) {
    const rows = await query(
        `SELECT st.id, st.dob, ht.id AS ticket_id, ht.exam_password
         FROM students st LEFT JOIN hall_tickets ht ON ht.student_id = st.id AND ht.exam_id = st.exam_id
         WHERE st.exam_id = $1`,
        [exam.id]
    );
    for (const r of rows) {
        const { hash, plain } = await resolveExamPassword(exam, r, exam.password_mode === "system" ? r.exam_password : null);
        await query("UPDATE students SET password_hash = $1 WHERE id = $2", [hash, r.id]);
        if (r.ticket_id) {
            await query("UPDATE hall_tickets SET exam_password = $1 WHERE id = $2", [exam.password_mode === "system" ? plain : null, r.ticket_id]);
        }
    }
}

module.exports = { generateSystemPassword, resolveExamPassword, reapplyExamPasswords };
