const PDFDocument = require("pdfkit");

const COLS = [
    { key: "sno", label: "S.No", width: 40 },
    { key: "rollNumber", label: "Roll Number", width: 130 },
    { key: "fullName", label: "Candidate Name", width: 220 },
    { key: "signature", label: "Signature", width: 125 },
];

function drawTableHeader(doc, x, y) {
    let cx = x;
    doc.font("Helvetica-Bold").fontSize(10);
    for (const col of COLS) {
        doc.text(col.label, cx + 4, y + 6, { width: col.width - 8 });
        cx += col.width;
    }
    doc.rect(x, y, COLS.reduce((sum, c) => sum + c.width, 0), 24).stroke("#999999");
    return y + 24;
}

function drawRow(doc, x, y, rowHeight, values) {
    let cx = x;
    doc.font("Helvetica").fontSize(10);
    for (const col of COLS) {
        if (col.key !== "signature" && values[col.key] !== undefined) {
            doc.text(String(values[col.key]), cx + 4, y + 7, { width: col.width - 8 });
        }
        doc.rect(cx, y, col.width, rowHeight).stroke("#cccccc");
        cx += col.width;
    }
}

function buildAttendanceSheetPdf(exam, students) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        const buffers = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);

        doc.fontSize(16).font("Helvetica-Bold").text("Joshi's Commerce Academy", { align: "center" });
        doc.fontSize(12).font("Helvetica").text("Exam Attendance Sheet", { align: "center" });
        doc.moveDown(0.8);

        doc.fontSize(10).font("Helvetica");
        doc.text(`Exam: ${exam.name}`);
        doc.text(`Date: ${new Date(exam.exam_date).toLocaleDateString()}   Time: ${exam.start_time}`);
        doc.text(`Centre: ${exam.centre_name || "—"}`);
        doc.font("Helvetica-Bold").text(`Total Candidates: ${students.length}`);
        doc.font("Helvetica");
        doc.moveDown(0.8);

        const tableX = doc.page.margins.left;
        const tableWidth = COLS.reduce((sum, c) => sum + c.width, 0);
        const rowHeight = 26;
        const bottomLimit = doc.page.height - doc.page.margins.bottom;

        let y = drawTableHeader(doc, tableX, doc.y);

        students.forEach((s, i) => {
            if (y + rowHeight > bottomLimit) {
                doc.addPage();
                y = drawTableHeader(doc, tableX, doc.page.margins.top);
            }
            drawRow(doc, tableX, y, rowHeight, {
                sno: i + 1,
                rollNumber: s.roll_number,
                fullName: s.full_name,
            });
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
