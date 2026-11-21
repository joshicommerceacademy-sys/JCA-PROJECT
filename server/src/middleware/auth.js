const jwt = require("jsonwebtoken");
const { query } = require("../db/pool");

// Marks a Verification Desk sign-in as "seen" (throttled) so Reports > Verification Desk can show
// Active / Inactive. Failures never affect the request.
const deskSeen = new Map();
function touchDeskSession(payload) {
    if (!payload.userId || !payload.examId) return;
    const key = `${payload.examId}:${payload.userId}`;
    const now = Date.now();
    if (now - (deskSeen.get(key) || 0) < 20000) return;
    deskSeen.set(key, now);
    query(
        `INSERT INTO desk_sessions (exam_id, user_id) VALUES ($1, $2)
         ON CONFLICT (exam_id, user_id) DO UPDATE SET last_seen_at = now()`,
        [payload.examId, payload.userId]
    ).catch(() => {});
}

function verifyToken(req) {
    const header = req.header("Authorization");
    const token = header?.replace("Bearer ", "");
    if (!token) {
        const err = new Error("Access denied. No token provided.");
        err.status = 401;
        throw err;
    }
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        const err = new Error("Invalid or expired token.");
        err.status = 401;
        throw err;
    }
}

function requireAdmin(req, res, next) {
    try {
        const payload = verifyToken(req);
        if (payload.role !== "admin") {
            return res.status(403).json({ status: "error", message: "Admin access required." });
        }
        req.admin = payload;
        next();
    } catch (error) {
        res.status(error.status || 401).json({ status: "error", message: error.message });
    }
}

// Admin, or a Verification Desk session (role "desk", scoped to one exam via payload.examId).
function requireAdminOrDesk(req, res, next) {
    try {
        const payload = verifyToken(req);
        if (payload.role === "admin") {
            req.admin = payload;
        } else if (payload.role === "desk") {
            req.desk = payload;
            touchDeskSession(payload);
        } else {
            return res.status(403).json({ status: "error", message: "Admin or verification desk access required." });
        }
        next();
    } catch (error) {
        res.status(error.status || 401).json({ status: "error", message: error.message });
    }
}

function requireStudent(req, res, next) {
    try {
        const payload = verifyToken(req);
        if (payload.role !== "student") {
            return res.status(403).json({ status: "error", message: "Student access required." });
        }
        req.student = payload;
        next();
    } catch (error) {
        res.status(error.status || 401).json({ status: "error", message: error.message });
    }
}

module.exports = { requireAdmin, requireAdminOrDesk, requireStudent };
