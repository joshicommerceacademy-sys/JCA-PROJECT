const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { buildAttendanceReportPdf } = require("../utils/attendanceReportPdf");

const router = express.Router();
router.use(requireAdmin);

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { examId } = req.query;
        const clauses = ["st.status = 'allowed'"];
        const params = [];
        if (examId) {
            params.push(examId);
            clauses.push(`st.exam_id = $${params.length}`);
        }

        const rows = await query(
            `SELECT st.id, st.roll_number, st.full_name, c.name AS centre_name, s.name AS standard_name,
                    st.checked_in_at, ea.started_at, ea.submitted_at, ea.status AS attempt_status
             FROM students st
             LEFT JOIN centres c ON c.id = st.centre_id
             LEFT JOIN standards s ON s.id = st.standard_id
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = st.exam_id
             WHERE ${clauses.join(" AND ")}
             ORDER BY st.roll_number`,
            params
        );
        res.json({ status: "success", data: rows });
    })
);

// Admin-triggered whole-exam attendance report: access-granted / login / submit timestamps
// (all down to the second) for every allowed candidate, as a downloadable PDF.
router.get(
    "/:examId/report-pdf",
    asyncHandler(async (req, res) => {
        const [exam] = await query("SELECT id, name, exam_date, start_time FROM exams WHERE id = $1", [req.params.examId]);
        if (!exam) throw new ApiError(404, "Exam not found.");

        const rows = await query(
            `SELECT st.roll_number, st.full_name, st.checked_in_at, ea.started_at, ea.submitted_at
             FROM students st
             LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = st.exam_id
             WHERE st.exam_id = $1 AND st.status = 'allowed'
             ORDER BY st.roll_number`,
            [exam.id]
        );

        const pdfBuffer = await buildAttendanceReportPdf(exam, rows);
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `attachment; filename="attendance-report-${exam.id}.pdf"`);
        res.send(pdfBuffer);
    })
);

module.exports = router;
