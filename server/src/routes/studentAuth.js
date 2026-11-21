const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query, pool } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { canLoginNow, isSelectableForLogin, getExamWindow } = require("../utils/examWindow");
const { getSettings } = require("../utils/settings");
const { claimRoll } = require("../utils/rollClaim");
const { captureIp } = require("../utils/clientIp");

const router = express.Router();

// Settings-page kill switch for *new* student sign-ins — deliberately scoped to this router
// only (exam list, roll-number list, access-password gate, login form). studentExam.js's
// attempt endpoints are a separate router gated by an already-issued JWT, so flipping this
// off never interrupts a student who is already mid-exam.
router.use(
    asyncHandler(async (req, res, next) => {
        const settings = await getSettings();
        if (!settings.student_login_enabled) {
            throw new ApiError(403, "Student login is temporarily disabled by the administrator. Please try again later.");
        }
        next();
    })
);

// Public: list roll numbers currently eligible to log in — their exam's selectable window is
// open (loginStart through 30 minutes past the exam's scheduled end, see isSelectableForLogin),
// and they haven't already submitted. Deliberately scoped and minimal (roll number only, no
// name) so this endpoint can't be used to enumerate the student roster. An optional ?examId=
// scopes the list to just that exam — used once a student has picked their exam from the login
// page's exam list, instead of showing every currently-open exam's candidates merged together
// (which gets confusing when 2-3 exams are running at once). A student with an existing
// non-submitted attempt is kept in this list (not just when a reappear was explicitly granted)
// so someone who got disconnected can still find their exam and log back in — finishLogin
// already lets a non-submitted attempt resume without re-checking the login window.
router.get(
    "/candidates",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        const params = [];
        let examClause = "";
        if (examId) {
            params.push(examId);
            examClause = `AND e.id = $${params.length}`;
        }

        const students = await query(
            `SELECT st.roll_number, sd.name AS standard_name, e.id AS exam_id, e.exam_date, e.start_time, e.duration_minutes,
                    e.login_window_minutes, e.grace_period_minutes, e.started_at, rr.id AS reappear_id,
                    ea.id AS attempt_id
             FROM students st
             JOIN exams e ON e.id = st.exam_id
             LEFT JOIN standards sd ON sd.id = st.standard_id
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = e.id
             LEFT JOIN reappear_requests rr ON rr.student_id = st.id AND rr.exam_id = e.id AND rr.status = 'pending'
             WHERE st.status = 'allowed' AND st.exam_access_allowed = true
                   AND e.status != 'cancelled' AND e.stopped_at IS NULL
                   ${examClause}`,
            params
        );

        // A roll number whose exam has already been started (an attempt exists - still running or
        // submitted) is no longer offered for login. It only comes back when an admin re-enables
        // it (a pending reappear), which is the one case that lets a started attempt be resumed.
        const eligible = students
            .filter((s) => s.reappear_id || (!s.attempt_id && isSelectableForLogin(s)))
            .map((s) => ({ rollNumber: s.roll_number, standardName: s.standard_name || null }))
            .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

        res.json({ status: "success", data: eligible });
    })
);

// Public: the candidate's name for the welcome message, shown after they submit their roll number.
router.get(
    "/candidate-name",
    asyncHandler(async (req, res) => {
        const { examId, rollNumber } = req.query;
        if (!examId || !rollNumber) throw new ApiError(400, "examId and rollNumber are required.");
        const [row] = await query(
            `SELECT full_name FROM students
             WHERE roll_number = $1 AND exam_id = $2 AND status = 'allowed' AND exam_access_allowed = true`,
            [rollNumber, examId]
        );
        if (!row) throw new ApiError(404, "Roll number not found for this exam.");
        res.json({ status: "success", data: { fullName: row.full_name } });
    })
);

