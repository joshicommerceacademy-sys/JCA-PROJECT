const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { uploadStudentFiles } = require("../middleware/upload");
const { formatDobPassword } = require("../utils/idGenerators");
const { saveStudentUploads } = require("../utils/studentFiles");
const { nextApplicationId } = require("../utils/idGenerators");
const { autoAssignSlots } = require("../utils/slots");
const { SELECT_TICKET_JOIN } = require("../utils/hallTicketMail");
const { buildHallTicketPdf } = require("../utils/hallTicketPdf");
const { buildResultPdf } = require("../utils/resultPdf");

const router = express.Router();

// Settings > "Student registration link" / "Result link". When switched off, the public pages show
// that the service is not running and the API refuses the request.
const { getSettings } = require("../utils/settings");
const REGISTRATION_OFF = "Exam registration is not going on right now. If you have any problem, please contact Joshi Commerce Academy.";
const RESULT_OFF = "Results are not available right now. If you have any problem, please contact Joshi Commerce Academy.";
async function requireRegistrationOn(_req, _res, next) {
    try {
        const settings = await getSettings();
        if (settings.registration_link_enabled === false) throw new ApiError(403, REGISTRATION_OFF, "LINK_DISABLED");
        next();
    } catch (error) { next(error); }
}
async function requireResultOn(_req, _res, next) {
    try {
        const settings = await getSettings();
        if (settings.result_link_enabled === false) throw new ApiError(403, RESULT_OFF, "LINK_DISABLED");
        next();
    } catch (error) { next(error); }
}
router.get("/link-status", asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    res.json({
        status: "success",
        data: {
            registrationEnabled: settings.registration_link_enabled !== false,
            resultEnabled: settings.result_link_enabled !== false,
            registrationMessage: REGISTRATION_OFF,
            resultMessage: RESULT_OFF,
        },
    });
}));

router.get("/centres", asyncHandler(async (_req, res) => {
    const centres = await query("SELECT id, name, city FROM centres WHERE status = 'active' ORDER BY name");
    res.json({ status: "success", data: centres });
}));

// Exam names an admin has registered - the "Select Exam" list on the student registration page.
router.get("/exams", requireRegistrationOn, asyncHandler(async (_req, res) => {
    const exams = await query("SELECT id, name FROM registered_exams ORDER BY name");
    res.json({ status: "success", data: exams });
}));

// Exam names (same as the registration form) whose results the admin has enabled.
router.get("/result-exams", requireResultOn, asyncHandler(async (_req, res) => {
    const exams = await query(
        `SELECT re.id, re.name, bool_or(e.result_pdf_enabled) AS pdf_enabled
         FROM registered_exams re
         JOIN exams e ON e.registered_exam_id = re.id AND e.result_enabled = true
         WHERE EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.exam_id = e.id AND ea.status = 'submitted')
         GROUP BY re.id, re.name
         ORDER BY re.name`
    );
    res.json({ status: "success", data: exams.map((x) => ({ id: x.id, name: x.name, pdfEnabled: !!x.pdf_enabled })) });
}));

// The candidate's submitted attempt for an exam whose results are enabled.
async function findEnabledResult(examId, rollNumber) {
    if (!examId || !rollNumber || !String(rollNumber).trim()) throw new ApiError(400, "Enter your roll number.");
    const [result] = await query(
        `SELECT ea.*, st.roll_number, st.full_name AS student_name, st.photo_url, c.name AS centre_name,
                s.name AS standard_name, e.name AS exam_name, e.logo_url AS exam_logo_url,
                e.result_pdf_enabled
         FROM exam_attempts ea
         JOIN students st ON st.id = ea.student_id
         JOIN exams e ON e.id = ea.exam_id
         LEFT JOIN centres c ON c.id = st.centre_id
         LEFT JOIN standards s ON s.id = st.standard_id
         WHERE ea.status = 'submitted' AND e.result_enabled = true
           AND e.registered_exam_id = $1 AND upper(st.roll_number) = upper($2)
         ORDER BY ea.submitted_at DESC LIMIT 1`,
        [examId, String(rollNumber).trim()]
    );
    if (!result) throw new ApiError(404, "No result found for this roll number. It may not be enabled yet.");
    return result;
}

// Result summary shown first: marks obtained, total marks and pass / fail. The PDF is never sent
// here - the candidate has to ask for it with the Download PDF button (when the admin allowed it).
router.post("/result", requireResultOn, asyncHandler(async (req, res) => {
    const { examId, rollNumber } = req.body || {};
    const r = await findEnabledResult(examId, rollNumber);
    res.json({
        status: "success",
        data: {
            studentName: r.student_name,
            rollNumber: r.roll_number,
            examName: r.exam_name,
            marksObtained: Number(r.marks_obtained),
            totalMarks: Number(r.total_marks),
            percentage: Number(r.percentage),
            resultStatus: r.result_status,
            pdfAvailable: !!r.result_pdf_enabled,
        },
    });
}));

