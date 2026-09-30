# Joshi's Commerce Academy — Exam Portal (Phase 1 rewrite)

React + Express + PostgreSQL (Neon) rewrite of the exam portal. Phase 1 covers: admin auth,
dashboard, students (register/verify/allow), centres, standards, exam scheduling, question
bank, student login, exam-taking, and results. Hall tickets are auto-generated on Allow.
Phase 2 (not yet built): attendance PDFs, reports, notifications, settings, reappear flow.

## Structure

```
new-app/
  server/   Express API (Postgres via `pg`)
  client/   React + Vite + TypeScript + Tailwind + shadcn/ui
```

## 1. Set up the database

1. Create a project at https://neon.tech and copy its connection string
   (looks like `postgresql://user:password@host/dbname?sslmode=require`).
2. Paste it into `server/.env` as `DATABASE_URL`.
3. Run the migration, then seed sample data (an admin login + a few centres/standards/questions):

```bash
cd server
npm install
npm run migrate
npm run seed
```

Seeded admin login: **joshicommerceacademy@gmail.com / jca@2017**

## 2. Run the app

Two terminals:

```bash
cd server && npm run dev   # http://localhost:5000
```

```bash
cd client && npm install && npm run dev   # http://localhost:5173
```

Open http://localhost:5173. The client dev server proxies `/api` and `/uploads` to the API
on port 5000, so no CORS/env config is needed for local dev.

## Notes on deliberate design decisions

The legacy app (see the rest of the repo) ran entirely on `localStorage` with no real backend
wired up, plaintext passwords, and several data-consistency bugs. This rewrite fixes those
deliberately:

- Roll numbers / hall ticket numbers come from Postgres sequences (stable, no reuse after deletes).
- Passwords are bcrypt-hashed; a student's default password is their DOB (`DDMMYYYY`), shown once
  to the admin at registration time.
- An exam's question set is chosen (Fisher–Yates) and frozen into `exam_questions` at scheduling
  time, not re-randomized on every login.
- An attempt's deadline (`ends_at`) is computed server-side from the exam's scheduled start +
  duration, not from whenever the student happens to open the exam page.
- Scoring (correct/wrong/marks/percentage) is computed once, server-side, in one shared code path
  for every submit reason (manual, timeout, tab-switch, devtools) — percentage is marks-weighted.
- Photo/document uploads are stored on local disk (`server/uploads`) for now. If you deploy to a
  serverless host later, swap this for object storage (S3/Cloudinary) since serverless filesystems
  aren't persistent.

## Uploads

`server/uploads/photos` stores student photos, served at `/uploads/photos/<file>`.
