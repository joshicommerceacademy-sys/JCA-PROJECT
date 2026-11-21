const PDFDocument = require("pdfkit");
const { applyWatermark, loadExamLogo } = require("./pdfBrand");
const { fmtDate, fmtDateTime } = require("./dateFormat");

const STATUS_LABEL = { logged_in: "Logged in", active: "Active", inactive: "Inactive" };

// Verification Desk report of one exam: desk sign-in status, then who was allowed (with seat numbers)
// and who was disallowed. Built in memory for the download only.
async function buildDeskReportPdf({ exam, venue, logins, allowed, disallowed, counts }) {
    const logo = await loadExamLogo(exam);
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 36 });
        const buffers = [];
        doc.on("data", (c) => buffers.push(c));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);
        applyWatermark(doc, logo);

        const x0 = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const bottom = doc.page.height - doc.page.margins.bottom;

        const table = (title, cols, rows, emptyText) => {
            if (doc.y > bottom - 80) doc.addPage();
            doc.moveDown(0.8).font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(title, x0);
            doc.moveDown(0.3);
            const total = cols.reduce((s, c) => s + c.w, 0);
            const k = width / total;
            const head = (y) => {
                doc.rect(x0, y, width, 18).fill("#eeeeee");
                doc.fillColor("#000000").font("Helvetica-Bold").fontSize(8.5);
                let cx = x0;
                for (const c of cols) { doc.text(c.label, cx + 3, y + 5, { width: c.w * k - 6, lineBreak: false }); cx += c.w * k; }
                return y + 18;
            };
            let y = head(doc.y);
            doc.font("Helvetica").fontSize(8.5);
            if (!rows.length) doc.text(emptyText, x0 + 3, y + 5);
            for (const r of rows) {
                if (y + 18 > bottom) { doc.addPage(); y = head(doc.page.margins.top); doc.font("Helvetica").fontSize(8.5); }
                let cx = x0;
                for (const c of cols) {
                    doc.fillColor("#000000").text(String(r[c.key] ?? ""), cx + 3, y + 5, { width: c.w * k - 6, height: 12, lineBreak: false, ellipsis: true });
                    cx += c.w * k;
                }
                doc.rect(x0, y, width, 18).stroke("#dddddd");
                y += 18;
            }
            doc.y = y;
        };

        doc.fontSize(16).font("Helvetica-Bold").text("Joshi's Commerce Academy", { align: "center" });
        doc.fontSize(12).font("Helvetica").text("Verification Desk Report", { align: "center" });
        doc.moveDown(0.6).fontSize(10);
        doc.text(`Exam: ${exam.name}`);
        doc.text(`Date: ${fmtDate(exam.exam_date)}   Time: ${String(exam.start_time).slice(0, 5)}`);
        doc.text(`Venue: ${venue || "-"}`);
        doc.text(`Generated: ${fmtDateTime(new Date())}`);
        doc.moveDown(0.4).font("Helvetica-Bold").text(
            `Total: ${counts.total}   Allowed: ${counts.allowed}   Disallowed: ${counts.disallowed}   Waiting: ${counts.waiting}   Absent: ${counts.absent}`
        );

        table("Verification desk login", [
            { key: "userId", label: "Desk Login", w: 120 }, { key: "centre", label: "Centre", w: 110 },
            { key: "status", label: "Status", w: 70 }, { key: "login", label: "Last Login", w: 130 }, { key: "seen", label: "Last Seen", w: 130 },
        ], logins.map((l) => ({
            userId: l.userId, centre: l.centreName || "-", status: STATUS_LABEL[l.status] || l.status,
            login: l.lastLoginAt ? fmtDateTime(l.lastLoginAt) : "Never signed in", seen: l.lastSeenAt ? fmtDateTime(l.lastSeenAt) : "-",
        })), "No desk login for this exam.");

        table(`Allowed (${allowed.length})`, [
            { key: "sno", label: "S.No", w: 35 }, { key: "roll", label: "Roll No", w: 75 }, { key: "name", label: "Candidate Name", w: 170 },
            { key: "seat", label: "Seat No", w: 60 }, { key: "lab", label: "Lab", w: 80 }, { key: "at", label: "Allowed At", w: 130 },
        ], allowed.map((c, i) => ({
            sno: i + 1, roll: c.roll_number, name: c.full_name, seat: c.seat_number || "-", lab: c.lab_name || "-", at: fmtDateTime(c.exam_access_allowed_at),
        })), "Nobody allowed.");

        table(`Disallowed (${disallowed.length})`, [
            { key: "sno", label: "S.No", w: 35 }, { key: "roll", label: "Roll No", w: 75 }, { key: "name", label: "Candidate Name", w: 170 }, { key: "reason", label: "Reason", w: 270 },
        ], disallowed.map((c, i) => ({ sno: i + 1, roll: c.roll_number, name: c.full_name, reason: c.disallow_reason })), "Nobody disallowed.");

        doc.end();
    });
}

module.exports = { buildDeskReportPdf };