// Public: list of exams currently open for student login — the "pick your exam" step at the
// top of the login page, shown before any roll-number list. Same eligibility rule as /candidates
// (at least one allowed, non-submitted student who is inside the selectable window, or has a
// pending reappear), just grouped by exam instead of flattened to roll numbers. The selectable
// window (loginStart through 30 minutes past the exam's scheduled end — see isSelectableForLogin)
// intentionally outlives the tighter fresh-login grace period so the exam doesn't disappear from
// this list the moment someone starts it or the grace period closes — a candidate who needs to
// resume (or reappear) can still find and pick their exam.
router.get(
    "/exams",
    asyncHandler(async (req, res) => {
        // An exam shows up here from its scheduled start time (or the moment an admin clicks
        // Start Exam, if earlier) until 1 hour after it ends — independent of whether any student
        // has been granted exam access yet. A pending reappear keeps its exam listed regardless.
        const rows = await query(`
            SELECT e.id, e.name, e.exam_date, e.start_time, e.duration_minutes, e.started_at, e.registered_exam_id,
                   e.login_window_minutes, e.grace_period_minutes, e.submit_button_after_minutes, e.compensate_late_login,
                   EXISTS (SELECT 1 FROM reappear_requests rr WHERE rr.exam_id = e.id AND rr.status = 'pending') AS has_reappear,
                   COALESCE((SELECT string_agg(DISTINCT c2.name, ' / ' ORDER BY c2.name) FROM exam_centres ec JOIN centres c2 ON c2.id = ec.centre_id WHERE ec.exam_id = e.id), c.name) AS centre_name,
                   c.city AS centre_city, e.logo_url
            FROM exams e
            LEFT JOIN centres c ON c.id = e.centre_id
            WHERE e.status != 'cancelled' AND e.stopped_at IS NULL
        `);

        const now = new Date();
        const visibleMs = 60 * 60000;
        // An exam with several batches is listed once; only the time changes per batch, so keep the
        // batch that is live (earliest start among the visible ones) for each exam.
        const visibleRows = rows
            .filter((row) => {
                if (row.has_reappear) return true;
                const { start, examEnd } = getExamWindow(row);
                const shownFrom = row.started_at && new Date(row.started_at) < start ? new Date(row.started_at) : start;
                return now >= shownFrom && now <= new Date(examEnd.getTime() + visibleMs);
            });
        const oneBatchPerExam = new Map();
        for (const row of visibleRows) {
            const key = row.registered_exam_id ? `r${row.registered_exam_id}` : `n${row.name.toLowerCase()}`;
            const current = oneBatchPerExam.get(key);
            if (!current || getExamWindow(row).start < getExamWindow(current).start) oneBatchPerExam.set(key, row);
        }
        const exams = [...oneBatchPerExam.values()]
            .map((row) => ({
                id: row.id,
                name: row.name,
                examDate: row.exam_date,
                startTime: row.start_time,
                durationMinutes: row.duration_minutes,
                submitButtonAfterMinutes: Number(row.submit_button_after_minutes || 0),
                compensateLateLogin: row.compensate_late_login !== false,
                centreName: row.centre_name,
                centreCity: row.centre_city,
                logoUrl: row.logo_url || null,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json({ status: "success", data: exams });
    })
);

// Public: the candidate picked a roll number and pressed Submit. Claims it for this browser
// session so it appears on the Attendance page at once and nobody else can select it. A second
// person submitting the same roll number gets a 409 (the login page shows the "already selected"
// pop-up).
router.post(
    "/claim",
    asyncHandler(async (req, res) => {
        const { examId, rollNumber, sessionId } = req.body || {};
        if (!examId || !rollNumber) throw new ApiError(400, "examId and rollNumber are required.");

        const [student] = await query(
            `SELECT * FROM students
             WHERE upper(roll_number) = upper($1) AND exam_id = $2 AND status = 'allowed' AND exam_access_allowed = true`,
            [String(rollNumber).trim(), examId]
        );
        if (!student) throw new ApiError(404, "Roll number not found for this exam.");

        const exam = await loadExamForLogin(student);
        const [pendingReappear] = await query(
            "SELECT id FROM reappear_requests WHERE student_id = $1 AND exam_id = $2 AND status = 'pending'",
            [student.id, exam.id]
        );
        if (!pendingReappear && !isSelectableForLogin(exam)) {
            throw new ApiError(403, "Login for this exam is not open right now.");
        }

        const claimedAt = await claimRoll(student, exam, sessionId);
        await captureIp(req, student.id);
        res.json({ status: "success", data: { rollNumber: student.roll_number, claimedAt } });
    })
);

// Public: whether an exam has a question bank linked (any frozen questions). The password page
// shows "Question Bank Not Active" when it doesn't — nothing else in the student flow exposes this.
router.get(
    "/exam-status",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        if (!examId) throw new ApiError(400, "examId is required.");
        const [row] = await query(
            "SELECT COUNT(*)::int AS n FROM exam_questions WHERE exam_id = $1",
            [examId]
        );
        res.json({ status: "success", data: { questionBankActive: row.n > 0 } });
    })
);

// Public gate shown before a specific exam's roll-number list is revealed. Requires the admin
// to have clicked "Start Exam" first (sets started_at) and the password to match what was
// revealed on the Exam Schedule page — this is a shared invigilator-level secret (not a
// personal student credential), required once per exam selection regardless of entry point.
router.post(
    "/exam-access",
    asyncHandler(async (req, res) => {
        const { examId, password } = req.body;
        if (!examId || !password) {
            throw new ApiError(400, "Exam and password are required.");
        }

        const [exam] = await query("SELECT started_at, access_password FROM exams WHERE id = $1", [examId]);
        if (!exam) throw new ApiError(404, "Exam not found.");
        if (!exam.access_password) {
            const generated = String(require('crypto').randomInt(100000, 1000000));
            const [updated] = await query(
                "UPDATE exams SET access_password = $1, updated_at = now() WHERE id = $2 RETURNING access_password",
                [generated, examId]
            );
            exam.access_password = updated.access_password;
        }
        const windowCheck = canLoginNow(exam);
        if (!windowCheck.ok) throw new ApiError(403, windowCheck.reason);
        if (password !== exam.access_password) {
            throw new ApiError(401, "Incorrect exam password.");
        }

        res.json({ status: "success", data: { ok: true } });
    })
);

// Public: reveals a started exam's access password so the login page can auto-fill the gate
// above once a student picks that exam from the list, instead of requiring it to be typed in.
// Deliberately requested this way — it does mean the gate no longer requires anything an
// invigilator hasn't already made visible by starting the exam.
router.get(
    "/exam-password",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        if (!examId) throw new ApiError(400, "examId is required.");

        const [exam] = await query("SELECT started_at, access_password FROM exams WHERE id = $1", [examId]);
        if (!exam) throw new ApiError(404, "Exam not found.");
        if (!exam.access_password) {
            const generated = String(require('crypto').randomInt(100000, 1000000));
            const [updated] = await query(
                "UPDATE exams SET access_password = $1, updated_at = now() WHERE id = $2 RETURNING access_password",
                [generated, examId]
            );
            exam.access_password = updated.access_password;
        }
        const windowCheck = canLoginNow(exam);
        if (!windowCheck.ok) throw new ApiError(403, windowCheck.reason);

        res.json({ status: "success", data: { accessPassword: exam.access_password } });
    })
);

