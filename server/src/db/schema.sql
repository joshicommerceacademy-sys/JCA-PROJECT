-- ============================================================
-- Joshi's Commerce Academy — Online Exam Portal
-- Postgres schema (Neon)
--
-- Design notes (deliberate departures from the legacy localStorage app,
-- see Phase 1 spec for the bugs this fixes):
--   - Every table has a stable serial PK. roll_number / hall_ticket_no
--     are generated from dedicated sequences (year-scoped), not from
--     array length, so they stay unique even after deletes.
--   - Passwords are always bcrypt hashes, never plaintext.
--   - An exam's questions are frozen into exam_questions at schedule
--     time (server-side Fisher-Yates), and an attempt's timing/answers
--     are authoritative server-side rows, not client-trusted state.
--   - Percentage is marks-weighted (obtained/total), not question-count
--     based, since question marks vary.
-- ============================================================

-- ----------------------------------------------------------------
-- ADMIN USERS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    role          VARCHAR(30) NOT NULL DEFAULT 'admin',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- CENTRES
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS centres (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    code         VARCHAR(20) UNIQUE NOT NULL,
    address      TEXT,
    status       VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Shown on the hall ticket alongside the centre address, replacing the old unused "venue" field.
ALTER TABLE centres ADD COLUMN IF NOT EXISTS city VARCHAR(100);

-- ----------------------------------------------------------------
-- STANDARDS (class/grade levels)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS standards (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    code         VARCHAR(20) UNIQUE NOT NULL,
    description  TEXT,
    status       VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- ROLL NUMBER / HALL TICKET NUMBER SEQUENCES (year-scoped, stable)
-- ----------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS roll_number_seq;
CREATE SEQUENCE IF NOT EXISTS hall_ticket_seq;

-- ----------------------------------------------------------------
-- STUDENTS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id             SERIAL PRIMARY KEY,
    roll_number    VARCHAR(30) UNIQUE NOT NULL,
    full_name      VARCHAR(200) NOT NULL,
    email          VARCHAR(150) UNIQUE NOT NULL,
    phone          VARCHAR(20),
    dob            DATE NOT NULL,
    gender         VARCHAR(10),
    address        TEXT,
    centre_id      INTEGER REFERENCES centres(id) ON DELETE SET NULL,
    standard_id    INTEGER REFERENCES standards(id) ON DELETE SET NULL,
    exam_id        INTEGER,  -- FK added after exams table exists (below)
    photo_url      TEXT,
    password_hash  VARCHAR(255) NOT NULL,
    status         VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allowed')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Set by an invigilator on exam day when the student physically checks in at the exam lab.
-- Record-keeping only — it does NOT gate login; a student can log in as soon as `status` is
-- 'allowed'.
ALTER TABLE students ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS signature_url TEXT;
-- 4-digit internal reference code, assigned the moment a student is selected on the
-- Generate Hall Ticket page (independent of roll_number).
ALTER TABLE students ADD COLUMN IF NOT EXISTS student_code VARCHAR(4) UNIQUE;
-- roll_number is now assigned at hall-ticket-generation time, not at registration.
ALTER TABLE students ALTER COLUMN roll_number DROP NOT NULL;

-- Drives the 6-char alphanumeric roll number (one letter + 5 digits), starting at
-- A12345 as requested. The letter increments every 90000 values past the 12345
-- offset — comfortably more headroom than this app will ever need.
CREATE SEQUENCE IF NOT EXISTS student_roll_seq START WITH 12345;
-- Drives the 4-digit student_code above.
CREATE SEQUENCE IF NOT EXISTS student_code_seq START WITH 1000;

-- ----------------------------------------------------------------
-- QUESTION BANKS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS question_banks (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) UNIQUE NOT NULL,
    standard_id  INTEGER REFERENCES standards(id) ON DELETE SET NULL,
    subject      VARCHAR(100),
    description  TEXT,
    status       VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- QUESTIONS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
    id              SERIAL PRIMARY KEY,
    bank_id         INTEGER NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
    question_text   TEXT NOT NULL,
    option_a        TEXT NOT NULL,
    option_b        TEXT NOT NULL,
    option_c        TEXT NOT NULL,
    option_d        TEXT NOT NULL,
    correct_answer  CHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
    marks           INTEGER NOT NULL DEFAULT 2 CHECK (marks BETWEEN 1 AND 10),
    difficulty      VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    explanation     TEXT,
    status          VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- EXAMS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
    id                    SERIAL PRIMARY KEY,
    name                  VARCHAR(200) UNIQUE NOT NULL,
    standard_id           INTEGER REFERENCES standards(id) ON DELETE SET NULL,
    centre_id             INTEGER REFERENCES centres(id) ON DELETE SET NULL,
    exam_date             DATE NOT NULL,
    start_time            TIME NOT NULL,
    duration_minutes      INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 300),
    question_count        INTEGER NOT NULL DEFAULT 10,
    passing_percentage    NUMERIC(5,2) NOT NULL DEFAULT 40,
    login_window_minutes  INTEGER NOT NULL DEFAULT 30,
    grace_period_minutes  INTEGER NOT NULL DEFAULT 25,
    show_provisional_result BOOLEAN NOT NULL DEFAULT true,
    status                VARCHAR(12) NOT NULL DEFAULT 'upcoming'
                          CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS login_window_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER NOT NULL DEFAULT 25;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_provisional_result BOOLEAN NOT NULL DEFAULT true;
-- When true (default), a candidate who logs in during the grace period (i.e. after the scheduled
-- start time) still gets the exam's full duration counted from their actual login moment, instead
-- of a fixed deadline at (scheduled start + duration) that eats into their time the later they log
-- in. When false, everyone's deadline is the same fixed (scheduled start + duration), regardless of
-- when they actually logged in — useful when all candidates must submit by the same absolute time.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS compensate_late_login BOOLEAN NOT NULL DEFAULT true;
-- Set once, the moment admin clicks "Start Exam" — gates student login for this exam.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
-- Revealed to admin when Start Exam is clicked; students must enter it before reaching
-- the login form.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS access_password VARCHAR(20);
-- When on, a wrong answer deducts 25% of that question's own marks (1 mark -> -0.25,
-- 2 marks -> -0.50, 3 marks -> -0.75, 4 marks -> -1.00, ...) — derived from each
-- question's marks at grading time, not a separately configured rate.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS negative_marking BOOLEAN NOT NULL DEFAULT false;
-- Per-exam opt-in for the lab seat number security check (only offered at schedule time
-- when app_settings.seat_number_enabled is on). When true, a student can only be moved
-- from 'pending' to 'allowed' on the Verification page by an admin who also enters that
-- specific student's seat number (stored on their hall_tickets row).
ALTER TABLE exams ADD COLUMN IF NOT EXISTS seat_number_required BOOLEAN NOT NULL DEFAULT false;
-- Optional per-exam branding, set via a separate upload endpoint after the exam is created.
-- When null, the student-facing exam page falls back to the academy's default logo.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS logo_url TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_exam') THEN
        ALTER TABLE students
            ADD CONSTRAINT fk_students_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Subject sections chosen at schedule time (1-4 per exam), each pulling from one
