const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { deskLogins } = require("../utils/deskUser");
const { logExamEvent } = require("../utils/eventLog");
const { buildDeskReportPdf } = require("../utils/deskReportPdf");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        if (!examId) throw new ApiError(400, "examId is required.");

        const [exam] = await query(
            `SELECT e.*, (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS question_count_actual
             FROM exams e WHERE e.id = $1`,
            [examId]
        );
        if (!exam) throw new ApiError(404, "Exam not found.");

        const candidates = await query(
            `SELECT st.id, st.roll_number, st.full_name, st.gender, c.name AS centre_name, s.name AS standard_name,
                    st.checked_in_at, ea.started_at, ea.ends_at, ea.status AS attempt_status,
                    ea.submitted_at, ea.submit_reason, COALESCE(ea.ip_address, st.last_ip) AS ip_address, ht.seat_number,
                    GREATEST(ea.last_seen_at, (SELECT MAX(a.answered_at) FROM exam_attempt_answers a WHERE a.attempt_id = ea.id)) AS last_activity_at,
                    EXISTS (SELECT 1 FROM reappear_requests rr WHERE rr.student_id = st.id AND rr.exam_id = st.exam_id AND rr.status = 'pending') AS has_reappear,
                    (SELECT rr.remaining_minutes FROM reappear_requests rr WHERE rr.student_id = st.id AND rr.exam_id = st.exam_id AND rr.status = 'pending' ORDER BY rr.id DESC LIMIT 1) AS reappear_minutes,
                    ea.force_stopped_at,
                    CASE WHEN ea.force_stopped_at IS NOT NULL THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (ea.ends_at - ea.force_stopped_at)) / 60))::int END AS frozen_minutes,
                    (SELECT COUNT(*) FROM exam_attempt_answers a WHERE a.attempt_id = ea.id) AS answered_count
             FROM students st
             LEFT JOIN centres c ON c.id = st.centre_id
             LEFT JOIN standards s ON s.id = st.standard_id
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = st.exam_id
             LEFT JOIN hall_tickets ht ON ht.student_id = st.id AND ht.exam_id = st.exam_id
             WHERE st.status = 'allowed' AND st.exam_id = $1
             ORDER BY st.roll_number`,
            [examId]
        );

        const centres = await query(
            `SELECT c.name, c.code, c.city, c.address,
                    COALESCE((SELECT SUM(l.capacity) FROM centre_labs l WHERE l.centre_id = c.id), 0)::int AS capacity
             FROM centres c
             WHERE c.id IN (SELECT centre_id FROM exam_centres WHERE exam_id = $1 UNION SELECT $2::int)
             ORDER BY c.name`,
            [examId, exam.centre_id]
        );

        const [firstStart] = await query(
            "SELECT MIN(started_at) AS first_started_at FROM exam_attempts WHERE exam_id = $1",
            [examId]
        );

        res.json({
            status: "success",
            data: {
                centres,
                exam: {
                    id: exam.id,
                    name: exam.name,
                    examDate: exam.exam_date,
                    startTime: exam.start_time,
                    durationMinutes: exam.duration_minutes,
                    questionCount: Number(exam.question_count_actual),
                    status: exam.status,
                    startedAt: exam.started_at,
                    stoppedAt: exam.stopped_at,
                    firstCandidateStartedAt: firstStart?.first_started_at || null,
                },
                candidates,
            },
        });
    })
);

// Restart Exam: stops one candidate's running exam on the spot. The candidate's device is sent back to
// the login page and they cannot get back in - nothing else happens automatically. The clock is
// paused at the time that was left; the admin then grants Reappear from the Reappear page (which is
// where the candidate shows up) when the candidate may continue.
router.post(
    "/restart",
    asyncHandler(async (req, res) => {
        const { studentId } = req.body;
        const [student] = await query("SELECT id, exam_id, roll_number, full_name, last_ip FROM students WHERE id = $1", [studentId]);
        if (!student || !student.exam_id) throw new ApiError(404, "Candidate not found.");
        const [attempt] = await query(
            "SELECT status, force_stopped_at FROM exam_attempts WHERE student_id = $1 AND exam_id = $2",
            [student.id, student.exam_id]
        );
        if (!attempt || attempt.status !== "in_progress") {
            throw new ApiError(400, "This candidate's exam is not running, so there is nothing to restart.");
        }
        if (attempt.force_stopped_at) throw new ApiError(409, "This candidate's exam is already stopped. Grant Reappear from the Reappear page.");
        await query("UPDATE exam_attempts SET force_stopped_at = now() WHERE student_id = $1 AND exam_id = $2", [student.id, student.exam_id]);
        await query("UPDATE students SET pending_command = 'restart', pending_command_at = now() WHERE id = $1", [student.id]);
        await logExamEvent({ examId: student.exam_id, studentId: student.id, type: "exam_restarted", detail: "Exam stopped on the spot by admin (Restart Exam); time paused, waiting for Reappear", ip: student.last_ip });
        res.json({ status: "success", message: `${student.full_name}'s exam was stopped. Grant Reappear from the Reappear page when they may continue.` });
    })
);

