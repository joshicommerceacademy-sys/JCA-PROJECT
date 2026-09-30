const multer = require("multer");
const path = require("path");
const fs = require("fs");

const photoFolder = path.join(__dirname, "..", "..", "uploads", "photos");
if (!fs.existsSync(photoFolder)) {
    fs.mkdirSync(photoFolder, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, photoFolder),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        cb(null, safeName);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Only JPG, PNG and WEBP images are allowed"));
        }
        cb(null, true);
    },
});

const uploadStudentFiles = upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "signature", maxCount: 1 },
]);

const logoFolder = path.join(__dirname, "..", "..", "uploads", "logos");
if (!fs.existsSync(logoFolder)) {
    fs.mkdirSync(logoFolder, { recursive: true });
}

const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, logoFolder),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        cb(null, safeName);
    },
});

const uploadExamLogo = multer({
    storage: logoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Only JPG, PNG, WEBP and SVG images are allowed"));
        }
        cb(null, true);
    },
}).single("logo");

module.exports = { uploadStudentFiles, uploadExamLogo };
