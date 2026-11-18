const express = require("express");
const jwt = require("jsonwebtoken");
const { requireAdmin } = require("../middleware/auth");
const { sendMail } = require("../utils/mailer");

const router = express.Router();
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function configError() {
    const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GMAIL_USER", "JWT_SECRET"]
        .filter((key) => !process.env[key]);
    return missing.length ? `Missing configuration: ${missing.join(", ")}` : null;
}

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
}

function htmlPage(title, message, token) {
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);
    const escapedToken = String(token || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{font:16px Arial,sans-serif;background:#f5f6fa;padding:32px;color:#202124}.card{max-width:760px;margin:40px auto;background:white;padding:28px;border-radius:12px;box-shadow:0 2px 12px #0001}textarea{width:100%;min-height:100px;box-sizing:border-box;padding:12px}button{padding:10px 16px;background:#6842a6;color:white;border:0;border-radius:6px;cursor:pointer}.warn{color:#a33}</style></head><body><div class="card"><h2>${safeTitle}</h2><p>${safeMessage}</p>${token ? `<h3>Google Refresh Token</h3><p class="warn">हा Token गोपनीय आहे. तो कोणालाही पाठवू नका. Render Environment मध्ये GOOGLE_REFRESH_TOKEN म्हणून सेव्ह करा.</p><textarea id="token" readonly>${escapedToken}</textarea><p><button onclick="navigator.clipboard.writeText(document.getElementById('token').value)">Copy Refresh Token</button></p><p>Render मध्ये Token सेव्ह केल्यानंतर हा Browser Tab बंद करा.</p>` : ""}</div></body></html>`;
}

router.get("/status", requireAdmin, (req, res) => {
    const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GMAIL_USER"];
    const missing = required.filter((key) => !process.env[key]);
    res.json({
        status: "success",
        provider: "gmail_api",
        configured: missing.length === 0,
        missing,
        sender: process.env.GMAIL_USER || null,
    });
});

router.post("/test", requireAdmin, async (req, res) => {
    try {
        const result = await sendMail({
            to: process.env.GMAIL_USER,
            subject: "Joshi's Commerce Academy - Gmail API Test",
            html: "<p>Gmail API connection test successful.</p><p>Joshi's Commerce Academy</p>",
            type: "gmail_connection_test",
        });
        res.json({ status: "success", message: `Test email accepted by Gmail API for ${process.env.GMAIL_USER}.`, messageId: result.messageId });
    } catch (error) {
        res.status(502).json({ status: "error", message: error.message });
    }
});

router.get("/auth-url", requireAdmin, (req, res) => {
    const error = configError();
    if (error) return res.status(500).json({ status: "error", message: error });

    const state = jwt.sign({ purpose: "jca_gmail_oauth", adminId: req.admin.id }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: GMAIL_SEND_SCOPE,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
    });
    res.json({ status: "success", authorizationUrl: `${GOOGLE_AUTH_URL}?${params.toString()}` });
});

// Google redirects here after the admin grants Gmail send permission.
router.get("/callback", async (req, res) => {
    try {
        const missingConfig = configError();
        if (missingConfig) return res.status(500).send(htmlPage("Gmail OAuth Not Configured", missingConfig));
        const { code, state, error } = req.query;
        if (error) return res.status(400).send(htmlPage("Google Authorization Failed", `Google ने परवानगी नाकारली: ${String(error)}`));
        if (!code || !state) return res.status(400).send(htmlPage("Invalid OAuth Callback", "Authorization code किंवा state मिळाला नाही."));

        const payload = jwt.verify(String(state), process.env.JWT_SECRET);
        if (payload.purpose !== "jca_gmail_oauth") throw new Error("Invalid OAuth state.");

        const body = new URLSearchParams({
            code: String(code),
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
            grant_type: "authorization_code",
        });
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
        const tokenData = await tokenResponse.json().catch(() => ({}));
        if (!tokenResponse.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || tokenData.error || `Google token exchange failed (${tokenResponse.status})`);
        }

        if (!tokenData.refresh_token) {
            return res.status(409).send(htmlPage(
                "Refresh Token Not Returned",
                `Google authorization completed for ${process.env.GMAIL_USER}, but Google did not return a refresh token. Remove this app's access from your Google Account permissions, then run authorization again with consent.`
            ));
        }

        console.log(`Gmail OAuth authorization completed for configured sender ${process.env.GMAIL_USER}; refresh token issued. Admin ID: ${payload.adminId}`);
        return res.send(htmlPage(
            "Gmail Authorization Successful",
            `Configured Academy Gmail account: ${process.env.GMAIL_USER}. खालील Refresh Token Render Environment मध्ये GOOGLE_REFRESH_TOKEN म्हणून सेव्ह करा.`,
            tokenData.refresh_token
        ));
    } catch (error) {
        console.error("Gmail OAuth callback error:", error.message);
        return res.status(400).send(htmlPage("Gmail Authorization Failed", error.message));
    }
});

module.exports = router;