// The tail end of a successful login, once the password has checked out: existing-attempt/
// submitted check, the login-window check (skipped once an attempt already exists, or a reappear
// is pending), extending a pending reappear's deadline from *this* moment, and issuing the JWT.
async function finishLogin(student, exam) {
    const [existingAttempt] = await query(
        "SELECT * FROM exam_attempts WHERE student_id = $1 AND exam_id = $2",
        [student.id, exam.id]
    );
    if (existingAttempt?.status === "submitted") {
        throw new ApiError(403, "You have already submitted this exam. An exam that has already been started and completed cannot be started again.", "EXAM_ALREADY_SUBMITTED");
    }

    const [pendingReappear] = await query(
        "SELECT id, remaining_minutes FROM reappear_requests WHERE student_id = $1 AND exam_id = $2 AND status = 'pending'",
        [student.id, exam.id]
    );

    if (!existingAttempt && !pendingReappear) {
        const windowCheck = canLoginNow(exam);
        if (!windowCheck.ok) {
            throw new ApiError(403, windowCheck.reason);
        }
    }

    if (pendingReappear) {
        // Extend the existing attempt's deadline right now — this is the moment the
        // candidate is actually back at a working PC, so the granted time starts counting
        // from here, not from whenever the admin clicked "Grant Reappear". The attempt row
        // (and its previously saved answers) was never deleted, so it just keeps going.
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                "UPDATE reappear_requests SET status = 'completed', completed_at = now() WHERE id = $1",
                [pendingReappear.id]
            );
            await client.query(
                `UPDATE exam_attempts SET ends_at = now() + ($1 || ' minutes')::interval
                 WHERE student_id = $2 AND exam_id = $3`,
                [pendingReappear.remaining_minutes, student.id, exam.id]
            );
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    return jwt.sign(
        { id: student.id, rollNumber: student.roll_number, role: "student" },
        process.env.JWT_SECRET,
        { expiresIn: "6h" }
    );
}