// Verification Desk status of every exam: Logged in (signed in, nobody verified yet), Active (signed in
// and verifying) or Inactive (never signed in, or not seen for 30 minutes).
async function deskStatuses(exams) {
    const centreRows = await query("SELECT ec.exam_id, c.id, c.name, c.code FROM exam_centres ec JOIN centres c ON c.id = ec.centre_id ORDER BY c.name");
    const sessions = await query("SELECT exam_id, user_id, last_login_at, last_seen_at FROM desk_sessions");
    const allowedAt = await query("SELECT exam_id, MAX(exam_access_allowed_at) AS at FROM students WHERE exam_id IS NOT NULL GROUP BY exam_id");
    const disallowAt = await query("SELECT exam_id, MAX(occurred_at) AS at FROM exam_event_log WHERE event_type = 'desk_disallowed' GROUP BY exam_id");
    const ACTIVE_MS = 30 * 60 * 1000;
    return exams.map((e) => {
        const group = exams.filter((x) => x.id === e.id || (e.registered_exam_id && x.registered_exam_id === e.registered_exam_id)).map((x) => x.id);
        const lastAction = [...allowedAt, ...disallowAt]
            .filter((r) => group.includes(r.exam_id) && r.at)
            .reduce((m, r) => (!m || new Date(r.at) > m ? new Date(r.at) : m), null);
        const logins = deskLogins(e, centreRows.filter((r) => r.exam_id === e.id)).map((l) => {
            const mine = sessions.filter((x) => group.includes(x.exam_id) && x.user_id === l.userId);
            const lastSeen = mine.reduce((m, x) => (!m || new Date(x.last_seen_at) > m ? new Date(x.last_seen_at) : m), null);
            const lastLogin = mine.reduce((m, x) => (!m || new Date(x.last_login_at) > m ? new Date(x.last_login_at) : m), null);
            const fresh = !!lastSeen && Date.now() - lastSeen.getTime() < ACTIVE_MS;
            const verifying = !!lastAction && !!lastLogin && lastAction >= lastLogin;
            const status = !fresh ? "inactive" : verifying ? "active" : "logged_in";
            return { userId: l.userId, centreName: l.centreName, status, lastLoginAt: lastLogin, lastSeenAt: lastSeen };
        });
        const status = logins.some((l) => l.status === "active") ? "active" : logins.some((l) => l.status === "logged_in") ? "logged_in" : "inactive";
        return { exam: e, logins, status, centres: centreRows.filter((r) => r.exam_id === e.id).map((r) => r.name) };
    });
}

// Reports > Verification Desk: one row per exam with the desk's status.
router.get(
    "/desk-report",
    asyncHandler(async (_req, res) => {
        const exams = await query("SELECT * FROM exams WHERE status != 'cancelled' ORDER BY exam_date DESC, start_time DESC");
        const rows = (await deskStatuses(exams)).map(({ exam: e, logins, status }) => ({
            examId: e.id, name: e.name, examDate: e.exam_date, startTime: e.start_time, stopped: !!e.stopped_at, logins, status,
        }));
        res.json({ status: "success", data: { exams: rows } });
    })
);

// Clicking an exam name downloads its Verification Desk report (PDF, built on the fly).
router.get(
    "/desk-report-pdf",
    asyncHandler(async (req, res) => {
        const examId = Number(req.query.examId);
        const exams = await query("SELECT * FROM exams WHERE status != 'cancelled'");
        const item = (await deskStatuses(exams)).find((x) => x.exam.id === examId);
        if (!item) throw new ApiError(404, "Exam not found.");
        const students = await query(
            `SELECT st.id, st.roll_number, st.full_name, st.exam_access_allowed, st.exam_access_allowed_at, st.disallow_reason, st.marked_absent,
                    ht.seat_number, l.name AS lab_name
             FROM students st
             LEFT JOIN hall_tickets ht ON ht.student_id = st.id AND ht.exam_id = st.exam_id AND ht.status = 'generated'
             LEFT JOIN centre_labs l ON l.id = ht.seat_lab_id
             WHERE st.exam_id = $1 ORDER BY st.roll_number`,
            [examId]
        );
        const allowed = students.filter((s) => s.exam_access_allowed);
        const disallowed = students.filter((s) => !s.exam_access_allowed && s.disallow_reason);
        const absent = students.filter((s) => s.marked_absent && !s.exam_access_allowed).length;
        const counts = {
            total: students.length, allowed: allowed.length, disallowed: disallowed.length, absent,
            waiting: students.length - allowed.length - disallowed.length - absent,
        };
        const pdf = await buildDeskReportPdf({ exam: item.exam, venue: item.centres.join(" / "), logins: item.logins, allowed, disallowed, counts });
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `attachment; filename="verification-desk-report-${examId}.pdf"`);
        res.set("Cache-Control", "no-store");
        res.send(pdf);
    })
);

module.exports = router;
