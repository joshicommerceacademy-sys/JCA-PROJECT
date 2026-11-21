const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { submitAttempt } = require("../utils/submitAttempt");
const { requireStudent } = require("../middleware/auth");
const { getExamWindow } = require("../utils/examWindow");
const { shuffle } = require("../utils/shuffle");
const { buildSubjectBreakdown } = require("../utils/subjectBreakdown");
const { mergeAnswers } = require("../utils/attemptSync");
const { captureIp } = require("../utils/clientIp");
const { getSeatIndex, blockForSeat } = require("../utils/attemptQuestions");
const { logAnswers } = require("../utils/answerLog");

// Restart Exam stopped this candidate's exam on the spot; nothing more is accepted until an admin
// grants Reappear (which clears the stop).
function assertNotForceStopped(attempt) {
    if (attempt && attempt.status === "in_progress" && attempt.force_stopped_at) {
        throw new ApiError(409, "This exam was stopped by the invigilator.", "ATTEMPT_STOPPED");
    }
}
const { getSettings } = require("../utils/settings");

const router = express.Router();
router.use(requireStudent);

// When an exam hides the provisional result, the score must not reach the browser at all
// (hiding it only in the UI would still leave it readable in the network response).
function withVisibility(row, exam) {
    const show = exam.show_provisional_result;
    if (show !== false) return { ...row, show_provisional_result: show };
    const hidden = { ...row, show_provisional_result: false };
    for (const k of ["correct_count", "wrong_count", "unanswered_count", "marks_obtained", "total_marks", "percentage", "result_status"]) hidden[k] = null;
    return hidden;
}

// This candidate's personal question set and order.
//  - Normal sections: the exam's frozen questions, shuffled within the section.
//  - A random-drawn section whose bank holds more questions than the exam asks, on an exam with seat
//    numbers: the candidate gets the block of the bank that belongs to their seat (bank of 200, exam of
//    50: first seat -> questions 1-50, next seat -> 51-100, ...), shuffled within the block.
// Section boundaries never move, only the order within each subject does.
async function buildQuestionOrder(exam, student) {
    const sectionRows = await query(
        "SELECT id, bank_id, question_count, manual_pick FROM exam_sections WHERE exam_id = $1 ORDER BY ordinal",
        [exam.id]
    );
    const order = [];
    if (sectionRows.length) {
        const seatIndex = exam.seat_number_required ? await getSeatIndex(student, exam.id) : null;
        for (const section of sectionRows) {
            const qs = await query(
                "SELECT question_id FROM exam_questions WHERE section_id = $1 ORDER BY ordinal",
                [section.id]
            );
            let ids = qs.map((q) => q.question_id);
            if (seatIndex !== null && !section.manual_pick && section.question_count > 0) {
                const pool = await query(
                    "SELECT id FROM questions WHERE bank_id = $1 AND status = 'published' ORDER BY id",
                    [section.bank_id]
                );
                if (pool.length > section.question_count) {
                    ids = blockForSeat(pool.map((q) => q.id), section.question_count, seatIndex);
                }
            }
            order.push(...shuffle(ids));
        }
    } else {
        // Legacy exam scheduled before subject sections existed.
        const qs = await query(
            "SELECT question_id FROM exam_questions WHERE exam_id = $1 ORDER BY ordinal",
            [exam.id]
        );
        order.push(...shuffle(qs.map((q) => q.question_id)));
    }
    return order;
}

