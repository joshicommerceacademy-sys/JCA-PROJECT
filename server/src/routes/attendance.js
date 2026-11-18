const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { buildAttendanceReportPdf } = require("../utils/attendanceReportPdf");
const { isDeskClosed } = require("../utils/deskUser");
const { attendanceRemarks } = require("../utils/attendanceRemarks");
const { grantReappear, releaseRollClaim } = require("../utils/grantReappear");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        // Candidates appear once the Verification Desk grants them exam access.
        // Candidates appear once granted access. After the exam's Verification Desk closes, anyone
        // who was never allowed is listed too, marked Absent.
        let closed = false;
        if (examId) {
            const [exam] = await query("SELECT * FROM exams WHERE id = $1", [examId]);
            closed = !!exam && isDeskClosed(exam);
        }
        const clauses = closed ? [] : ["((st.status = 'allowed' AND st.exam_access_allowed = true) OR st.marked_absent)"];
        const params = [];
        if (examId) {
            params.push(examId);
            clauses.push(`st.exam_id = $${params.length}`);
        }

        const rows = await query(
            `SELECT st.id, st.roll_number, st.full_name, c.name AS centre_name, s.name AS standard_name,
                    st.exam_access_allowed_at AS access_at, st.login_at, st.login_claimed_at AS roll_selected_at, ea.started_at, ea.submitted_at, ea.status AS attempt_status, ea.submit_reason, ea.ip_address, st.exam_access_allowed, st.marked_absent, st.exam_id, e.exam_date, e.start_time,
                    (SELECT ht.seat_number FROM hall_tickets ht WHERE ht.student_id = st.id AND ht.exam_id = st.exam_id AND ht.status = 'generated' ORDER BY ht.id DESC LIMIT 1) AS seat_number,
                    (SELECT l.name FROM hall_tickets ht JOIN centre_labs l ON l.id = ht.seat_lab_id WHERE ht.student_id = st.id AND ht.exam_id = st.exam_id AND ht.status = 'generated' ORDER BY ht.id DESC LIMIT 1) AS lab_name
             FROM students st
             LEFT JOIN centres c ON c.id = st.centre_id
             LEFT JOIN standards s ON s.id = st.standard_id
             LEFT JOIN exams e ON e.id = st.exam_id
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = st.exam_id
             WHERE ${clauses.join(" AND ")}
             ORDER BY st.roll_number`,
            params
        );
        res.json({
            status: "success",
            data: rows.map((r) => {
                const absent = r.marked_absent || (closed && !r.exam_access_allowed);
                // Re-enable is offered while the candidate holds the roll number (selected it, or
                // started the exam) and has not finished - once submitted there is nothing to resume.
                const canReenable = !absent && r.attempt_status !== "submitted" && (!!r.roll_selected_at || !!r.started_at);
                return { ...r, absent, can_reenable: canReenable, ...attendanceRemarks({ ...r, absent }) };
            }),
        });
    })
);

// Re-enable a candidate's roll number for login. If their exam was already started this grants a
// reappear (they resume with the time that was left); if they only selected the roll number it
// just releases the claim. Either way the roll number shows up on the login page again.
router.post(
    "/:studentId/re-enable",
    asyncHandler(async (req, res) => {
        const [student] = await query("SELECT id, exam_id FROM students WHERE id = $1", [req.params.studentId]);
        if (!student) throw new ApiError(404, "Student not found.");
        const [attempt] = await query(
            "SELECT status FROM exam_attempts WHERE student_id = $1 AND exam_id = $2",
            [student.id, student.exam_id]
        );
        if (attempt?.status === "submitted") {
            throw new ApiError(400, "This candidate has already submitted the exam, so the roll number cannot be re-enabled.");
        }
        if (attempt) {
            await grantReappear(student.id, student.exam_id, req.body?.reason || "Re-enabled from Attendance");
        } else {
            await releaseRollClaim(student.id);
        }
        res.json({ status: "success", message: "Roll number re-enabled for login." });
    })
);

// Admin-triggered whole-exam attendance report: access-granted / login / submit timestamps
// (all down to the second) for every allowed candidate, as a downloadable PDF.
router.get(
    "/:examId/report-pdf",
    asyncHandler(async (req, res) => {
        const [exam] = await query("SELECT id, name, exam_date, start_time, seat_number_required, stopped_at, logo_url FROM exams WHERE id = $1", [req.params.examId]);
        if (!exam) throw new ApiError(404, "Exam not found.");

        const rows = await query(
            `SELECT st.roll_number, st.full_name, st.exam_access_allowed_at AS checked_in_at, st.exam_access_allowed_at AS access_at,
                    st.login_at AS started_at, ea.submitted_at, ea.submit_reason, e.exam_date, e.start_time, st.marked_absent AS absent
             FROM students st
             JOIN exams e ON e.id = st.exam_id
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = st.exam_id
             WHERE st.exam_id = $1 AND ((st.status = 'allowed' AND st.exam_access_allowed = true) OR st.marked_absent)
             ORDER BY st.roll_number`,
            [exam.id]
        );

        // The report is only produced once the exam (this batch) has been stopped.
        if (!exam.stopped_at) {
            throw new ApiError(400, "The attendance report is available after the exam has been stopped.");
        }

        const withRemarks = rows.map((r) => ({ ...r, ...attendanceRemarks(r) }));
        const pdfBuffer = await buildAttendanceReportPdf(exam, withRemarks);
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `attachment; filename="attendance-report-${exam.id}.pdf"`);
        res.send(pdfBuffer);
    })
);

module.exports = router;
