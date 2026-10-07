const express = require("express");
const crypto = require("crypto");
const { query, pool } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { uploadExamLogo } = require("../middleware/upload");
const { shuffle } = require("../utils/shuffle");
const { buildAttendanceSheetPdf } = require("../utils/attendanceSheetPdf");
const { getSettings } = require("../utils/settings");

const router = express.Router();
router.use(requireAdmin);

const SELECT_EXAM = `
    SELECT e.*, s.name AS standard_name, c.name AS centre_name,
           (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS question_count_actual,
           (SELECT COUNT(*) FROM students st WHERE st.exam_id = e.id AND st.status = 'allowed') AS candidate_count
    FROM exams e
    LEFT JOIN standards s ON s.id = e.standard_id
    LEFT JOIN centres c ON c.id = e.centre_id
`;

router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { accessPassword } = req.query;
        // Used by the Verification page's password gate: resolve which one started exam
        // a 6-digit password belongs to, instead of a separate lookup endpoint.
        if (accessPassword) {
            const exams = await query(
                `${SELECT_EXAM} WHERE e.access_password = $1 AND e.started_at IS NOT NULL`,
                [accessPassword]
            );
            return res.json({ status: "success", data: exams });
        }
        const exams = await query(`${SELECT_EXAM} ORDER BY e.id DESC`);
        res.json({ status: "success", data: exams });
    })
);

router.get(
    "/:id",
    asyncHandler(async (req, res) => {
        const [exam] = await query(`${SELECT_EXAM} WHERE e.id = $1`, [req.params.id]);
        if (!exam) throw new ApiError(404, "Exam not found.");

        const sections = await query(
            "SELECT * FROM exam_sections WHERE exam_id = $1 ORDER BY ordinal",
            [req.params.id]
        );
        const questions = await query(
            `SELECT eq.ordinal, eq.section_id, q.* FROM exam_questions eq
             JOIN questions q ON q.id = eq.question_id
             WHERE eq.exam_id = $1 ORDER BY eq.ordinal`,
            [req.params.id]
        );
        res.json({ status: "success", data: { ...exam, sections, questions } });
    })
);

