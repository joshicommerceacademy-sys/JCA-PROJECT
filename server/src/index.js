const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const { scheduleExamReminderJob } = require("./jobs/examReminderJob");

const app = express();
const PORT = process.env.PORT || 5000;

// Needed for req.ip to resolve the real client address (from X-Forwarded-For) instead of
// the reverse proxy's own address, when deployed behind one — used by the optional IP
// capture setting on attempt start (see routes/studentExam.js).
app.set("trust proxy", true);

app.use(
    cors({
        origin: process.env.CLIENT_ORIGIN?.split(",") || "http://localhost:5173",
        credentials: true,
    })
);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/api/health", (req, res) => {
    // `now` lets clients correct their own clock drift against the server's — the exam
    // deadline (`ends_at`) is always enforced server-side regardless, but a candidate's
    // on-screen countdown should match the deadline that's actually being enforced.
    res.json({ status: "success", message: "JCA Exam Portal API is running.", now: new Date().toISOString() });
});

app.use("/api/admin/login", require("./routes/adminAuth"));
app.use("/api/student/login", require("./routes/studentAuth"));
app.use("/api/admin/centres", require("./routes/centres"));
app.use("/api/admin/standards", require("./routes/standards"));
app.use("/api/admin/students", require("./routes/students"));
app.use("/api/admin/question-banks", require("./routes/questionBanks"));
app.use("/api/admin/questions", require("./routes/questions"));
app.use("/api/admin/exams", require("./routes/exams"));
app.use("/api/admin/results", require("./routes/results"));
app.use("/api/admin/hall-tickets", require("./routes/hallTickets"));
app.use("/api/admin/dashboard", require("./routes/dashboard"));
app.use("/api/admin/attendance", require("./routes/attendance"));
app.use("/api/admin/monitor", require("./routes/monitor"));
app.use("/api/admin/analytics", require("./routes/analytics"));
app.use("/api/admin/reappear", require("./routes/reappear"));
app.use("/api/admin/settings", require("./routes/settings"));
app.use("/api/student", require("./routes/studentExam"));

// Render runs the API and compiled React app from the same Web Service.
// Always try to serve client/dist when it exists (not only when NODE_ENV is set),
// so the root URL works even if Render's environment configuration is incomplete.
const clientDist = path.resolve(__dirname, "..", "..", "client", "dist");
const clientIndex = path.join(clientDist, "index.html");
const hasClientBuild = fs.existsSync(clientIndex);

console.log(`[WEB] React build: ${hasClientBuild ? clientDist : "NOT FOUND"}`);

if (hasClientBuild) {
    app.use(express.static(clientDist, { index: "index.html" }));

    // React Router needs the SPA entry point for direct navigation to client routes.
    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) {
            return next();
        }
        return res.sendFile(clientIndex);
    });
}

app.use((req, res) => {
    res.status(404).json({ status: "error", message: "Route not found." });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
    console.error(error);
    res.status(error.status || 500).json({ status: "error", message: error.message || "Server error" });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("==============================================");
    console.log("   JOSHI'S COMMERCE ACADEMY - EXAM PORTAL API");
    console.log("==============================================");
    console.log(`Server:   http://localhost:${PORT}`);
    console.log(`Health:   http://localhost:${PORT}/api/health`);
    console.log("==============================================");
    scheduleExamReminderJob();
});