// Groups this candidate's questions into { id, label, questions } sections, in their personal order
// within each section (and by exam_sections.ordinal across sections). A question belongs to the section
// of the exam's frozen set it came from, or - for a seat-wise block - the section built from its bank.
async function buildSectionedQuestions(examId, questionOrder) {
    const questionRows = await query(
        `SELECT q.id, q.bank_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.marks
         FROM questions q WHERE q.id = ANY($1::int[])`,
        [questionOrder]
    );
    const questionById = new Map(questionRows.map((q) => [q.id, q]));
    const frozen = await query("SELECT question_id, section_id FROM exam_questions WHERE exam_id = $1", [examId]);
    const frozenSection = new Map(frozen.map((r) => [r.question_id, r.section_id]));

    const sectionRows = await query(
        "SELECT id, bank_id, subject_label FROM exam_sections WHERE exam_id = $1 ORDER BY ordinal",
        [examId]
    );
    const sectionLabelById = new Map(sectionRows.map((s) => [s.id, s.subject_label]));
    const sectionByBank = new Map();
    for (const s of sectionRows) if (!sectionByBank.has(s.bank_id)) sectionByBank.set(s.bank_id, s.id);

    const sectionsMap = new Map(); // sectionId (or 0 for legacy/no-section) -> { id, label, questions }
    for (const questionId of questionOrder) {
        const q = questionById.get(questionId);
        if (!q) continue; // defensive: question removed after the attempt started
        const sectionId = frozenSection.get(q.id) || sectionByBank.get(q.bank_id) || 0;
        if (!sectionsMap.has(sectionId)) {
            sectionsMap.set(sectionId, {
                id: sectionId,
                label: sectionId ? sectionLabelById.get(sectionId) : "General",
                questions: [],
            });
        }
        sectionsMap.get(sectionId).questions.push({
            id: q.id, question_text: q.question_text, option_a: q.option_a, option_b: q.option_b,
            option_c: q.option_c, option_d: q.option_d, marks: q.marks,
        });
    }

    const orderedIds = [...sectionRows.map((s) => s.id), 0];
    return orderedIds.filter((id) => sectionsMap.has(id)).map((id) => sectionsMap.get(id));
}

async function loadStudentAndExam(studentId) {
    const [student] = await query(
        `SELECT st.*, c.name AS centre_name, c.code AS centre_code, s.name AS standard_name
         FROM students st
         LEFT JOIN centres c ON c.id = st.centre_id
         LEFT JOIN standards s ON s.id = st.standard_id
         WHERE st.id = $1`,
        [studentId]
    );
    if (!student) throw new ApiError(404, "Student not found.");
    if (!student.exam_id) throw new ApiError(400, "No exam assigned.");

    const [exam] = await query("SELECT * FROM exams WHERE id = $1", [student.exam_id]);
    if (!exam) throw new ApiError(404, "Exam not found.");

    return { student, exam };
}

// Instructions / pre-exam summary
// The candidate re-enters the exam password (set by the admin on the Exam Schedule page) on the
// instructions page before the exam summary is shown.
router.post(
    "/verify-exam-password",
    asyncHandler(async (req, res) => {
        const { exam } = await loadStudentAndExam(req.student.id);
        const password = String(req.body.password || "").trim();
        if (!password) throw new ApiError(400, "Please enter the exam password.");
        if (!exam.access_password || password !== exam.access_password) {
            throw new ApiError(401, "Incorrect exam password.");
        }
        res.json({ status: "success", data: { ok: true } });
    })
);