// Candidate result PDF (name, all questions and the answers they selected; no login/submit times).
// Only served when the admin enabled the result *and* chose to include the PDF.
router.post("/result-pdf", requireResultOn, asyncHandler(async (req, res) => {
    const { examId, rollNumber } = req.body || {};
    const result = await findEnabledResult(examId, rollNumber);
    if (!result.result_pdf_enabled) throw new ApiError(403, "The result PDF is not available for this exam.");
    const answers = await query(
        `SELECT eaa.*, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
                q.correct_answer, q.marks AS question_marks
         FROM exam_attempt_answers eaa JOIN questions q ON q.id = eaa.question_id
         WHERE eaa.attempt_id = $1 ORDER BY q.id`,
        [result.id]
    );
    const pdf = await buildResultPdf(result, answers, { hideTimes: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Result-${result.roll_number}.pdf"`);
    res.send(pdf);
}));

router.post("/registration", requireRegistrationOn, uploadStudentFiles, asyncHandler(async (req, res) => {
    const { fullName, email, phone, dob, gender, address, centreId, registeredExamId } = req.body;
    if (!fullName || !email || !phone || !dob || !centreId || !registeredExamId) {
        throw new ApiError(400, "Exam, full name, email, phone, date of birth and centre are required.");
    }
    const [regExam] = await query("SELECT id FROM registered_exams WHERE id = $1", [registeredExamId]);
    if (!regExam) throw new ApiError(400, "Please select a valid exam.");
    const [existing] = await query("SELECT id FROM students WHERE lower(email) = lower($1)", [email.trim()]);
    if (existing) throw new ApiError(409, "This email is already registered.");
    const [centre] = await query("SELECT id FROM centres WHERE id = $1 AND status = 'active'", [centreId]);
    if (!centre) throw new ApiError(400, "Please select an active exam centre.");

    const applicationId = await nextApplicationId();
    const passwordHash = await bcrypt.hash(formatDobPassword(dob), 10);
    const [student] = await query(
        `INSERT INTO students (roll_number, full_name, email, phone, dob, gender, address, centre_id, photo_url, signature_url, password_hash, status, registered_exam_id, application_id)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12)
         RETURNING id, full_name, email, status, created_at, application_id`,
        [fullName.trim(), email.trim().toLowerCase(), phone.trim(), dob, gender || null, address || null, centreId, null, null, passwordHash, regExam.id, applicationId]
    );
    await saveStudentUploads(student.id, req.files);
    autoAssignSlots(regExam.id).catch((error) => console.error("Auto batch allocation failed:", error.message));
    res.status(201).json({ status: "success", message: "Registration submitted. The academy will verify your registration.", data: student });
}));

// "Track Your Application": status by application ID, and the hall ticket PDF once verified.
router.get("/track/:applicationId", asyncHandler(async (req, res) => {
    const id = String(req.params.applicationId || "").trim().toUpperCase();
    const [row] = await query(
        `SELECT st.full_name, st.status, st.created_at, st.verified_at, re.name AS exam_name,
                (SELECT ht.id FROM hall_tickets ht WHERE ht.student_id = st.id AND ht.status = 'generated' ORDER BY ht.id DESC LIMIT 1) AS hall_ticket_id,
                (SELECT ht.created_at FROM hall_tickets ht WHERE ht.student_id = st.id AND ht.status = 'generated' ORDER BY ht.id DESC LIMIT 1) AS hall_ticket_at
         FROM students st LEFT JOIN registered_exams re ON re.id = st.registered_exam_id
         WHERE st.application_id = $1`,
        [id]
    );
    if (!row) throw new ApiError(404, "No application found with this ID.");
    res.json({
        status: "success",
        data: {
            applicationId: id,
            fullName: row.full_name,
            examName: row.exam_name,
            verified: row.status === "allowed",
            hallTicketReady: row.status === "allowed" && !!row.hall_ticket_id,
            submittedAt: row.created_at,
            approvedAt: row.status === "allowed" ? row.verified_at : null,
            hallTicketGeneratedAt: row.hall_ticket_id ? row.hall_ticket_at : null,
        },
    });
}));

// The same DOB-password-protected PDF that is emailed. Only for verified applications.
router.get("/hall-ticket/:applicationId", asyncHandler(async (req, res) => {
    const id = String(req.params.applicationId || "").trim().toUpperCase();
    const [ticket] = await query(
        `${SELECT_TICKET_JOIN} WHERE ht.status = 'generated' AND st.status = 'allowed' AND st.application_id = $1 ORDER BY ht.id DESC LIMIT 1`,
        [id]
    );
    if (!ticket) throw new ApiError(404, "Hall ticket is not available yet. It is issued once your application is verified and the exam is scheduled.");
    const pdf = await buildHallTicketPdf(ticket);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `attachment; filename="${ticket.hall_ticket_number}.pdf"`);
    res.send(pdf);
}));

module.exports = router;
