const fs = require("fs");
const path = require("path");
const { query } = require("../db/pool");

// Stores a candidate's photo/signature in the database and returns the URL that serves it.
async function saveStudentFile(studentId, kind, file) {
    if (!file) return null;
    await query(
        `INSERT INTO student_files (student_id, kind, mime, data) VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id, kind) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()`,
        [studentId, kind, file.mimetype, file.buffer]
    );
    return `/api/files/students/${studentId}/${kind}?v=${Date.now()}`;
}

// Saves whichever of photo/signature were uploaded and points the student row at them.
async function saveStudentUploads(studentId, files) {
    const photoUrl = await saveStudentFile(studentId, "photo", files?.photo?.[0]);
    const signatureUrl = await saveStudentFile(studentId, "signature", files?.signature?.[0]);
    if (photoUrl || signatureUrl) {
        await query(
            "UPDATE students SET photo_url = COALESCE($1, photo_url), signature_url = COALESCE($2, signature_url) WHERE id = $3",
            [photoUrl, signatureUrl, studentId]
        );
    }
    return { photoUrl, signatureUrl };
}

// Loads an image (Buffer) for PDF generation from either storage style: database-backed
// /api/files/students/... URLs, or legacy files under /uploads on disk. Null when missing.
async function loadImageBuffer(url) {
    if (!url) return null;
    const m = String(url).match(/^\/api\/files\/students\/(\d+)\/(photo|signature)/);
    if (m) {
        const [row] = await query("SELECT data FROM student_files WHERE student_id = $1 AND kind = $2", [m[1], m[2]]);
        return row ? row.data : null;
    }
    const filePath = path.join(__dirname, "..", "..", String(url).replace(/^\//, "").split("?")[0]);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

module.exports = { saveStudentFile, saveStudentUploads, loadImageBuffer };
