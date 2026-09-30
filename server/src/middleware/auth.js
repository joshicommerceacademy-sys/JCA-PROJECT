const jwt = require("jsonwebtoken");

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

module.exports = { requireAdmin, requireStudent };
