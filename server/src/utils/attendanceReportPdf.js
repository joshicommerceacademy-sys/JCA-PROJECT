const PDFDocument = require("pdfkit");

// Same visual pattern as attendanceSheetPdf.js, but filled with the actual attendance data
// (access-granted / login / submit timestamps, all down to the second) instead of being a
// blank sheet for manual marking — this is the admin-triggered "Attendance Report" the user
// downloads once an exam has run, not the pre-exam blank signature sheet.
const COLS = [
    { key: "sno", label: "S.No", width: 32 },
    { key: "rollNumber", label: "Roll Number", width: 75 },
    { key: "fullName", label: "Candidate Name", width: 100 },
    { key: "accessGranted", label: "Access Granted", width: 105 },
    { key: "loginTime", label: "Login Time", width: 105 },
    { key: "submitTime", label: "Submit Time", width: 100 },
];

function formatTimestamp(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    });
}

function drawTableHeader(doc, x, y) {
    let cx = x;
    doc.font("Helvetica-Bold").fontSize(8);
    for (const col of COLS) {
        doc.text(col.label, cx + 3, y + 6, { width: col.width - 6 });
        cx += col.width;
    }
    doc.rect(x, y, COLS.reduce((sum, c) => sum + c.width, 0), 22).stroke("#999999");
    return y + 22;
}

function drawRow(doc, x, y, rowHeight, values) {
    let cx = x;
    doc.font("Helvetica").fontSize(8);
    for (const col of COLS) {
        doc.text(String(values[col.key] ?? "—"), cx + 3, y + 6, { width: col.width - 6 });
        doc.rect(cx, y, col.width, rowHeight).stroke("#cccccc");
        cx += col.width;
    }
}

function buildAttendanceReportPdf(exam, rows) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40 });
        const buffers = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);

        doc.fontSize(16).font("Helvetica-Bold").text("Joshi's Commerce Academy", { align: "center" });
        doc.fontSize(12).font("Helvetica").text("Exam Attendance Report", { align: "center" });
        doc.moveDown(0.8);

        doc.fontSize(10).font("Helvetica");
        doc.text(`Exam: ${exam.name}`);
        doc.text(`Scheduled Start: ${new Date(exam.exam_date).toLocaleDateString("en-GB")} at ${exam.start_time}`);
        doc.font("Helvetica-Bold").text(`Total Candidates: ${rows.length}`);
        doc.font("Helvetica");
        doc.moveDown(0.8);

        const tableX = doc.page.margins.left;
        const rowHeight = 22;
        const bottomLimit = doc.page.height - doc.page.margins.bottom;

        let y = drawTableHeader(doc, tableX, doc.y);

        rows.forEach((r, i) => {
            if (y + rowHeight > bottomLimit) {
                doc.addPage();
                y = drawTableHeader(doc, tableX, doc.page.margins.top);
            }
            drawRow(doc, tableX, y, rowHeight, {
                sno: i + 1,
                rollNumber: r.roll_number,
                fullName: r.full_name,
                accessGranted: formatTimestamp(r.checked_in_at),
                loginTime: formatTimestamp(r.started_at),
                submitTime: formatTimestamp(r.submitted_at),
            });
            y += rowHeight;
        });

        doc.end();
    });
}

module.exports = { buildAttendanceReportPdf };