router.get(
    "/instructions",
    asyncHandler(async (req, res) => {
        const { student, exam } = await loadStudentAndExam(req.student.id);
        const [{ count: totalQuestions }] = await query(
            "SELECT COUNT(*) FROM exam_questions WHERE exam_id = $1",
            [exam.id]
        );

        // A student resuming after a reappear (or just re-opening this page mid-exam) already
        // has a live attempt with its own deadline — the instructions page must show *that*
        // remaining time, not the exam's nominal duration, or it reads as if the timer reset.
        const [attempt] = await query(
            "SELECT ends_at, (SELECT COUNT(*) FROM exam_attempt_answers a WHERE a.attempt_id = exam_attempts.id) AS answered_count FROM exam_attempts WHERE student_id = $1 AND exam_id = $2 AND status = 'in_progress'",
            [student.id, exam.id]
        );
        const resuming = !!attempt;
        const remainingMinutes = resuming
            ? Math.max(0, Math.round((new Date(attempt.ends_at).getTime() - Date.now()) / 60000))
            : null;

        // Subject-wise breakdown of the exam's fixed question set, for the pre-exam summary
        // page — shown before the attempt exists, so this comes from exam_sections (the
        // scheduled question set), not from buildSubjectBreakdown (which needs an attempt).
        const sectionRows = await query(
            "SELECT subject_label, question_count FROM exam_sections WHERE exam_id = $1 ORDER BY ordinal",
            [exam.id]
        );

        res.json({
            status: "success",
            data: {
                student: {
                    rollNumber: student.roll_number,
                    fullName: student.full_name,
                    photoUrl: student.photo_url,
                    centreName: student.centre_name,
                    standardName: student.standard_name,
                },
                exam: {
                    id: exam.id,
                    name: exam.name,
                    examDate: exam.exam_date,
                    startTime: exam.start_time,
                    durationMinutes: exam.duration_minutes,
                    logoUrl: exam.logo_url || null,
                    submitButtonAfterMinutes: Number(exam.submit_button_after_minutes || 0),
                    compensateLateLogin: exam.compensate_late_login !== false,
                },
                sections: sectionRows.map((s) => ({ label: s.subject_label, questionCount: s.question_count })),
                totalQuestions: Number(totalQuestions),
                resuming,
                remainingMinutes,
                answeredCount: resuming ? Number(attempt.answered_count) : null,
            },
        });
    })
);