async function loadExamForLogin(student) {
    if (student.status !== "allowed") {
        throw new ApiError(403, "Your hall-ticket registration has not been verified yet.");
    }
    if (!student.exam_access_allowed) {
        throw new ApiError(403, "Your exam access has not been allowed by the admin yet.");
    }
    if (!student.exam_id) {
        throw new ApiError(400, "No exam has been assigned to you yet.");
    }
    const [exam] = await query("SELECT * FROM exams WHERE id = $1", [student.exam_id]);
    if (!exam) {
        throw new ApiError(400, "Your assigned exam could not be found.");
    }
    if (exam.stopped_at) {
        throw new ApiError(403, "This exam has been stopped by the administrator.");
    }
    if (exam.status === "cancelled") {
        throw new ApiError(400, "This exam has been cancelled.");
    }
    if (!exam.started_at) {
        throw new ApiError(403, "This exam has not been started by the admin yet.");
    }
    return exam;
}

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { rollNumber, password, sessionId } = req.body;
        if (!rollNumber || !password) {
            throw new ApiError(400, "Roll number and password are required.");
        }

        const [student] = await query(
            "SELECT * FROM students WHERE roll_number = $1",
            [rollNumber]
        );
        if (!student) {
            throw new ApiError(401, "Invalid roll number or password.");
        }

        // System-generated passwords are all capitals (e.g. ABCD12J): accept them whatever the
        // candidate's keyboard case is.
        let valid = await bcrypt.compare(password, student.password_hash);
        if (!valid && password !== String(password).toUpperCase()) {
            valid = await bcrypt.compare(String(password).toUpperCase(), student.password_hash);
        }
        if (!valid) {
            throw new ApiError(401, "Invalid roll number or password.");
        }

        const exam = await loadExamForLogin(student);
        // The roll number must belong to this browser session (claimed on the previous step).
        await claimRoll(student, exam, sessionId);
        await captureIp(req, student.id);
        const token = await finishLogin(student, exam);
        await query("UPDATE students SET login_at = now(), pending_command = NULL, pending_command_at = NULL, updated_at = now() WHERE id = $1", [student.id]);

        res.json({
            status: "success",
            data: {
                token,
                student: {
                    id: student.id,
                    rollNumber: student.roll_number,
                    fullName: student.full_name,
                    photoUrl: student.photo_url,
                },
            },
        });
    })
);

module.exports = router;
