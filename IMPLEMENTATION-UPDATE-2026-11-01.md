# Joshi's Commerce Academy — implementation update (2026-11-01)

## Added / updated
- Reports: Centre Candidate Summary tab groups scheduled-exam candidates by centre and displays date, time, total, male, female and other counts. Centre/Open actions navigate to the exam Live Monitor.
- Exam Schedule: Edit Exam dialog supports exam name, centre multi-selection, date, time, duration and notes. Server update persists the centre assignments in `exam_centres` and the primary `exams.centre_id`.
- Reappear: Grant Reappear Batch endpoint and UI action grant all currently eligible interrupted candidates for the selected exam. Each request uses the existing remaining-time calculation; candidates with an already-pending request are skipped.
- Dashboard: selecting a live exam shows candidate total, gender counts, Appearing, Appeared and Not Logged In counts, plus a candidate attendance table. Open Full Live Monitor leads to the detailed monitor page.
- Live Monitor API now includes candidate gender for dashboard summaries.
- Activity tracking/API remains removed from this project version; no activity log rows are written by the app.

## Deployment notes
- Server route syntax was checked with `node --check`.
- Client `npm run build` could not complete in this environment because the extracted `client/node_modules` lacks the `vite/client` and `@types/node` type definitions. Install dependencies in the project environment (`npm install`) before running `npm run build`.
- No Neon migration was added for these UI/report changes. Existing `students.gender` and `exam_centres` schema are used.
- Back up Neon before deploying any application update. No database data was intentionally deleted.
