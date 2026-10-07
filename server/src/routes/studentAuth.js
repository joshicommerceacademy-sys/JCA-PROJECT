const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query, pool } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { canLoginNow, isSelectableForLogin } = require("../utils/examWindow");
const { getSettings } = require("../utils/settings");

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
            `SELECT st.roll_number, e.id AS exam_id, e.exam_date, e.start_time, e.duration_minutes,
                    e.login_window_minutes, e.grace_period_minutes, e.started_at, rr.id AS reappear_id
             FROM students st
             JOIN exams e ON e.id = st.exam_id
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = e.id
             LEFT JOIN reappear_requests rr ON rr.student_id = st.id AND rr.exam_id = e.id AND rr.status = 'pending'
             WHERE st.status = 'allowed'
                   AND e.status != 'cancelled'
                   AND (ea.id IS NULL OR ea.status != 'submitted')
                   ${examClause}`,
            params
        );

        const eligible = students
            .filter((s) => s.reappear_id || isSelectableForLogin(s))
            .map((s) => ({ rollNumber: s.roll_number }))
            .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

        res.json({ status: "success", data: eligible });
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
        const rows = await query(`
            SELECT e.id, e.name, e.exam_date, e.start_time, e.duration_minutes,
                   e.login_window_minutes, e.grace_period_minutes, e.started_at, rr.id AS reappear_id,
                   c.name AS centre_name, c.city AS centre_city
            FROM exams e
            JOIN students st ON st.exam_id = e.id
            LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = e.id
            LEFT JOIN reappear_requests rr ON rr.student_id = st.id AND rr.exam_id = e.id AND rr.status = 'pending'
            LEFT JOIN centres c ON c.id = e.centre_id
            WHERE st.status = 'allowed'
                  AND e.status != 'cancelled'
                  AND (ea.id IS NULL OR ea.status != 'submitted')
        `);

        const examsById = new Map();
        for (const row of rows) {
            if (!row.reappear_id && !isSelectableForLogin(row)) continue;
            if (!examsById.has(row.id)) {
                examsById.set(row.id, {
                    id: row.id,
                    name: row.name,
                    examDate: row.exam_date,
                    startTime: row.start_time,
                    durationMinutes: row.duration_minutes,
                    centreName: row.centre_name,
                    centreCity: row.centre_city,
                });
            }
        }

        const exams = [...examsById.values()].sort((a, b) => a.name.localeCompare(b.name));
        res.json({ status: "success", data: exams });
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
        throw new ApiError(403, "You have already submitted this exam.");
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
        throw new ApiError(403, "Your exam access has not been approved by the admin yet.");
    }
    if (!student.exam_id) {
        throw new ApiError(400, "No exam has been assigned to you yet.");
    }
    const [exam] = await query("SELECT * FROM exams WHERE id = $1", [student.exam_id]);
    if (!exam) {
        throw new ApiError(400, "Your assigned exam could not be found.");
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
        const { rollNumber, password } = req.body;
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

        const valid = await bcrypt.compare(password, student.password_hash);
        if (!valid) {
            throw new ApiError(401, "Invalid roll number or password.");
        }

        const exam = await loadExamForLogin(student);
        const token = await finishLogin(student, exam);

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
