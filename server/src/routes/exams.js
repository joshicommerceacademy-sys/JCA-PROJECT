const express = require("express");
const crypto = require("crypto");
const { query, pool } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/auth");
const { uploadExamLogo } = require("../middleware/upload");
const { shuffle } = require("../utils/shuffle");
const { buildAttendanceSheetPdf } = require("../utils/attendanceSheetPdf");
const { getSettings } = require("../utils/settings");
const { generateHallTickets } = require("../utils/hallTicketGenerator");
const { deskUserId, deskLogins } = require("../utils/deskUser");
const { submitAttempt } = require("../utils/submitAttempt");
const { autoAssignSlots } = require("../utils/slots");
const { logExamEvent } = require("../utils/eventLog");
const { reapplyExamPasswords } = require("../utils/examPassword");
const { buildActivityLogPdf, collectActivityRows } = require("../utils/activityLogPdf");

// Exam login password mode: dob (default) | system | own (needs the password the admin typed in).
function parsePasswordMode(mode, ownPassword) {
    const m = ["dob", "system", "own"].includes(mode) ? mode : "dob";
    const own = String(ownPassword || "").trim();
    if (m === "own" && own.length < 4) {
        throw new ApiError(400, "Enter the password you want to use (at least 4 characters) for the 'Own password' option.");
    }
    return { mode: m, own: m === "own" ? own.slice(0, 40) : null };
}

const router = express.Router();
router.use(requireAdmin);

const SELECT_EXAM = `
    SELECT e.*, s.name AS standard_name, COALESCE((SELECT string_agg(DISTINCT c2.name, ' / ' ORDER BY c2.name) FROM exam_centres ec JOIN centres c2 ON c2.id = ec.centre_id WHERE ec.exam_id = e.id), c.name) AS centre_name,
           (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS question_count_actual,
           (SELECT COUNT(*) FROM students st WHERE st.exam_id = e.id AND st.status = 'allowed') AS candidate_count
    FROM exams e
    LEFT JOIN standards s ON s.id = e.standard_id
    LEFT JOIN centres c ON c.id = e.centre_id
`;

// Blank / missing means the Verification Desk never closes on its own.
function parseCloseMinutes(value) {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 600) throw new ApiError(400, "Verification desk close time must be a whole number of minutes between 0 and 600.");
    return n;
}

function validateSections(sectionList) {
    if (sectionList.length > 4) {
        throw new ApiError(400, "Pick at most 4 subject sections.");
    }
    for (const section of sectionList) {
        const hasManualPick = Array.isArray(section.questionIds) && section.questionIds.length > 0;
        if (!section.bankId || (!section.questionCount && !hasManualPick)) {
            throw new ApiError(400, "Every section needs a question bank and either a question count or hand-picked questions.");
        }
    }
}

