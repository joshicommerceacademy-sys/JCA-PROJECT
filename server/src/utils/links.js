// PUBLIC_APP_URL is the real, publicly reachable domain (set once one exists) — CLIENT_ORIGIN
// is dev-only (http://localhost:5173) and is unreachable from the phone/device that actually
// opens the email, which is why the link "doesn't open."
function studentLoginLink(examId) {
    const origin = (process.env.PUBLIC_APP_URL || process.env.CLIENT_ORIGIN || "").split(",")[0].trim();
    return `${origin}/student/login?examId=${examId}`;
}

module.exports = { studentLoginLink };
