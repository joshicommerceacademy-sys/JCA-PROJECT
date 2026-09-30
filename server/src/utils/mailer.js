const nodemailer = require("nodemailer");
const { query } = require("../db/pool");

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn("SMTP_USER/SMTP_PASS are not set — outgoing email will fail.");
    }

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: Number(process.env.SMTP_PORT) === 465 || !process.env.SMTP_PORT,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    return transporter;
}

async function logEmail({ recipient, subject, type, status, error }) {
    try {
        await query(
            "INSERT INTO email_log (recipient, subject, type, status, error) VALUES ($1, $2, $3, $4, $5)",
            [recipient, subject, type, status, error || null]
        );
    } catch (logError) {
        console.error("Failed to write email_log:", logError.message);
    }
}

async function sendMail({ to, subject, html, attachments, type = "generic" }) {
    try {
        const result = await getTransporter().sendMail({
            from: `"${process.env.SMTP_FROM_NAME || "Joshi's Commerce Academy"}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
            to,
            subject,
            html,
            attachments,
        });
        await logEmail({ recipient: to, subject, type, status: "sent" });
        return result;
    } catch (error) {
        await logEmail({ recipient: to, subject, type, status: "failed", error: error.message });
        throw error;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMailBatch(items, sendFn, delayMs = Number(process.env.MAIL_SEND_DELAY_MS) || 1500) {
    const results = { succeeded: [], failed: [] };
    for (const item of items) {
        try {
            await sendFn(item);
            results.succeeded.push(item);
        } catch (error) {
            console.error(`Mail failed for ${item.email || item.to}:`, error.message);
            results.failed.push({ item, error: error.message });
        }
        await sleep(delayMs);
    }
    return results;
}

module.exports = { sendMail, sendMailBatch };
