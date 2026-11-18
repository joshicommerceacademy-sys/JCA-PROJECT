const fs = require("fs");
const path = require("path");

// Shared page branding for every generated PDF except the hall ticket (which has its own design):
// a faint silver page background, the JCA logo with a copyright mark at the top of every page, and
// a copyright line at the bottom of every page.
const LOGO_PATH = path.join(__dirname, "..", "assets", "jca-logo.png");
const SILVER = "#F1F2F4";

function drawPageBrand(doc, examName) {
    const { width, height } = doc.page;
    const keepX = doc.x;
    const keepY = doc.y;
    const keepBottom = doc.page.margins.bottom;

    doc.save();
    doc.rect(0, 0, width, height).fill(SILVER);

    if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, 24, 10, { width: 70 });
        doc.fontSize(8).font("Helvetica").fillColor("#666666").text("©", 97, 12, { lineBreak: false });
    }

    // The footer sits inside the bottom margin; zero it while writing so pdfkit does not paginate.
    doc.page.margins.bottom = 0;
    doc.fontSize(7).font("Helvetica").fillColor("#777777").text(
        `© ${new Date().getFullYear()} ${examName ? examName + ' - ' : ''}Joshi's Commerce Academy. All rights reserved.`,
        0, height - 24, { width, align: "center", lineBreak: false }
    );
    doc.page.margins.bottom = keepBottom;
    doc.restore();

    doc.x = keepX;
    doc.y = keepY;
}

// Call right after creating the PDFDocument: brands the first page and every page added later.
function applyPdfBrand(doc, examName) {
    drawPageBrand(doc, examName);
    doc.on("pageAdded", () => drawPageBrand(doc, examName));
}

// ---- Background logo (the same logo the exam pages show) ----
const BADGE_PATH = path.join(__dirname, "..", "assets", "jca-badge.png");

// The exam's own logo when it has one that PDFs can embed (PNG/JPEG), otherwise the JCA badge.
async function loadExamLogo(exam) {
    const { loadImageBuffer } = require("./studentFiles");
    try {
        const buf = await loadImageBuffer(exam && exam.logo_url);
        if (buf && buf.length > 8) {
            const isPng = buf[0] === 0x89 && buf[1] === 0x50;
            const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
            if (isPng || isJpg) return buf;
        }
    } catch {
        // fall through to the default badge
    }
    return fs.existsSync(BADGE_PATH) ? fs.readFileSync(BADGE_PATH) : null;
}

function drawWatermark(doc, logo) {
    if (!logo) return;
    const { width, height } = doc.page;
    const size = Math.min(width, height) * 0.55;
    const keepX = doc.x;
    const keepY = doc.y;
    doc.save();
    doc.opacity(0.08);
    doc.image(logo, (width - size) / 2, (height - size) / 2, { fit: [size, size], align: "center", valign: "center" });
    doc.restore();
    doc.x = keepX;
    doc.y = keepY;
}

// Faint centered logo behind the content of every page. Call after applyPdfBrand (if used) so it
// sits above the page colour and below the text.
function applyWatermark(doc, logo) {
    drawWatermark(doc, logo);
    doc.on("pageAdded", () => drawWatermark(doc, logo));
}

module.exports = { applyPdfBrand, applyWatermark, loadExamLogo };
