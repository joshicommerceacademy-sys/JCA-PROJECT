const LOGIN_OPENS_MINUTES_BEFORE = 30;
const LATE_LOGIN_GRACE_MINUTES = 25;
const INDIA_OFFSET = "+05:30";

function datePart(value) {
    if (typeof value === "string") return value.slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

function timePart(value) {
    const text = String(value || "00:00:00");
    return text.length >= 8 ? text.slice(0, 8) : `${text}:00`.slice(0, 8);
}

// All exam schedule dates/times are India Standard Time (Asia/Kolkata), regardless
// of the Render server timezone or the candidate browser timezone.
function getScheduledStart(exam) {
    return new Date(`${datePart(exam.exam_date)}T${timePart(exam.start_time)}${INDIA_OFFSET}`);
}

function getExamWindow(exam) {
    const start = getScheduledStart(exam);
    const loginWindowMinutes = exam.login_window_minutes ?? LOGIN_OPENS_MINUTES_BEFORE;
    const gracePeriodMinutes = exam.grace_period_minutes ?? LATE_LOGIN_GRACE_MINUTES;
    let loginStart = new Date(start.getTime() - loginWindowMinutes * 60000);

    // An explicit admin Start Exam click can open login early, but it is no longer
    // required for a normally scheduled exam to become available.
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
        return { ok: false, reason: `Login opens at ${loginStart.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.` };
    }
    if (now > graceEnd) {
        return { ok: false, reason: "The grace period for logging in to this exam has ended." };
    }
    if (now >= examEnd) {
        return { ok: false, reason: "This exam has already ended." };
    }
    return { ok: true };
}

const SELECTABLE_AFTER_END_MINUTES = 30;

function isSelectableForLogin(exam, now = new Date()) {
    const { loginStart, examEnd } = getExamWindow(exam);
    const selectableUntil = new Date(examEnd.getTime() + SELECTABLE_AFTER_END_MINUTES * 60000);
    return now >= loginStart && now <= selectableUntil;
}

module.exports = { getExamWindow, canLoginNow, isSelectableForLogin, getScheduledStart };