router.get(
    "/:id/attendance-sheet",
    asyncHandler(async (req, res) => {
        const [exam] = await query(`${SELECT_EXAM} WHERE e.id = $1`, [req.params.id]);
        if (!exam) throw new ApiError(404, "Exam not found.");

        const students = await query(
            "SELECT roll_number, full_name FROM students WHERE exam_id = $1 AND status = 'allowed' ORDER BY roll_number",
            [exam.id]
        );

        const pdfBuffer = await buildAttendanceSheetPdf(exam, students);
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `attachment; filename="attendance-${exam.id}.pdf"`);
        res.send(pdfBuffer);
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const {
            name, standardId, centreId, examDate, startTime,
            durationMinutes, sections, passingPercentage, notes,
            loginWindowMinutes, gracePeriodMinutes, showProvisionalResult, compensateLateLogin,
            negativeMarking, seatNumberRequired,
        } = req.body;

        if (!name || !standardId || !centreId || !examDate || !startTime || !durationMinutes) {
            throw new ApiError(400, "Name, standard, centre, date, start time and duration are required.");
        }
        if (!Array.isArray(sections) || sections.length < 1 || sections.length > 4) {
            throw new ApiError(400, "Pick 1 to 4 subject sections, each with a question bank.");
        }
        for (const section of sections) {
            const hasManualPick = Array.isArray(section.questionIds) && section.questionIds.length > 0;
            if (!section.bankId || (!section.questionCount && !hasManualPick)) {
                throw new ApiError(400, "Every section needs a question bank and either a question count or hand-picked questions.");
            }
        }

        const [existing] = await query("SELECT id FROM exams WHERE lower(name) = lower($1)", [name]);
        if (existing) throw new ApiError(409, "An exam with this name already exists.");

        // Resolve each section's bank + its published questions up front, so a bad bank id
        // or an empty bank fails before anything is written.
        const resolvedSections = [];
        for (const section of sections) {
            const [bank] = await query(
                "SELECT id, name, subject FROM question_banks WHERE id = $1 AND status = 'published'",
                [section.bankId]
            );
            if (!bank) throw new ApiError(400, `Question bank ${section.bankId} was not found or isn't published.`);

            if (Array.isArray(section.questionIds) && section.questionIds.length > 0) {
                // Manual pick: admin chose exact questions for this section — verify every id
                // actually belongs to this bank and is published, in the order given.
                const picked = await query(
                    "SELECT id FROM questions WHERE bank_id = $1 AND status = 'published' AND id = ANY($2::int[])",
                    [bank.id, section.questionIds]
                );
                const pickedIds = new Set(picked.map((q) => q.id));
                const missing = section.questionIds.filter((id) => !pickedIds.has(id));
                if (missing.length > 0) {
                    throw new ApiError(400, `One or more selected questions for "${bank.name}" don't exist or aren't published.`);
                }
                resolvedSections.push({
                    bankId: bank.id,
                    subjectLabel: bank.subject || bank.name,
                    questionIds: section.questionIds,
                });
                continue;
            }

            const eligibleQuestions = await query(
                "SELECT id FROM questions WHERE bank_id = $1 AND status = 'published'",
                [bank.id]
            );
            if (eligibleQuestions.length === 0) {
                throw new ApiError(400, `"${bank.name}" has no published questions. Publish some first.`);
            }

            const chosen = shuffle(eligibleQuestions).slice(0, Math.min(section.questionCount, eligibleQuestions.length));
            resolvedSections.push({
                bankId: bank.id,
                subjectLabel: bank.subject || bank.name,
                questionIds: chosen.map((q) => q.id),
            });
        }

        const totalQuestionCount = resolvedSections.reduce((sum, s) => sum + s.questionIds.length, 0);

        // The per-exam toggle only means anything when the admin has turned the feature on
        // globally in Settings — silently ignore it (rather than error) if seatNumberRequired
        // was sent while the master switch is off, so a stale client can't enforce a check the
        // admin has since disabled.
        const settings = await getSettings();
        const effectiveSeatNumberRequired = settings.seat_number_enabled && seatNumberRequired === true;

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const examResult = await client.query(
                `INSERT INTO exams
                    (name, standard_id, centre_id, exam_date, start_time, duration_minutes,
                     question_count, passing_percentage, notes, login_window_minutes, grace_period_minutes,
                     show_provisional_result, compensate_late_login, negative_marking, seat_number_required, access_password)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
                [
                    name, standardId, centreId, examDate, startTime, durationMinutes,
                    totalQuestionCount, passingPercentage || 40, notes || null,
                    loginWindowMinutes || 30, gracePeriodMinutes || 25,
                    showProvisionalResult !== false, compensateLateLogin !== false,
                    negativeMarking === true, effectiveSeatNumberRequired,
                    String(crypto.randomInt(100000, 1000000)),
                ]
            );
            const exam = examResult.rows[0];

            let ordinal = 1;
            let shortfall = false;
            for (let s = 0; s < resolvedSections.length; s++) {
                const section = resolvedSections[s];
                if (section.questionIds.length < sections[s].questionCount) shortfall = true;

                const sectionResult = await client.query(
                    `INSERT INTO exam_sections (exam_id, bank_id, subject_label, question_count, ordinal)
                     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [exam.id, section.bankId, section.subjectLabel, section.questionIds.length, s + 1]
                );
                const sectionId = sectionResult.rows[0].id;

                for (const questionId of section.questionIds) {
                    await client.query(
                        "INSERT INTO exam_questions (exam_id, question_id, ordinal, section_id) VALUES ($1, $2, $3, $4)",
                        [exam.id, questionId, ordinal, sectionId]
                    );
                    ordinal += 1;
                }
            }

            await client.query("COMMIT");
            res.status(201).json({
                status: "success",
                data: exam,
                message: shortfall
                    ? "Some sections had fewer published questions than requested; the exam was created with fewer questions in those sections."
                    : undefined,
            });
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    })
);

