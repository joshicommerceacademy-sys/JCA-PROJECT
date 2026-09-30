const cron = require("node-cron");
const { query } = require("../db/pool");
const { sendMail, sendMailBatch } = require("../utils/mailer");
const { buildHallTicketPdf } = require("../utils/hallTicketPdf");
const { studentLoginLink } = require("../utils/links");

function cityLine(row) {
    return row.centre_city ? `${row.centre_city}, ${row.centre_address}` : (row.centre_address || "—");
}

function reminderEmailHtml(row) {
    const link = studentLoginLink(row.exam_id);
    return `
        <p>Dear ${row.student_name},</p>
        <p>This is a reminder that your exam is coming up in 5 days:</p>
        <ul>
            <li><strong>Exam:</strong> ${row.exam_name}</li>
            <li><strong>Date:</strong> ${new Date(row.exam_date).toLocaleDateString()}</li>
            <li><strong>Time:</strong> ${row.start_time}</li>
            <li><strong>City:</strong> ${cityLine(row)}</li>
            <li><strong>Hall Ticket No.:</strong> ${row.hall_ticket_number}</li>
        </ul>
        <p>Your hall ticket is attached again for your convenience. The PDF is password-protected —
        enter your date of birth in <strong>DDMMYYYY</strong> format to open it.</p>
        <p>When it's time for your exam, log in here: <a href="${link}">${link}</a></p>
        <p>Good luck!<br/>Joshi's Commerce Academy</p>
    `;
}

async function runExamReminderJob() {
    const rows = await query(`
        SELECT ht.id AS hall_ticket_id, ht.hall_ticket_number, ht.seat_number,
               st.full_name AS student_name, st.email, st.roll_number, st.photo_url, st.signature_url, st.dob,
               s.name AS standard_name, e.id AS exam_id, e.name AS exam_name, e.exam_date, e.start_time,
               e.duration_minutes, c.name AS centre_name, c.address AS centre_address, c.city AS centre_city
        FROM hall_tickets ht
        JOIN students st ON st.id = ht.student_id
        JOIN exams e ON e.id = ht.exam_id
        LEFT JOIN standards s ON s.id = st.standard_id
        LEFT JOIN centres c ON c.id = st.centre_id
        WHERE ht.status = 'generated'
          AND ht.reminder_sent_at IS NULL
          AND st.status = 'allowed'
          AND e.exam_date - CURRENT_DATE = 5
    `);

    if (!rows.length) return { sent: 0, failed: 0 };

    const { succeeded, failed } = await sendMailBatch(rows, async (row) => {
        const pdfBuffer = await buildHallTicketPdf(row);
        await sendMail({
            to: row.email,
            subject: `Reminder: ${row.exam_name} on ${new Date(row.exam_date).toLocaleDateString()}`,
            html: reminderEmailHtml(row),
            attachments: [{ filename: `${row.hall_ticket_number}.pdf`, content: pdfBuffer }],
            type: "exam_reminder",
        });
        await query("UPDATE hall_tickets SET reminder_sent_at = now() WHERE id = $1", [row.hall_ticket_id]);
    });

    console.log(`Exam reminder job: sent ${succeeded.length}, failed ${failed.length}`);
    return { sent: succeeded.length, failed: failed.length };
}

function scheduleExamReminderJob() {
    cron.schedule(process.env.REMINDER_CRON || "0 8 * * *", () => {
        runExamReminderJob().catch((error) => console.error("Exam reminder job failed:", error));
    });
}

module.exports = { runExamReminderJob, scheduleExamReminderJob };