// Resolve each section's bank + its published questions up front, so a bad bank id
// or an empty bank fails before anything is written.
async function resolveSections(sectionList) {
    // Resolve each section's bank + its published questions up front, so a bad bank id
    // or an empty bank fails before anything is written.
    const resolvedSections = [];
    for (const section of sectionList) {
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
    return resolvedSections;
}

// Writes the resolved sections and their frozen questions for an exam. Returns true when a
// random-count section had fewer published questions than requested.
async function insertSections(client, examId, resolvedSections, sectionList, startOrdinal = 1) {
    let ordinal = startOrdinal;
    let shortfall = false;
    for (let s = 0; s < resolvedSections.length; s++) {
        const section = resolvedSections[s];
        if (section.questionIds.length < sectionList[s].questionCount) shortfall = true;

        const sectionResult = await client.query(
            `INSERT INTO exam_sections (exam_id, bank_id, subject_label, question_count, ordinal, manual_pick)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [examId, section.bankId, section.subjectLabel, section.questionIds.length, s + 1, Array.isArray(sectionList[s].questionIds) && sectionList[s].questionIds.length > 0]
        );
        const sectionId = sectionResult.rows[0].id;

        for (const questionId of section.questionIds) {
            await client.query(
                "INSERT INTO exam_questions (exam_id, question_id, ordinal, section_id) VALUES ($1, $2, $3, $4)",
                [examId, questionId, ordinal, sectionId]
            );
            ordinal += 1;
        }
    }
    return shortfall;
}

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
        const centreRows = await query(
            `SELECT ec.exam_id, c.id, c.name, c.code FROM exam_centres ec JOIN centres c ON c.id = ec.centre_id ORDER BY c.name`
        );
        res.json({
            status: "success",
            data: exams.map((e) => ({
                ...e,
                desk_user_id: deskUserId(e.name),
                desk_logins: deskLogins(e, centreRows.filter((r) => r.exam_id === e.id)),
            })),
        });
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
            `SELECT st.roll_number, st.full_name, st.photo_url, st.signature_url, ht.seat_number, l.name AS lab_name
             FROM students st
             LEFT JOIN hall_tickets ht ON ht.student_id = st.id AND ht.exam_id = st.exam_id AND ht.status = 'generated'
             LEFT JOIN centre_labs l ON l.id = ht.seat_lab_id
             WHERE st.exam_id = $1 AND st.status = 'allowed' ORDER BY st.roll_number`,
            [exam.id]
        );

        const pdfBuffer = await buildAttendanceSheetPdf(exam, students);
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `attachment; filename="attendance-${exam.id}.pdf"`);
        res.send(pdfBuffer);
    })
);

// Activity Log PDF: built in memory from the exam's records and streamed straight to the browser -
// nothing is written to disk or stored. Available once the exam batch has been stopped.
router.get(
    "/:id/activity-log-pdf",
    asyncHandler(async (req, res) => {
        const [exam] = await query(`${SELECT_EXAM} WHERE e.id = $1`, [req.params.id]);
        if (!exam) throw new ApiError(404, "Exam not found.");
        if (!exam.stopped_at) throw new ApiError(400, "The activity log is available after the exam batch is stopped.");
        const rows = await collectActivityRows(exam);
        const pdfBuffer = await buildActivityLogPdf(exam, rows);
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `attachment; filename="activity-log-${exam.id}.pdf"`);
        res.set("Cache-Control", "no-store");
        res.send(pdfBuffer);
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const {
            name: rawName, registeredExamId, standardId, centreId, centreIds, examDate, startTime,
            durationMinutes, sections, passingPercentage, notes,
            loginWindowMinutes, gracePeriodMinutes, submitButtonAfterMinutes, showProvisionalResult, compensateLateLogin,
            negativeMarking, seatNumberRequired, showPhotoSignature, livePhotoCapture, verificationCloseMinutes, verificationOpenMinutes,
            passwordMode, ownPassword,
        } = req.body;
        const pw = parsePasswordMode(passwordMode, ownPassword);

        // The exam name comes from the registered-exam list when an id is sent.
        let name = rawName;
        let regId = null;
        if (registeredExamId) {
            const [reg] = await query("SELECT id, name FROM registered_exams WHERE id = $1", [registeredExamId]);
            if (!reg) throw new ApiError(400, "Registered exam not found.");
            // Candidates are tied to the registered exam; the name typed in the form (if any) is the
            // display name shown on the exam pages and used for the desk ID.
            name = String(rawName || "").trim() || reg.name;
            regId = reg.id;
        }
        // A typed exam name that isn't registered yet is registered on the spot, so it can also be
        // picked later for student registration.
        if (!regId && name && String(name).trim()) {
            name = String(name).trim();
            const [found] = await query("SELECT id, name FROM registered_exams WHERE lower(name) = lower($1)", [name]);
            if (found) {
                regId = found.id;
                name = found.name;
            } else {
                const [created] = await query("INSERT INTO registered_exams (name) VALUES ($1) RETURNING id", [name]);
                regId = created.id;
            }
        }
        const selectedCentreIds = Array.isArray(centreIds) && centreIds.length ? [...new Set(centreIds.map(Number).filter(Number.isFinite))] : [Number(centreId)];
        const primaryCentreId = selectedCentreIds[0];
        if (!name || !primaryCentreId || !examDate || !startTime || !durationMinutes) {
            throw new ApiError(400, "Name, at least one centre, date, start time and duration are required.");
        }
        // Question banks are optional at schedule time (they can be linked later via
        // POST /:id/sections); an exam with none shows "Question Bank Not Active" to students.
        const sectionList = Array.isArray(sections) ? sections : [];
        validateSections(sectionList);

        const [existing] = await query(
            "SELECT id FROM exams WHERE lower(name) = lower($1) OR ($2::int IS NOT NULL AND registered_exam_id = $2)",
            [name, regId]
        );
        if (existing) throw new ApiError(409, "This exam is already scheduled.");

        const resolvedSections = await resolveSections(sectionList);

        const totalQuestionCount = resolvedSections.reduce((sum, s) => sum + s.questionIds.length, 0);

        // The per-exam toggle only means anything when the admin has turned the feature on
        // globally in Settings — silently ignore it (rather than error) if seatNumberRequired
        // was sent while the master switch is off, so a stale client can't enforce a check the
        // admin has since disabled.
        const settings = await getSettings();
        const effectiveSeatNumberRequired = seatNumberRequired === true;

        // The first date/time plus any extra slots; every slot becomes its own exam row that shares
        // the name, password, settings and question paper.
        const slotList = [{ examDate, startTime }];
        for (const extra of Array.isArray(req.body.slots) ? req.body.slots : []) {
            if (extra && extra.examDate && extra.startTime) slotList.push({ examDate: extra.examDate, startTime: extra.startTime });
        }
        const sharedPassword = String(crypto.randomInt(100000, 1000000));

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const createdExams = [];
            let shortfall = false;
            for (const slot of slotList) {
            const examResult = await client.query(
                `INSERT INTO exams
                    (name, standard_id, centre_id, exam_date, start_time, duration_minutes,
                     question_count, passing_percentage, notes, login_window_minutes, grace_period_minutes, submit_button_after_minutes,
                     show_provisional_result, compensate_late_login, negative_marking, seat_number_required, access_password, show_photo_signature, registered_exam_id, live_photo_capture, verification_close_minutes, verification_open_minutes, password_mode, own_password)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING *`,
                [
                    name, standardId || null, primaryCentreId, slot.examDate, slot.startTime, durationMinutes,
                    totalQuestionCount, passingPercentage || 40, notes || null,
                    loginWindowMinutes ?? 30, gracePeriodMinutes ?? 25, Math.max(0, Number(submitButtonAfterMinutes) || 0),
                    showProvisionalResult !== false, compensateLateLogin !== false,
                    negativeMarking === true, effectiveSeatNumberRequired,
                    sharedPassword,
                    showPhotoSignature === true,
                    regId,
                    livePhotoCapture === true,
                    parseCloseMinutes(verificationCloseMinutes),
                    parseCloseMinutes(verificationOpenMinutes),
                    pw.mode, pw.own,
                ]
            );
            const exam = examResult.rows[0];
            for (const selectedCentreId of selectedCentreIds) {
                await client.query(
                    "INSERT INTO exam_centres (exam_id, centre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    [exam.id, selectedCentreId]
                );
            }

            if (await insertSections(client, exam.id, resolvedSections, sectionList)) shortfall = true;
            createdExams.push(exam);
            }
            const exam = createdExams[0];

            await client.query("COMMIT");

            // Candidates already registered for this exam are allocated to the batches automatically
            // (spread evenly) and get their hall tickets; verified ones are emailed in the background.
            // A failure here must not undo the scheduled exam.
            let ticketCount = 0;
            if (regId) {
                try {
                    ticketCount = (await autoAssignSlots(regId)).assigned;
                } catch (ticketError) {
                    console.error("Auto batch allocation failed:", ticketError.message);
                }
            }
            res.status(201).json({
                status: "success",
                data: exam,
                message: createdExams.length > 1
                    ? `Exam scheduled in ${createdExams.length} batches; ${ticketCount} candidate(s) were allocated to batches automatically.`
                    : ticketCount
                    ? `Exam scheduled and ${ticketCount} hall ticket(s) generated for registered students.`
                    : shortfall
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

// Links question banks to an already-scheduled exam (the "add question bank later" path).
// Replaces any existing sections — refused once a candidate has started an attempt, because
// the question set is frozen from that moment.
router.post(
    "/:id/sections",
    asyncHandler(async (req, res) => {
        const sectionList = Array.isArray(req.body.sections) ? req.body.sections : [];
        if (sectionList.length < 1) throw new ApiError(400, "Pick at least one question bank.");
        validateSections(sectionList);

        const [exam] = await query("SELECT id FROM exams WHERE id = $1", [req.params.id]);
        if (!exam) throw new ApiError(404, "Exam not found.");
        const [attempt] = await query("SELECT id FROM exam_attempts WHERE exam_id = $1 LIMIT 1", [exam.id]);
        if (attempt) throw new ApiError(409, "Candidates have already started this exam, so its questions can't be changed.");

        const resolvedSections = await resolveSections(sectionList);
        const total = resolvedSections.reduce((sum, s) => sum + s.questionIds.length, 0);

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query("DELETE FROM exam_questions WHERE exam_id = $1", [exam.id]);
            await client.query("DELETE FROM exam_sections WHERE exam_id = $1", [exam.id]);
            const shortfall = await insertSections(client, exam.id, resolvedSections, sectionList);
            await client.query("UPDATE exams SET question_count = $1, updated_at = now() WHERE id = $2", [total, exam.id]);
            await client.query("COMMIT");
            res.json({
                status: "success",
                message: shortfall ? "Some sections had fewer published questions than requested." : undefined,
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

// Exam status is automatic: Upcoming until the exam is started, Running once it is started, and
// Completed once it is stopped (see /:id/start and /:id/stop). It can no longer be edited by hand.
router.put(
    "/:id/status",
    asyncHandler(async () => {
        throw new ApiError(403, "Exam status is automatic (Upcoming, Running, Completed) and cannot be changed by hand.");
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
            const stopPassword = String(crypto.randomInt(100000, 1000000));
            await query(
                "UPDATE exams SET started_at = now(), status = 'ongoing', access_password = $1, stop_password = $3, updated_at = now() WHERE id = $2",
                [password, exam.id, stopPassword]
            );
            await logExamEvent({ examId: exam.id, type: "exam_started_by_admin", detail: "Exam started by admin" });
        } else if (!exam.stop_password) {
            await query("UPDATE exams SET stop_password = $1 WHERE id = $2", [String(crypto.randomInt(100000, 1000000)), exam.id]);
        }

        const [updated] = await query(`${SELECT_EXAM} WHERE e.id = $1`, [exam.id]);
        res.json({ status: "success", data: updated });
    })
);

// Stop Exam: ends the exam for everyone. Protected by the stop password that was generated when the
// exam was started. Every running attempt is scored and submitted, and the exam is marked completed.
router.post(
    "/:id/stop",
    asyncHandler(async (req, res) => {
        const [exam] = await query("SELECT * FROM exams WHERE id = $1", [req.params.id]);
        if (!exam) throw new ApiError(404, "Exam not found.");
        if (!exam.started_at) throw new ApiError(400, "This exam has not been started.");
        if (exam.stopped_at) throw new ApiError(400, "This exam has already been stopped.");
        const password = String(req.body.password || "").trim();
        if (!exam.stop_password || password !== exam.stop_password) {
            throw new ApiError(401, "Incorrect stop exam password.");
        }

        const running = await query("SELECT * FROM exam_attempts WHERE exam_id = $1 AND status = 'in_progress'", [exam.id]);
        for (const attempt of running) {
            await submitAttempt(attempt, exam, "admin_stop");
        }
        await query("UPDATE exams SET status = 'completed', stopped_at = now(), updated_at = now() WHERE id = $1", [exam.id]);
        await logExamEvent({ examId: exam.id, type: "exam_stopped", detail: `Exam batch stopped by admin (${running.length} running attempt(s) submitted)` });
        res.json({ status: "success", data: { stoppedAttempts: running.length } });
    })
);

router.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const { name, centreId, centreIds, examDate, startTime, durationMinutes, notes, seatNumberRequired, showPhotoSignature, livePhotoCapture, verificationCloseMinutes, verificationOpenMinutes, passwordMode, ownPassword } = req.body;
        const pw = parsePasswordMode(passwordMode, ownPassword);
        const selectedCentreIds = Array.isArray(centreIds) && centreIds.length
            ? [...new Set(centreIds.map(Number).filter(Number.isFinite))]
            : [Number(centreId)].filter(Number.isFinite);
        if (!name || !selectedCentreIds.length || !examDate || !startTime || !durationMinutes) {
            throw new ApiError(400, "Name, at least one centre, date, start time and duration are required.");
        }

        const settings = await getSettings();
        const effectiveSeatNumberRequired = seatNumberRequired === true;
        const client = await pool.connect();
        let exam;
        try {
            await client.query("BEGIN");
            const updated = await client.query(
                `UPDATE exams SET name = $1, centre_id = $2, exam_date = $3, start_time = $4,
                    duration_minutes = $5, notes = $6, seat_number_required = $7, show_photo_signature = $9, live_photo_capture = $10, verification_close_minutes = $11, verification_open_minutes = $12, password_mode = $13, own_password = $14, updated_at = now()
                 WHERE id = $8 RETURNING *`,
                [name, selectedCentreIds[0], examDate, startTime, durationMinutes, notes || null, effectiveSeatNumberRequired, req.params.id, showPhotoSignature === true, livePhotoCapture === true, parseCloseMinutes(verificationCloseMinutes), parseCloseMinutes(verificationOpenMinutes), pw.mode, pw.own]
            );
            exam = updated.rows[0];
            if (!exam) throw new ApiError(404, "Exam not found.");
            await client.query("DELETE FROM exam_centres WHERE exam_id = $1", [req.params.id]);
            for (const id of selectedCentreIds) {
                await client.query("INSERT INTO exam_centres (exam_id, centre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.params.id, id]);
            }
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
        // A changed password mode applies to the candidates already holding a hall ticket.
        await reapplyExamPasswords(exam);
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
