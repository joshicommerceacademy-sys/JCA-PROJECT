const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { formatDobPassword } = require("./idGenerators");
const { studentLoginLink } = require("./links");

function resolveUploadPath(url) {
    if (!url) return null;
    const filePath = path.join(__dirname, "..", "..", url.replace(/^\//, ""));
    return fs.existsSync(filePath) ? filePath : null;
}

function addMinutes(timeStr, minutes) {
    const [h, m] = timeStr.split(":").map(Number);
    const total = h * 60 + m + minutes;
    const endH = Math.floor((total % (24 * 60)) / 60);
    const endM = total % 60;
    return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

const TICKET_INSTRUCTIONS = [
    "Carry this hall ticket along with a valid original photo ID to the examination centre.",
    "Report to the centre at least 30 minutes before the reporting time printed above.",
    "Occupy only the seat number allotted to you.",
    "Mobile phones and electronic devices are not allowed inside the examination hall.",
    "This is a computer-generated document; the candidate signature must be signed in person at the centre.",
];

function loginSteps(link) {
    return [
        `Go to the student login page: ${link}`,
        "On the \"Select Exam\" screen, choose your exam from the list — the exam password fills in automatically.",
        "On the next screen, select your Roll Number and enter your password (your date of birth in DDMMYYYY format), then click Login.",
        "Wait for the scheduled exam time, read the on-screen instructions, and click Start Exam.",
    ];
}

async function buildHallTicketPdf(ticket) {
    const password = formatDobPassword(ticket.dob);
    const qrPayload = JSON.stringify({
        hallTicket: ticket.hall_ticket_number,
        roll: ticket.roll_number,
        examId: ticket.exam_id,
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 0, width: 300 });
    const qrImage = Buffer.from(qrDataUrl.split(",")[1], "base64");

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: "A4",
            margin: 40,
            userPassword: password,
            ownerPassword: password,
            permissions: { printing: "highResolution", modifying: false, copying: false, annotating: false },
        });

        const buffers = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);

        doc.rect(40, 40, doc.page.width - 80, doc.page.height - 80).stroke("#cccccc");

        doc.fontSize(18).font("Helvetica-Bold").text("Joshi's Commerce Academy", 0, 70, { align: "center" });
        doc.fontSize(13).font("Helvetica").fillColor("#555555").text("Examination Hall Ticket", { align: "center" });
        doc.fillColor("#000000");
        doc.moveTo(60, 120).lineTo(doc.page.width - 60, 120).stroke("#cccccc");

        const labelX = 70;
        const valueX = 220;
        let y = 145;
        const rowGap = 22;

        const endTime = addMinutes(ticket.start_time, ticket.duration_minutes);
        const rows = [
            ["Student Name", ticket.student_name],
            ["Roll Number", ticket.roll_number],
            ["Standard", ticket.standard_name || "—"],
            ["Exam", ticket.exam_name],
            ["Exam Date", new Date(ticket.exam_date).toLocaleDateString()],
            ["Time", `${ticket.start_time.slice(0, 5)} – ${endTime} (${ticket.duration_minutes} min)`],
            ["Centre", ticket.centre_name || "—"],
            ["City", ticket.centre_city ? `${ticket.centre_city}, ${ticket.centre_address}` : (ticket.centre_address || "—")],
            ["Seat Number", ticket.seat_number || "Not Assigned"],
            ["Hall Ticket No.", ticket.hall_ticket_number],
        ];

        const valueWidth = 210;
        doc.fontSize(11);
        for (const [label, value] of rows) {
            // City's value (city + full address) can run to multiple lines, unlike every other
            // row here — advance by the value's actual rendered height (never less than the
            // usual rowGap) so a long value never overlaps the row below it.
            const valueHeight = doc.heightOfString(String(value), { width: valueWidth });
            doc.font("Helvetica-Bold").text(label, labelX, y, { width: 140 });
            doc.font("Helvetica").text(String(value), valueX, y, { width: valueWidth });
            y += Math.max(rowGap, valueHeight + 6);
        }

        y += 4;
        const warningWidth = doc.page.width - 190 - labelX - 20;
        const warningText =
            "IMPORTANT: Verify that the Exam Centre and City above are correct before you travel. " +
            "Contact Joshi's Commerce Academy immediately if this hall ticket shows the wrong centre.";
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#b91c1c").text(warningText, labelX, y, { width: warningWidth });
        y += doc.heightOfString(warningText, { width: warningWidth }) + 6;
        doc.fillColor("#000000");

        const photoBoxX = doc.page.width - 190;
        const photoBoxY = 145;
        const photoSize = 110;
        const photoPath = resolveUploadPath(ticket.photo_url);
        doc.rect(photoBoxX, photoBoxY, photoSize, photoSize).stroke("#999999");
        if (photoPath) {
            doc.image(photoPath, photoBoxX + 2, photoBoxY + 2, { width: photoSize - 4, height: photoSize - 4 });
        } else {
            doc.fontSize(10).fillColor("#999999").text("No Photo", photoBoxX, photoBoxY + photoSize / 2 - 5, {
                width: photoSize,
                align: "center",
            });
            doc.fillColor("#000000");
        }

        const sigBoxX = photoBoxX;
        const sigBoxY = photoBoxY + photoSize + 12;
        const sigWidth = photoSize;
        const sigHeight = 55;
        const signaturePath = resolveUploadPath(ticket.signature_url);
        doc.rect(sigBoxX, sigBoxY, sigWidth, sigHeight).stroke("#999999");
        if (signaturePath) {
            doc.image(signaturePath, sigBoxX + 2, sigBoxY + 2, { fit: [sigWidth - 4, sigHeight - 4], align: "center", valign: "center" });
        } else {
            doc.fontSize(9).fillColor("#999999").text("No Signature", sigBoxX, sigBoxY + sigHeight / 2 - 4, {
                width: sigWidth,
                align: "center",
            });
            doc.fillColor("#000000");
        }

        const qrSize = 90;
        const qrX = photoBoxX + (photoSize - qrSize) / 2;
        const qrY = sigBoxY + sigHeight + 14;
        doc.image(qrImage, qrX, qrY, { width: qrSize, height: qrSize });
        doc.fontSize(8).fillColor("#999999").text("Scan for check-in", qrX - 15, qrY + qrSize + 4, {
            width: qrSize + 30,
            align: "center",
        });
        doc.fillColor("#000000");

        y += 10;
        doc.moveTo(60, y).lineTo(doc.page.width - 60, y).stroke("#cccccc");
        y += 14;
        doc.fontSize(11).font("Helvetica-Bold").text("Instructions", labelX, y);
        y += 18;
        doc.fontSize(9).font("Helvetica");
        for (const instr of TICKET_INSTRUCTIONS) {
            doc.text(`•  ${instr}`, labelX, y, { width: doc.page.width - 140 });
            y += doc.heightOfString(`•  ${instr}`, { width: doc.page.width - 140 }) + 4;
        }

        y += 10;
        doc.moveTo(60, y).lineTo(doc.page.width - 60, y).stroke("#cccccc");
        y += 14;
        doc.fontSize(11).font("Helvetica-Bold").text("How to Login for the Exam", labelX, y);
        y += 18;
        doc.fontSize(9).font("Helvetica");
        const loginLink = studentLoginLink(ticket.exam_id);
        let stepNumber = 1;
        for (const step of loginSteps(loginLink)) {
            const line = `${stepNumber}.  ${step}`;
            doc.text(line, labelX, y, { width: doc.page.width - 140 });
            y += doc.heightOfString(line, { width: doc.page.width - 140 }) + 4;
            stepNumber += 1;
        }

        const signatureY = doc.page.height - 130;
        const signatureWidth = 200;
        doc.moveTo(labelX, signatureY).lineTo(labelX + signatureWidth, signatureY).stroke("#000000");
        doc.fontSize(9).fillColor("#555555").text("Candidate Signature", labelX, signatureY + 4);

        const invigilatorX = doc.page.width - 60 - signatureWidth;
        doc.moveTo(invigilatorX, signatureY).lineTo(invigilatorX + signatureWidth, signatureY).stroke("#000000");
        doc.fontSize(9).fillColor("#555555").text("Invigilator Signature", invigilatorX, signatureY + 4);
        doc.fillColor("#000000");

        const footerY = doc.page.height - 90;
        doc.moveTo(60, footerY).lineTo(doc.page.width - 60, footerY).stroke("#cccccc");
        doc.fontSize(8).fillColor("#555555").text(
            "The attached PDF is password-protected with your date of birth (DDMMYYYY).",
            60,
            footerY + 10,
            { width: doc.page.width - 120, align: "center" }
        );

        doc.end();
    });
}

module.exports = { buildHallTicketPdf };
