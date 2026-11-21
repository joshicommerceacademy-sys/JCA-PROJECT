const PDFDocument = require("pdfkit");
const { applyWatermark, loadExamLogo } = require("./pdfBrand");
const { loadImageBuffer } = require("./studentFiles");
const { fmtDate } = require("./dateFormat");

// Columns of the printed sheet. "Seat Number" is always a blank box to be filled in by hand after
// printing. Photo and Signature (the images the candidate uploaded) appear only when the exam has
// "Show photo & signature" switched on. "Candidate Sign" is left empty for the candidate to sign.
function getCols(showImages) {
    return showImages
        ? [
            { key: "sno", label: "S.No", width: 28 },
            { key: "rollNumber", label: "Roll Number", width: 68 },
            { key: "fullName", label: "Candidate Name", width: 112 },
            { key: "seat", label: "Seat Number", width: 52 },
            { key: "photo", label: "Photo", width: 56 },
            { key: "signatureImg", label: "Signature", width: 84 },
            { key: "sign", label: "Candidate Sign", width: 115 },
        ]
        : [
            { key: "sno", label: "S.No", width: 32 },
            { key: "rollNumber", label: "Roll Number", width: 92 },
            { key: "fullName", label: "Candidate Name", width: 166 },
            { key: "seat", label: "Seat Number", width: 65 },
            { key: "sign", label: "Candidate Sign", width: 160 },
        ];
}

function drawTableHeader(doc, x, y, COLS) {
    let cx = x;
    doc.font("Helvetica-Bold").fontSize(9);
    for (const col of COLS) {
        doc.text(col.label, cx + 3, y + 7, { width: col.width - 6, lineBreak: false });
        cx += col.width;
    }
    doc.rect(x, y, COLS.reduce((sum, c) => sum + c.width, 0), 24).stroke("#999999");
    return y + 24;
}

function drawImage(doc, buffer, x, y, w, h) {
    if (!buffer) return;
    try {
        doc.image(buffer, x + 2, y + 2, { fit: [w - 4, h - 4], align: "center", valign: "center" });
    } catch {
        // unreadable image - leave the box empty
    }
}

async function buildAttendanceSheetPdf(exam, students) {
    const showImages = !!exam.show_photo_signature;
    const COLS = getCols(showImages);
    const logo = await loadExamLogo(exam);
    // Load every candidate's photo / signature before the document is written.
    const images = new Map();
    if (showImages) {
        for (const s of students) {
            images.set(s.roll_number, {
                photo: await loadImageBuffer(s.photo_url).catch(() => null),
                signature: await loadImageBuffer(s.signature_url).catch(() => null),
            });
        }
    }
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        const buffers = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);
        applyWatermark(doc, logo);

        doc.fontSize(16).font("Helvetica-Bold").text("Joshi's Commerce Academy", { align: "center" });
        doc.fontSize(12).font("Helvetica").text("Exam Attendance Sheet", { align: "center" });
        doc.moveDown(0.8);

        doc.fontSize(10).font("Helvetica");
        doc.text(`Exam: ${exam.name}`);
        doc.text(`Date: ${fmtDate(exam.exam_date)}   Time: ${exam.start_time}`);
        doc.text(`Centre: ${exam.centre_name || "—"}`);
        doc.font("Helvetica-Bold").text(`Total Candidates: ${students.length}`);
        doc.font("Helvetica");
        doc.moveDown(0.8);

        const tableX = doc.page.margins.left;
        const tableWidth = COLS.reduce((sum, c) => sum + c.width, 0);
        const rowHeight = showImages ? 54 : 28;
        const bottomLimit = doc.page.height - doc.page.margins.bottom;

        let y = drawTableHeader(doc, tableX, doc.y, COLS);

        students.forEach((s, i) => {
            if (y + rowHeight > bottomLimit) {
                doc.addPage();
                y = drawTableHeader(doc, tableX, doc.page.margins.top, COLS);
            }
            let cx = tableX;
            doc.font("Helvetica").fontSize(9).fillColor("#000000");
            for (const col of COLS) {
                const textY = y + (rowHeight - 10) / 2;
                if (col.key === "sno") doc.text(String(i + 1), cx + 3, textY, { width: col.width - 6, lineBreak: false });
                else if (col.key === "rollNumber") doc.text(String(s.roll_number || ""), cx + 3, textY, { width: col.width - 6, lineBreak: false });
                else if (col.key === "fullName") doc.text(String(s.full_name || ""), cx + 3, y + 6, { width: col.width - 6, height: rowHeight - 8, ellipsis: true });
                else if (col.key === "photo") drawImage(doc, images.get(s.roll_number)?.photo, cx, y, col.width, rowHeight);
                else if (col.key === "signatureImg") drawImage(doc, images.get(s.roll_number)?.signature, cx, y, col.width, rowHeight);
                // seat + sign: intentionally blank
                doc.rect(cx, y, col.width, rowHeight).stroke("#cccccc");
                cx += col.width;
            }
            y += rowHeight;
        });

        doc.y = y;
        doc.moveDown(2);
        if (doc.y > bottomLimit - 40) doc.addPage();
        doc.fontSize(9).fillColor("#555555").text(
            "Invigilator Signature: ______________________        Date: ______________________",
            tableX,
            undefined,
            { width: tableWidth }
        );

        doc.end();
    });
}

module.exports = { buildAttendanceSheetPdf };
