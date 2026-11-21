const { query } = require("../db/pool");
const { sendMail } = require("./mailer");
const { buildHallTicketPdf } = require("./hallTicketPdf");
const { studentLoginLink } = require("./links");
const { fmtDate } = require("./dateFormat");

const SELECT_TICKET_JOIN = `
    SELECT ht.*, st.roll_number, st.full_name AS student_name, st.photo_url, st.signature_url, st.email, st.dob,
           st.standard_id, s.name AS standard_name, e.name AS exam_name,
           e.exam_date, e.start_time, e.duration_minutes, e.password_mode, c.name AS centre_name,
           c.address AS centre_address, c.city AS centre_city
    FROM hall_tickets ht
    JOIN students st ON st.id = ht.student_id
    JOIN exams e ON e.id = ht.exam_id
    LEFT JOIN standards s ON s.id = st.standard_id
    LEFT JOIN centres c ON c.id = st.centre_id
`;

function cityLine(ticket) {
    return ticket.centre_city ? `${ticket.centre_city}, ${ticket.centre_address}` : (ticket.centre_address || "—");
}

function hallTicketEmailHtml(ticket) {
    const link = studentLoginLink(ticket.exam_id);
    return `
        <p>Dear ${ticket.student_name},</p>
        <p>Please find attached your hall ticket for <strong>${ticket.exam_name}</strong>.</p>
        <ul>
            <li><strong>Date:</strong> ${fmtDate(ticket.exam_date)}</li>
            <li><strong>Time:</strong> ${ticket.start_time}</li>
            <li><strong>City:</strong> ${cityLine(ticket)}</li>
            <li><strong>Hall Ticket No.:</strong> ${ticket.hall_ticket_number}</li>
        </ul>
        <p>The attached PDF is password-protected — enter your date of birth in
        <strong>DDMMYYYY</strong> format to open it.</p>
        <p>When it's time for your exam, log in here: <a href="${link}">${link}</a></p>
        <p>Joshi's Commerce Academy</p>
    `;
}


// Builds the (DOB-password-protected) PDF and emails it. Used by manual send, auto-send on
// verification / scheduling, and shares the exact same PDF as the public download.
async function sendHallTicketEmail(ticketId) {
    const [ticket] = await query(`${SELECT_TICKET_JOIN} WHERE ht.id = $1`, [ticketId]);
    if (!ticket) throw new Error("Hall ticket not found.");
    const pdfBuffer = await buildHallTicketPdf(ticket);
    await sendMail({
        to: ticket.email,
        subject: `Hall Ticket - ${ticket.exam_name}`,
        html: hallTicketEmailHtml(ticket),
        attachments: [{ filename: `${ticket.hall_ticket_number}.pdf`, content: pdfBuffer }],
        type: "hall_ticket",
    });
    await query("UPDATE hall_tickets SET email_sent_at = now() WHERE id = $1", [ticket.id]);
}

module.exports = { SELECT_TICKET_JOIN, hallTicketEmailHtml, sendHallTicketEmail };
