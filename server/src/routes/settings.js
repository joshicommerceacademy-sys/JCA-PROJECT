const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { getSettings } = require("../utils/settings");
const { releaseRollClaim } = require("../utils/grantReappear");
const { logExamEvent } = require("../utils/eventLog");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const settings = await getSettings();
        res.json({ status: "success", data: settings });
    })
);

router.put(
    "/",
    asyncHandler(async (req, res) => {
        const {
            seatNumberEnabled, ipCaptureEnabled, registrationAlertEnabled,
            studentLoginEnabled, maxSecurityWarnings, disableCopyEnabled,
            registrationLinkEnabled, resultLinkEnabled,
        } = req.body;

        if (maxSecurityWarnings !== undefined) {
            const n = Number(maxSecurityWarnings);
            if (!Number.isInteger(n) || n < 0) {
                throw new ApiError(400, "maxSecurityWarnings must be a whole number of 0 or more.");
            }
        }

        const current = await getSettings();
        const [updated] = await query(
            `UPDATE app_settings SET
                seat_number_enabled = $1,
                ip_capture_enabled = $2,
                registration_alert_enabled = $3,
                student_login_enabled = $4,
                max_security_warnings = $5,
                disable_copy_enabled = $6,
                registration_link_enabled = $7,
                result_link_enabled = $8,
                updated_at = now()
             WHERE id = 1 RETURNING *`,
            [
                seatNumberEnabled ?? current.seat_number_enabled,
                ipCaptureEnabled ?? current.ip_capture_enabled,
                registrationAlertEnabled ?? current.registration_alert_enabled,
                studentLoginEnabled ?? current.student_login_enabled,
                maxSecurityWarnings ?? current.max_security_warnings,
                disableCopyEnabled ?? current.disable_copy_enabled,
                registrationLinkEnabled ?? current.registration_link_enabled,
                resultLinkEnabled ?? current.result_link_enabled,
            ]
        );
        res.json({ status: "success", data: updated });
    })
);

router.put(
    "/password",
    asyncHandler(async (req, res) => {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            throw new ApiError(400, "Current password, new password and confirmation are all required.");
        }
        if (newPassword !== confirmNewPassword) {
            throw new ApiError(400, "New password and confirmation do not match.");
        }
        if (newPassword.length < 6) {
            throw new ApiError(400, "New password must be at least 6 characters.");
        }

        const [admin] = await query("SELECT * FROM admin_users WHERE id = $1", [req.admin.id]);
        if (!admin) throw new ApiError(404, "Admin account not found.");

        const valid = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!valid) throw new ApiError(401, "Current password is incorrect.");

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await query("UPDATE admin_users SET password_hash = $1 WHERE id = $2", [passwordHash, admin.id]);

        res.json({ status: "success", message: "Password updated." });
    })
);

// ---- Device Restart (Settings) -------------------------------------------------------------
// Exam names, then (when one is opened) its candidates with the device IP that was captured.
router.get(
    "/devices/exams",
    asyncHandler(async (req, res) => {
        const exams = await query(
            `SELECT COALESCE(registered_exam_id::text, name) AS key, MIN(name) AS name, MIN(id) AS id, COUNT(*)::int AS batches
             FROM exams WHERE status != 'cancelled' GROUP BY COALESCE(registered_exam_id::text, name) ORDER BY MIN(name)`
        );
        res.json({ status: "success", data: exams });
    })
);

router.get(
    "/devices",
    asyncHandler(async (req, res) => {
        const examId = Number(req.query.examId);
        if (!examId) throw new ApiError(400, "examId is required.");
        const [exam] = await query("SELECT id, name, registered_exam_id FROM exams WHERE id = $1", [examId]);
        if (!exam) throw new ApiError(404, "Exam not found.");
        const candidates = await query(
            `SELECT st.id, st.roll_number, st.full_name, st.last_ip, st.last_ip_at, st.pending_command,
                    ea.status AS attempt_status, ea.last_seen_at
             FROM students st
             JOIN exams e ON e.id = st.exam_id
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = st.exam_id
             WHERE e.id = $1 OR ($2::int IS NOT NULL AND e.registered_exam_id = $2)
             ORDER BY st.roll_number`,
            [exam.id, exam.registered_exam_id || null]
        );
        res.json({ status: "success", data: { examName: exam.name, candidates } });
    })
);

// One click restarts the device the candidate is on: wherever the link is open (mobile or any
// computer) it wipes the exam data stored on that device and returns to the login page. A running
// exam is put on Reappear so the candidate can continue with their remaining time.
router.post(
    "/devices/:studentId/restart",
    asyncHandler(async (req, res) => {
        const [student] = await query("SELECT id, exam_id, full_name, last_ip FROM students WHERE id = $1", [req.params.studentId]);
        if (!student) throw new ApiError(404, "Candidate not found.");
        if (!student.last_ip) throw new ApiError(400, "No device address has been captured for this candidate yet.");
        if (student.exam_id) {
            const [attempt] = await query("SELECT status, force_stopped_at FROM exam_attempts WHERE student_id = $1 AND exam_id = $2", [student.id, student.exam_id]);
            const [pending] = await query("SELECT id FROM reappear_requests WHERE student_id = $1 AND exam_id = $2 AND status = 'pending'", [student.id, student.exam_id]);
            // A running exam is only stopped (clock paused); Reappear is granted by the admin on the Reappear page.
            if (attempt?.status === "in_progress" && !pending && !attempt.force_stopped_at) {
                await query("UPDATE exam_attempts SET force_stopped_at = now() WHERE student_id = $1 AND exam_id = $2", [student.id, student.exam_id]);
            } else if (!attempt) await releaseRollClaim(student.id);
        }
        await query("UPDATE students SET pending_command = 'device_restart', pending_command_at = now() WHERE id = $1", [student.id]);
        await logExamEvent({ examId: student.exam_id, studentId: student.id, type: "device_restarted", detail: `Device restart sent (IP ${student.last_ip}); exam data on the device deleted`, ip: student.last_ip });
        res.json({ status: "success", message: `Restart sent to ${student.full_name}'s device.` });
    })
);

module.exports = router;
