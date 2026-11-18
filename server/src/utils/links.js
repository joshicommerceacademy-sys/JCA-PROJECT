// PUBLIC_APP_URL is the real, publicly reachable domain (set once one exists) — CLIENT_ORIGIN
// is dev-only (http://localhost:5173) and is unreachable from the phone/device that actually
// opens the email, which is why the link "doesn't open."
// Live deployment — used in candidate emails and hall ticket PDFs unless PUBLIC_APP_URL overrides it.
const DEFAULT_PUBLIC_URL = "https://jca-project1.onrender.com";

function studentLoginLink(examId) {
    let origin = (process.env.PUBLIC_APP_URL || "").split(",")[0].trim().replace(/\/$/, "");
    // Never put a localhost/127.0.0.1 address in a candidate-facing link.
    if (!origin || /localhost|127\.0\.0\.1/i.test(origin)) origin = DEFAULT_PUBLIC_URL;
    // Plain login link — the student picks their exam on the "Select Exam" screen.
    return `${origin}/student/login`;
}

module.exports = { studentLoginLink };
