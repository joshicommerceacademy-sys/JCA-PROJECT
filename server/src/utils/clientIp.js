const { query } = require("../db/pool");
const { getSettings } = require("./settings");

// The candidate's real network address. Behind Render / a CDN the socket address is the proxy, so the
// forwarded headers are checked first (CDN-specific ones, then the first X-Forwarded-For entry).
// IPv4-mapped IPv6 ("::ffff:1.2.3.4") is shown as plain IPv4.
function getClientIp(req) {
    const h = req.headers || {};
    const candidates = [
        h["cf-connecting-ip"],
        h["true-client-ip"],
        h["x-real-ip"],
        String(h["x-forwarded-for"] || "").split(",")[0],
        req.ip,
        req.socket && req.socket.remoteAddress,
    ];
    for (const c of candidates) {
        const v = String(c || "").trim().replace(/^::ffff:/, "");
        if (v) return v.slice(0, 64);
    }
    return null;
}

// Remembers the device address on the student (and the running attempt). Honours the
// "Capture student IP address" setting. Never throws - tracking must not break a login or an exam.
async function captureIp(req, studentId, attemptId) {
    try {
        const settings = await getSettings();
        if (settings && settings.ip_capture_enabled === false) return null;
        const ip = getClientIp(req);
        if (!ip) return null;
        await query("UPDATE students SET last_ip = $1, last_ip_at = now() WHERE id = $2", [ip, studentId]);
        if (attemptId) await query("UPDATE exam_attempts SET ip_address = $1 WHERE id = $2", [ip, attemptId]);
        return ip;
    } catch (error) {
        console.error("[IP] capture failed:", error.message);
        return null;
    }
}

module.exports = { getClientIp, captureIp };