// Uploading the logo is a separate step from POST / (rather than a multipart create-exam
// form) so the JSON exam-creation flow — sections, question picking, all the validation
// above — doesn't have to be rewritten around multipart/form-data just for this one
// optional field. The client calls this immediately after a successful create when the
// admin picked a logo file.
router.post("/:id/logo", (req, res) => {
    uploadExamLogo(req, res, async (err) => {
        if (err) return res.status(400).json({ status: "error", message: err.message });
        if (!req.file) return res.status(400).json({ status: "error", message: "No logo file uploaded." });

        try {
            const logoUrl = `/uploads/logos/${req.file.filename}`;
            const [exam] = await query(
                "UPDATE exams SET logo_url = $1, updated_at = now() WHERE id = $2 RETURNING *",
                [logoUrl, req.params.id]
            );
            if (!exam) return res.status(404).json({ status: "error", message: "Exam not found." });
            res.json({ status: "success", data: exam });
        } catch (error) {
            console.error(error);
            res.status(500).json({ status: "error", message: error.message || "Server error" });
        }
    });
});

router.put(
    "/:id/status",
    asyncHandler(async (req, res) => {
        const { status } = req.body;
        const allowed = ["upcoming", "ongoing", "completed", "cancelled"];
        if (!allowed.includes(status)) throw new ApiError(400, "Invalid status.");

        const [exam] = await query(
            "UPDATE exams SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
            [status, req.params.id]
        );
        if (!exam) throw new ApiError(404, "Exam not found.");
        res.json({ status: "success", data: exam });
    })
);

// Timestamps the moment admin clicks Start Exam and reveals (generating once, on
// first click) the 6-digit access password students must enter before they can reach
// the login form for this exam, and that also gates the Verification page for this
// exam. Idempotent — later clicks just re-reveal the same password.
router.put(
    "/:id/start",
    asyncHandler(async (req, res) => {
        const [exam] = await query("SELECT * FROM exams WHERE id = $1", [req.params.id]);
        if (!exam) throw new ApiError(404, "Exam not found.");

        if (!exam.started_at) {
            const password = String(crypto.randomInt(100000, 1000000));
            await query(
                "UPDATE exams SET started_at = now(), access_password = $1, updated_at = now() WHERE id = $2",
                [password, exam.id]
            );
        }

        const [updated] = await query(`${SELECT_EXAM} WHERE e.id = $1`, [exam.id]);
        res.json({ status: "success", data: updated });
    })
);

router.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const { name, centreId, examDate, startTime, durationMinutes, notes, seatNumberRequired } = req.body;
        if (!name || !centreId || !examDate || !startTime || !durationMinutes) {
            throw new ApiError(400, "Name, centre, date, start time and duration are required.");
        }

        const settings = await getSettings();
        const effectiveSeatNumberRequired = settings.seat_number_enabled && seatNumberRequired === true;

        const [exam] = await query(
            `UPDATE exams SET name = $1, centre_id = $2, exam_date = $3, start_time = $4,
                duration_minutes = $5, notes = $6, seat_number_required = $7, updated_at = now()
             WHERE id = $8 RETURNING *`,
            [name, centreId, examDate, startTime, durationMinutes, notes || null, effectiveSeatNumberRequired, req.params.id]
        );
        if (!exam) throw new ApiError(404, "Exam not found.");
        res.json({ status: "success", data: exam });
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const result = await query("DELETE FROM exams WHERE id = $1 RETURNING id", [req.params.id]);
        if (!result.length) throw new ApiError(404, "Exam not found.");
        res.json({ status: "success", message: "Exam deleted." });
    })
);

module.exports = router;
