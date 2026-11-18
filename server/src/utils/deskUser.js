// Verification Desk user ID for an exam: first 5 characters of the exam name (spaces removed)
// followed by "verify". The password is the exam's own access password.
function deskUserId(examName) {
    return `${String(examName || "").replace(/\s+/g, "").slice(0, 5)}verify`;
}

// Desk logins for an exam. A single-centre exam has one ID (see deskUserId). An exam held at
// several centres gets one ID per centre - the base ID followed by the centre code - and each ID
// can only see and verify the candidates of its own centre.
function deskLogins(exam, centres) {
    const base = deskUserId(exam.name);
    if (!centres || centres.length < 2) return [{ userId: base, centreId: null, centreName: centres?.[0]?.name || null, centreCode: centres?.[0]?.code || null }];
    return centres.map((c) => ({
        userId: `${base}${String(c.code || c.id).replace(/[^a-zA-Z0-9]/g, "")}`,
        centreId: c.id,
        centreName: c.name,
        centreCode: c.code,
    }));
}

const { getScheduledStart } = require("./examWindow");

// True once the exam's Verification Desk has closed (start time + verification_close_minutes).
function isDeskClosed(exam, now = new Date()) {
    if (exam.verification_close_minutes === null || exam.verification_close_minutes === undefined) return false;
    const closesAt = new Date(getScheduledStart(exam).getTime() + Number(exam.verification_close_minutes) * 60000);
    return now >= closesAt;
}

// True before the Verification Desk has opened (start time - verification_open_minutes).
function isDeskNotOpen(exam, now = new Date()) {
    if (exam.verification_open_minutes === null || exam.verification_open_minutes === undefined) return false;
    const opensAt = new Date(getScheduledStart(exam).getTime() - Number(exam.verification_open_minutes) * 60000);
    return now < opensAt;
}

// 'not_open' | 'open' | 'closed' for an exam's desk right now, plus when it opens/closes.
function deskWindow(exam, now = new Date()) {
    const start = getScheduledStart(exam).getTime();
    const opensAt = exam.verification_open_minutes == null ? null : new Date(start - Number(exam.verification_open_minutes) * 60000);
    const closesAt = exam.verification_close_minutes == null ? null : new Date(start + Number(exam.verification_close_minutes) * 60000);
    const state = isDeskClosed(exam, now) ? "closed" : isDeskNotOpen(exam, now) ? "not_open" : "open";
    return { state, opensAt, closesAt };
}

module.exports = { deskUserId, deskLogins, isDeskClosed, isDeskNotOpen, deskWindow };
