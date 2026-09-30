const { query } = require("../db/pool");

async function nextHallTicketNumber() {
    const year = new Date().getFullYear();
    const [{ nextval }] = await query("SELECT nextval('hall_ticket_seq') AS nextval");
    return `HT${year}${String(nextval).padStart(4, "0")}`;
}

// One letter + 5 digits, starting at A12345 as requested: A covers 12345-99999 (the
// sequence's own range), then each subsequent letter covers a full 10000-99999 block.
async function nextStudentRollNumber() {
    const [{ nextval }] = await query("SELECT nextval('student_roll_seq') AS nextval");
    const n = Number(nextval);
    if (n <= 99999) {
        return `A${String(n).padStart(5, "0")}`;
    }
    const rest = n - 100000;
    const letter = String.fromCharCode(66 + Math.floor(rest / 90000));
    const numeric = 10000 + (rest % 90000);
    return `${letter}${String(numeric).padStart(5, "0")}`;
}

async function nextStudentCode() {
    const [{ nextval }] = await query("SELECT nextval('student_code_seq') AS nextval");
    return String(nextval).padStart(4, "0");
}

function formatDobPassword(dob) {
    const d = new Date(dob);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}${mm}${yyyy}`;
}

// Seats are numbered per-exam (not globally), in hall-ticket issue order: S-001, S-002, ...
async function nextSeatNumber(examId) {
    const [{ count }] = await query(
        "SELECT COUNT(*) FROM hall_tickets WHERE exam_id = $1",
        [examId]
    );
    return `S-${String(Number(count) + 1).padStart(3, "0")}`;
}

module.exports = {
    nextHallTicketNumber,
    nextStudentRollNumber,
    nextStudentCode,
    formatDobPassword,
    nextSeatNumber,
};
