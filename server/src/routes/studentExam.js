const express = require("express");
const { query } = require("../db/pool");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { requireStudent } = require("../middleware/auth");
const { getExamWindow } = require("../utils/examWindow");
const { shuffle } = require("../utils/shuffle");
const { buildSubjectBreakdown } = require("../utils/subjectBreakdown");
const { getSettings } = require("../utils/settings");

const router = express.Router();
router.use(requireStudent);

// One student's personal display order: shuffled independently within each section so
// section boundaries never move, only the order within each subject does.
async function buildQuestionOrder(examId) {
    const sectionRows = await query(
        "SELECT id FROM exam_sections WHERE exam_id = $1 ORDER BY ordinal",
        [examId]
    );
    const order = [];
    if (sectionRows.length) {
        for (const section of sectionRows) {
            const qs = await query(
                "SELECT question_id FROM exam_questions WHERE section_id = $1 ORDER BY ordinal",
                [section.id]
            );
            order.push(...shuffle(qs.map((q) => q.question_id)));
        }
    } else {
        // Legacy exam scheduled before subject sections existed.
        const qs = await query(
            "SELECT question_id FROM exam_questions WHERE exam_id = $1 ORDER BY ordinal",
            [examId]
        );
        order.push(...shuffle(qs.map((q) => q.question_id)));
    }
    return order;
}

// Groups the exam's questions into { id, label, questions } sections, ordered per this
// student's personal question_order within each section (and by exam_sections.ordinal
// across sections).
async function buildSectionedQuestions(examId, questionOrder) {
    const questionRows = await query(
        `SELECT eq.section_id, q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.marks
         FROM exam_questions eq JOIN questions q ON q.id = eq.question_id
         WHERE eq.exam_id = $1`,
        [examId]
    );
    const questionById = new Map(questionRows.map((q) => [q.id, q]));

    const sectionRows = await query(
        "SELECT id, subject_label FROM exam_sections WHERE exam_id = $1 ORDER BY ordinal",
        [examId]
    );
    const sectionLabelById = new Map(sectionRows.map((s) => [s.id, s.subject_label]));

    const sectionsMap = new Map(); // sectionId (or 0 for legacy/no-section) -> { id, label, questions }
    for (const questionId of questionOrder) {
        const q = questionById.get(questionId);
        if (!q) continue; // defensive: question removed after the attempt started
        const sectionId = q.section_id || 0;
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
        `SELECT st.*, c.name AS centre_name, s.name AS standard_name
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
            const order = await buildQuestionOrder(exam.id);
            await query("UPDATE exam_attempts SET question_order = $1 WHERE id = $2", [order, attempt.id]);
            attempt.question_order = order;
        }

        // Optional, off by default (Settings page): records this candidate's current IP on
        // every start/resume so it stays up to date if they reconnect from a different
        // network mid-exam. req.ip resolves the real client address via X-Forwarded-For
        // once app.set("trust proxy", true) is in effect (see index.js).
        const settings = await getSettings();
        if (settings.ip_capture_enabled) {
            await query("UPDATE exam_attempts SET ip_address = $1 WHERE id = $2", [req.ip, attempt.id]);
        }

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
                exam: { id: exam.id, name: exam.name, durationMinutes: exam.duration_minutes, logoUrl: exam.logo_url },
                student: {
                    rollNumber: student.roll_number,
                    fullName: student.full_name,
                    photoUrl: student.photo_url,
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
        if (!attempt) throw new ApiError(400, "No active exam attempt.");
        if (new Date() >= new Date(attempt.ends_at)) {
            throw new ApiError(403, "Time is up for this exam.");
        }

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

router.post(
    "/attempt/submit",
    asyncHandler(async (req, res) => {
        const { reason } = req.body;
        const validReasons = ["manual", "timeout", "tab_switch", "devtools", "fullscreen_exit"];
        const submitReason = validReasons.includes(reason) ? reason : "manual";

        const [attempt] = await query(
            "SELECT * FROM exam_attempts WHERE student_id = $1 AND status = 'in_progress' ORDER BY id DESC LIMIT 1",
            [req.student.id]
        );
        if (!attempt) throw new ApiError(400, "No active exam attempt to submit.");

        const [exam] = await query("SELECT * FROM exams WHERE id = $1", [attempt.exam_id]);

        const questions = await query(
            "SELECT q.id, q.correct_answer, q.marks FROM exam_questions eq JOIN questions q ON q.id = eq.question_id WHERE eq.exam_id = $1",
            [attempt.exam_id]
        );
        const answers = await query(
            "SELECT question_id, selected_option FROM exam_attempt_answers WHERE attempt_id = $1",
            [attempt.id]
        );
        const answerMap = new Map(answers.map((a) => [a.question_id, a.selected_option]));

        let correct = 0;
        let wrong = 0;
        let unanswered = 0;
        let marksObtained = 0;
        let totalMarks = 0;

        for (const q of questions) {
            totalMarks += q.marks;
            const selected = answerMap.get(q.id);
            if (!selected) {
                unanswered += 1;
                continue;
            }
            const isCorrect = selected === q.correct_answer;
            // Negative marking (when enabled for this exam) deducts a fixed 25% of the
            // question's own marks for a wrong answer — 1 mark -> -0.25, 2 -> -0.50,
            // 3 -> -0.75, 4 -> -1.00, derived from q.marks, not a separately stored rate.
            const obtained = isCorrect ? q.marks : exam.negative_marking ? -(q.marks * 0.25) : 0;
            if (isCorrect) {
                correct += 1;
            } else {
                wrong += 1;
            }
            marksObtained += obtained;
            await query(
                `UPDATE exam_attempt_answers SET is_correct = $1, marks_obtained = $2
                 WHERE attempt_id = $3 AND question_id = $4`,
                [isCorrect, obtained, attempt.id, q.id]
            );
        }

        const percentage = totalMarks > 0 ? Number(((marksObtained / totalMarks) * 100).toFixed(2)) : 0;
        const resultStatus = percentage >= Number(exam.passing_percentage) ? "passed" : "failed";

        const [updated] = await query(
            `UPDATE exam_attempts SET status = 'submitted', submitted_at = now(), submit_reason = $1,
                total_questions = $2, correct_count = $3, wrong_count = $4, unanswered_count = $5,
                marks_obtained = $6, total_marks = $7, percentage = $8, result_status = $9
             WHERE id = $10 RETURNING *`,
            [
                submitReason, questions.length, correct, wrong, unanswered,
                marksObtained, totalMarks, percentage, resultStatus, attempt.id,
            ]
        );

        // Result emails are deliberately not sent here — the admin sends them manually (with a
        // full answer-sheet PDF attached) from the Results page once results are ready to release.
        res.json({ status: "success", data: { ...updated, show_provisional_result: exam.show_provisional_result } });
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
        res.json({ status: "success", data: { ...attempt, subjects } });
    })
);

module.exports = router;
