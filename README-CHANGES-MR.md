# Joshi's Commerce Academy – Updates in this package

## Included changes
- Home page now has separate **Student Login** and **Register for Exam** cards; registration form is on `/student/register`.
- Registration page asks the candidate to choose the scheduled exam and preferred centre and supports photo/signature uploads.
- Public API lists scheduled exams and stores the chosen `exam_id` and exam standard on the pending student record.
- Exam scheduling and server startup now ensure `exams.submit_button_after_minutes` exists in Neon PostgreSQL, addressing the missing-column error when the deployment DB migration had been skipped.
- Dashboard's upcoming exam list shows the exam name only, without date/time/status beside it.
- Existing Reports → Registrations student list already has **View** and the full detail dialog; its bottom action verifies the student and generates a hall ticket. Generated tickets appear in Hall Tickets.

## Important email note
Hall-ticket email remains **manual** from the Hall Tickets page: select the required student(s), then use Email Selected. This avoids sending a hall ticket before staff explicitly choose the recipients.

## Deploy
1. Replace your project files with this package (keep your `.env` secrets locally / in Render; they are not included).
2. In Render, confirm Build Command is `npm run build && npm run migrate` and Start Command is `npm run start`.
3. Deploy the latest commit and check the Render logs for `[DB] submit_button_after_minutes column verified.`
4. Test a registration with a scheduled exam, open Reports → Registrations → View, then click Verify & Generate Hall Ticket. Confirm the student appears in Hall Tickets and send email manually to selected recipients.

Do not upload `.env`, database passwords, SMTP passwords, or real student documents to GitHub.