-- question bank. subject_label is copied from the bank at creation time so renaming a
-- bank later doesn't rewrite history on already-scheduled exams.
CREATE TABLE IF NOT EXISTS exam_sections (
    id              SERIAL PRIMARY KEY,
    exam_id         INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    bank_id         INTEGER NOT NULL REFERENCES question_banks(id),
    subject_label   VARCHAR(150) NOT NULL,
    question_count  INTEGER NOT NULL,
    ordinal         INTEGER NOT NULL,
    UNIQUE (exam_id, ordinal)
);

-- Frozen exam question set (chosen server-side, Fisher-Yates, at schedule time)
CREATE TABLE IF NOT EXISTS exam_questions (
    id           SERIAL PRIMARY KEY,
    exam_id      INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    ordinal      INTEGER NOT NULL,
    UNIQUE (exam_id, question_id),
    UNIQUE (exam_id, ordinal)
);
-- Nullable: older exams created before subject sections existed have no section_id.
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES exam_sections(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- HALL TICKETS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hall_tickets (
    id                  SERIAL PRIMARY KEY,
    student_id          INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id             INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    hall_ticket_number  VARCHAR(50) UNIQUE NOT NULL,
    venue               VARCHAR(200) NOT NULL DEFAULT 'Not Assigned',
    status              VARCHAR(12) NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'revoked')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, exam_id)
);

ALTER TABLE hall_tickets ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE hall_tickets ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE hall_tickets ADD COLUMN IF NOT EXISTS seat_number VARCHAR(20);

