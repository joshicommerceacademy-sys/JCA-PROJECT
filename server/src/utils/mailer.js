const crypto = require("crypto");
const { query } = require("../db/pool");

function requiredGoogleConfig() {
    const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GMAIL_USER"]
        .filter((key) => !process.env[key]);
    if (missing.length) {
        throw new Error(`Gmail API is not configured. Missing Render environment variable(s): ${missing.join(", ")}.`);
    }
}

async function getAccessToken() {
    requiredGoogleConfig();
    const body = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
        const detail = data.error_description || data.error || `HTTP ${response.status}`;
        throw new Error(`Google OAuth token refresh failed: ${detail}`);
    }
    return data.access_token;
}

function encodeHeader(value) {
    return `=?UTF-8?B?${Buffer.from(String(value || ""), "utf8").toString("base64")}?=`;
}

function safeHeader(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function wrapBase64(value) {
    return Buffer.from(value).toString("base64").replace(/.{1,76}/g, "$&\r\n").trim();
}

function buildRawMessage({ to, subject, html, attachments = [] }) {
    if (!to || !String(to).trim()) throw new Error("Recipient email address is missing.");
    const fromEmail = safeHeader(process.env.GMAIL_USER);
    const fromName = safeHeader(process.env.EMAIL_FROM_NAME || "Joshi's Commerce Academy");
    const boundary = `jca_${crypto.randomBytes(18).toString("hex")}`;
    const lines = [
        `From: ${encodeHeader(fromName)} <${fromEmail}>`,
        `To: ${safeHeader(to)}`,
        `Subject: ${encodeHeader(subject)}`,
        "MIME-Version: 1.0",
    ];

    if (attachments.length) {
        lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`);
    }
    lines.push(
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(Buffer.from(String(html || ""), "utf8")),
    );

    for (const attachment of attachments) {
        const filename = safeHeader(attachment.filename || "attachment.pdf").replace(/["\\]/g, "_");
        const content = Buffer.isBuffer(attachment.content)
            ? attachment.content
            : Buffer.from(attachment.content || "");
        lines.push(
            `--${boundary}`,
            `Content-Type: ${safeHeader(attachment.contentType || "application/pdf")}; name="${filename}"`,
            "Content-Transfer-Encoding: base64",
            `Content-Disposition: attachment; filename="${filename}"`,
            "",
            wrapBase64(content),
        );
    }
    if (attachments.length) lines.push(`--${boundary}--`);

    return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
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
        const accessToken = await getAccessToken();
        const raw = buildRawMessage({ to, subject, html, attachments });
        const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.id) {
            const detail = data.error?.message || data.error_description || `HTTP ${response.status}`;
            throw new Error(`Gmail API send failed: ${detail}`);
        }
        await logEmail({ recipient: to, subject, type, status: "sent" });
        return { messageId: data.id, threadId: data.threadId, provider: "gmail_api" };
    } catch (error) {
        await logEmail({ recipient: to || "unknown", subject: subject || "(no subject)", type, status: "failed", error: error.message });
        console.error("Gmail API email error:", error.message);
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