// Create-or-resume the authoritative attempt, and return the frozen question set (no answers).
router.post(
    "/attempt/start",
    asyncHandler(async (req, res) => {
        const { student, exam } = await loadStudentAndExam(req.student.id);

        let [attempt] = await query(
            "SELECT * FROM exam_attempts WHERE student_id = $1 AND exam_id = $2",
            [student.id, exam.id]
        );

        if (attempt?.status === "submitted") {
            throw new ApiError(403, "You have already submitted this exam.");
        }
        if (exam.stopped_at) {
            throw new ApiError(403, "This exam has been stopped by the administrator.");
        }
        assertNotForceStopped(attempt);

        if (!attempt) {
            const { start, examEnd, graceEnd } = getExamWindow(exam);
            const now = new Date();
            if (now < start) {
                throw new ApiError(403, `This exam hasn't started yet. It starts at ${start.toLocaleString()}.`);
            }
            // compensate_late_login (default on): a candidate who logs in during the grace
            // period still gets the full duration counted from *this* moment, so logging in
            // a few minutes late (within the permitted grace window) never costs them exam
            // time. Turned off, everyone shares the same fixed deadline (start + duration)
            // regardless of when they actually logged in.
            const tooLateCutoff = exam.compensate_late_login ? graceEnd : examEnd;
            if (now >= tooLateCutoff) {
                throw new ApiError(403, "This exam has already ended.");
            }
            const endsAt = exam.compensate_late_login
                ? new Date(now.getTime() + exam.duration_minutes * 60000)
                : examEnd;

            // ON CONFLICT DO NOTHING guards against a race where two concurrent start
            // requests (e.g. an accidental double-click) both see no existing attempt;
            // the loser falls through to re-fetch the winner's row instead of crashing.
            const [created] = await query(
                `INSERT INTO exam_attempts (student_id, exam_id, started_at, ends_at)
                 VALUES ($1, $2, now(), $3)
                 ON CONFLICT (student_id, exam_id) DO NOTHING
                 RETURNING *`,
                [student.id, exam.id, endsAt]
            );
            if (created) {
                attempt = created;
            } else {
                [attempt] = await query(
                    "SELECT * FROM exam_attempts WHERE student_id = $1 AND exam_id = $2",
                    [student.id, exam.id]
                );
            }
        }

        if (!attempt.question_order) {
            const order = await buildQuestionOrder(exam, student);
            await query("UPDATE exam_attempts SET question_order = $1 WHERE id = $2", [order, attempt.id]);
            attempt.question_order = order;
        }

        // Always record the device's real network address on every start/resume so it stays
        // current if the candidate reconnects from another network mid-exam. req.ip resolves the
        // real client address via X-Forwarded-For (app.set("trust proxy", true) in index.js);
        // the IPv4-mapped IPv6 prefix is stripped so admins see a plain address.
        const settings = await getSettings();
        await captureIp(req, student.id, attempt.id);
        await query("UPDATE exam_attempts SET last_seen_at = now() WHERE id = $1", [attempt.id]);
        const [seatRow] = await query(
            "SELECT seat_number FROM hall_tickets WHERE student_id = $1 AND exam_id = $2 ORDER BY id DESC LIMIT 1",
            [student.id, exam.id]
        );

        const sections = await buildSectionedQuestions(exam.id, attempt.question_order);

        const savedAnswers = await query(
            "SELECT question_id, selected_option FROM exam_attempt_answers WHERE attempt_id = $1",
            [attempt.id]
        );

        res.json({
            status: "success",
            data: {
                attemptId: attempt.id,
                startedAt: attempt.started_at,
                endsAt: attempt.ends_at,
                exam: { id: exam.id, name: exam.name, seatingEnabled: !!exam.seat_number_required, durationMinutes: exam.duration_minutes, logoUrl: exam.logo_url, showPhotoSignature: !!exam.show_photo_signature, submitButtonAfterMinutes: Number(exam.submit_button_after_minutes || 0) },
                student: {
                    rollNumber: student.roll_number,
                    seatNumber: exam.seat_number_required ? seatRow?.seat_number || null : null,
                    fullName: student.full_name,
                    photoUrl: student.photo_url,
                    signatureUrl: student.signature_url || null,
                    centreName: student.centre_name,
                    centreCode: student.centre_code,
                },
                sections,
                answers: Object.fromEntries(savedAnswers.map((a) => [a.question_id, a.selected_option])),
                security: {
                    maxWarnings: settings.max_security_warnings,
                    disableCopyEnabled: settings.disable_copy_enabled,
                },
            },
        });
    })
);

router.put(
    "/attempt/answer",
    asyncHandler(async (req, res) => {
        const { questionId, selectedOption } = req.body;
        if (!questionId || !["A", "B", "C", "D"].includes(selectedOption)) {
            throw new ApiError(400, "questionId and a valid selectedOption (A-D) are required.");
        }

        const [attempt] = await query(
            "SELECT * FROM exam_attempts WHERE student_id = $1 AND status = 'in_progress' ORDER BY id DESC LIMIT 1",
            [req.student.id]
        );
        if (!attempt) throw new ApiError(409, "This exam has ended.", "ATTEMPT_CLOSED");
        assertNotForceStopped(attempt);
        if (new Date() >= new Date(attempt.ends_at)) {
            throw new ApiError(403, "Time is up for this exam.");
        }

        const [before] = await query(
            "SELECT selected_option FROM exam_attempt_answers WHERE attempt_id = $1 AND question_id = $2",
            [attempt.id, questionId]
        );
        await logAnswers(attempt, [{ questionId: Number(questionId), option: selectedOption, previous: before?.selected_option }]);

        await query(
            `INSERT INTO exam_attempt_answers (attempt_id, question_id, selected_option, answered_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (attempt_id, question_id)
             DO UPDATE SET selected_option = EXCLUDED.selected_option, answered_at = now()`,
            [attempt.id, questionId, selectedOption]
        );

        res.json({ status: "success" });
    })
);