-- ----------------------------------------------------------------
-- EXAM ATTEMPTS (one authoritative row per student-exam attempt)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_attempts (
    id                 SERIAL PRIMARY KEY,
    student_id         INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id            INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at            TIMESTAMPTZ NOT NULL,          -- authoritative deadline, computed server-side at attempt creation
    submitted_at       TIMESTAMPTZ,
    status             VARCHAR(12) NOT NULL DEFAULT 'in_progress'
                       CHECK (status IN ('in_progress', 'submitted')),
    submit_reason      VARCHAR(30),                    -- manual | timeout | tab_switch | devtools
    total_questions    INTEGER,
    correct_count      INTEGER,
    wrong_count        INTEGER,
    unanswered_count   INTEGER,
    marks_obtained     NUMERIC(6,2),
    total_marks        NUMERIC(6,2),
    percentage         NUMERIC(5,2),
    result_status      VARCHAR(10) CHECK (result_status IN ('passed', 'failed')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, exam_id)
);
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS result_sent_at TIMESTAMPTZ;
-- This student's personal display order (question ids), generated once at attempt
-- creation and reused on resume so a page refresh never reshuffles mid-exam. Shuffled
-- independently within each section so section boundaries never move.
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS question_order INTEGER[];
-- Captured at attempt start/resume, only when app_settings.ip_capture_enabled is on —
-- powers the optional "IP Address" column on the Live Monitor page.
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

CREATE TABLE IF NOT EXISTS exam_attempt_answers (
    attempt_id        INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id       INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_option   CHAR(1) CHECK (selected_option IN ('A', 'B', 'C', 'D')),
    is_correct        BOOLEAN,
    marks_obtained    NUMERIC(5,2),
    answered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id, question_id)
);

-- ----------------------------------------------------------------
-- Helpful indexes
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_exam ON students(exam_id);
CREATE INDEX IF NOT EXISTS idx_questions_bank ON questions(bank_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id);

-- ----------------------------------------------------------------
-- EMAIL LOG (audit trail for every outgoing email)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
    id          SERIAL PRIMARY KEY,
    recipient   VARCHAR(150) NOT NULL,
    subject     VARCHAR(255) NOT NULL,
    type        VARCHAR(40) NOT NULL,
    status      VARCHAR(10) NOT NULL CHECK (status IN ('sent', 'failed')),
    error       TEXT,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON email_log(type);

-- ----------------------------------------------------------------
-- REAPPEAR REQUESTS (admin-granted re-entry after an interrupted attempt)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reappear_requests (
    id            SERIAL PRIMARY KEY,
    student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id       INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    reason        TEXT,
    status        VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    remaining_minutes INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ
);
ALTER TABLE reappear_requests ADD COLUMN IF NOT EXISTS remaining_minutes INTEGER;
CREATE INDEX IF NOT EXISTS idx_reappear_student_exam ON reappear_requests(student_id, exam_id);

-- ----------------------------------------------------------------
-- APP SETTINGS (single-row table — id is always 1)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    id                          INTEGER PRIMARY KEY DEFAULT 1,
    -- Master switch for the lab seat number security feature. When on, each exam gets the
    -- option (at schedule time) to require a seat number per student before that student
    -- can be allowed. When off, that option is hidden and no exam enforces it.
    seat_number_enabled         BOOLEAN NOT NULL DEFAULT false,
    -- When on, a student's IP address is recorded on their exam_attempts row at attempt
    -- start/resume, and shown as a column on the Live Monitor page.
    ip_capture_enabled          BOOLEAN NOT NULL DEFAULT false,
    -- When on (default), every admin_users row gets an email the moment a new student
    -- registers (students.js). Off silences that alert without touching the registration
    -- flow itself.
    registration_alert_enabled  BOOLEAN NOT NULL DEFAULT true,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT app_settings_singleton CHECK (id = 1)
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
-- Kill switch for new student sign-ins (studentAuth.js router only — an already
-- authenticated, in-progress attempt is untouched, since flipping this shouldn't cut off a
-- student mid-exam). Off blocks the exam list, roll-number list, access-password gate and
-- the login form itself with a clear "temporarily disabled" message.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS student_login_enabled BOOLEAN NOT NULL DEFAULT true;
-- How many tab-switches (or fullscreen exits) a candidate gets before their exam is
-- auto-submitted. 1 (default) reproduces the original hardcoded behavior: the first offense
-- shows a warning/resume screen, the next one auto-submits. 0 means zero tolerance —
-- auto-submit on the very first offense.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS max_security_warnings INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_max_warnings_check;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_max_warnings_check CHECK (max_security_warnings >= 0);
-- Blocks copy/cut/right-click/drag-out on the exam-taking page. On by default (reproduces
-- the previously-unconditional behavior).
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS disable_copy_enabled BOOLEAN NOT NULL DEFAULT true;
