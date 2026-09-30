const LOGIN_OPENS_MINUTES_BEFORE = 30;
const LATE_LOGIN_GRACE_MINUTES = 25;

function getExamWindow(exam) {
    // node-postgres parses a DATE column using the *local* Date constructor (new Date(y, m, d)),
    // so the resulting Date object already represents local midnight of the intended calendar
    // date — reading it back with the local getters (not the UTC ones, and not toISOString(),
    // which would shift the date in non-zero UTC-offset timezones) gives the correct date.
    const d = exam.exam_date;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const start = new Date(`${dateStr}T${exam.start_time}`);
    const loginWindowMinutes = exam.login_window_minutes ?? LOGIN_OPENS_MINUTES_BEFORE;
    const gracePeriodMinutes = exam.grace_period_minutes ?? LATE_LOGIN_GRACE_MINUTES;
    let loginStart = new Date(start.getTime() - loginWindowMinutes * 60000);
    // The admin's "Start Exam" click (started_at) is a deliberate, real-time "go" signal —
    // if it happens earlier than the pre-configured login window would have opened, that
    // signal wins: the exam becomes loginable immediately rather than students (and the
    // exam-selection list) waiting on a schedule the admin has already overridden in person.
    if (exam.started_at) {
        const startedAt = new Date(exam.started_at);
        if (startedAt < loginStart) loginStart = startedAt;
    }
    const graceEnd = new Date(start.getTime() + gracePeriodMinutes * 60000);
    const examEnd = new Date(start.getTime() + exam.duration_minutes * 60000);
    return { start, loginStart, graceEnd, examEnd };
}

function canLoginNow(exam, now = new Date()) {
    const { loginStart, graceEnd, examEnd } = getExamWindow(exam);
    if (now < loginStart) {
        return { ok: false, reason: `Login opens at ${loginStart.toLocaleString()}.` };
    }
    if (now > graceEnd) {
        return { ok: false, reason: "The grace period for logging in to this exam has ended." };
    }
    if (now >= examEnd) {
        return { ok: false, reason: "This exam has already ended." };
    }
    return { ok: true };
}

// How long past the exam's scheduled end time it should stay pickable on the student login
// page — wider than the login/grace window above, deliberately: a candidate who was logged in
// (fresh or resuming an interrupted attempt) can still find their exam in the list and log back
// in during this buffer, instead of it vanishing the moment the tighter grace period closes.
const SELECTABLE_AFTER_END_MINUTES = 30;

function isSelectableForLogin(exam, now = new Date()) {
    const { loginStart, examEnd } = getExamWindow(exam);
    const selectableUntil = new Date(examEnd.getTime() + SELECTABLE_AFTER_END_MINUTES * 60000);
    return now >= loginStart && now <= selectableUntil;
}

module.exports = { getExamWindow, canLoginNow, isSelectableForLogin };