// Heartbeat (every few seconds while a candidate is signed in): records "last activity" and the
// device address, and hands back a pending admin command for this device:
//   restart         - the exam was stopped on the spot from Live Monitor > Restart Exam
//   device_restart  - Settings > Device Restart: also wipe the exam data held on the device
router.get(
    "/heartbeat",
    asyncHandler(async (req, res) => {
        await captureIp(req, req.student.id);
        await query(
            "UPDATE exam_attempts SET last_seen_at = now() WHERE student_id = $1 AND status = 'in_progress'",
            [req.student.id]
        );
        const [row] = await query("SELECT pending_command, exam_id FROM students WHERE id = $1", [req.student.id]);
        res.json({ status: "success", data: { command: row?.pending_command || null, examId: row?.exam_id || null } });
    })
);

// Bulk answer sync: a device that lost its connection keeps every answer locally and pushes them
// all here once it is back online (and again inside /attempt/submit). Accepted while the attempt is
// still open, including a short window after the deadline for a device that was offline when its
// timer ran out (see utils/attemptSync.js).
router.put(
    "/attempt/answers",
    asyncHandler(async (req, res) => {
        const [attempt] = await query(
            "SELECT * FROM exam_attempts WHERE student_id = $1 ORDER BY id DESC LIMIT 1",
            [req.student.id]
        );
        if (!attempt || attempt.status !== "in_progress") {
            throw new ApiError(409, "This exam has ended.", "ATTEMPT_CLOSED");
        }
        assertNotForceStopped(attempt);
        const [exam] = await query("SELECT * FROM exams WHERE id = $1", [attempt.exam_id]);
        const stored = await mergeAnswers(attempt, exam, req.body.answers);
        res.json({ status: "success", data: { stored } });
    })
);

router.post(
    "/attempt/submit",
    asyncHandler(async (req, res) => {
        const { reason, answers } = req.body;
        const validReasons = ["manual", "timeout", "tab_switch", "devtools", "fullscreen_exit"];
        const submitReason = validReasons.includes(reason) ? reason : "manual";

        const [attempt] = await query(
            "SELECT * FROM exam_attempts WHERE student_id = $1 ORDER BY id DESC LIMIT 1",
            [req.student.id]
        );
        if (!attempt) throw new ApiError(400, "No active exam attempt to submit.");

        const [exam] = await query("SELECT * FROM exams WHERE id = $1", [attempt.exam_id]);

        // Idempotent: a device that was offline may retry its submit after the exam was already
        // finalised (admin stop, sweeper, or an earlier request whose response was lost). Hand back
        // the stored result instead of an error so the candidate's screen can finish cleanly.
        if (attempt.status === "submitted") {
            return res.json({ status: "success", data: withVisibility(attempt, exam) });
        }
        assertNotForceStopped(attempt);

        // Every answer the device holds locally goes in with the submit, so nothing recorded
        // while offline is lost.
        await mergeAnswers(attempt, exam, answers);
        const updated = await submitAttempt(attempt, exam, submitReason);

        // Result emails are deliberately not sent here - the admin sends them manually (with a
        // full answer-sheet PDF attached) from the Results page once results are ready to release.
        res.json({ status: "success", data: withVisibility(updated, exam) });
    })
);

router.get(
    "/result",
    asyncHandler(async (req, res) => {
        const [attempt] = await query(
            `SELECT ea.*, e.name AS exam_name, e.show_provisional_result FROM exam_attempts ea
             JOIN exams e ON e.id = ea.exam_id
             WHERE ea.student_id = $1 AND ea.status = 'submitted'
             ORDER BY ea.submitted_at DESC LIMIT 1`,
            [req.student.id]
        );
        if (!attempt) throw new ApiError(404, "No submitted result found.");
        const subjects = await buildSubjectBreakdown(attempt.id, attempt.exam_id);
        res.json({ status: "success", data: { ...withVisibility(attempt, attempt), subjects: attempt.show_provisional_result === false ? [] : subjects } });
    })
);

module.exports = router;
