const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

function resolvePhotoPath(photoUrl) {
    if (!photoUrl) return null;
    const filePath = path.join(__dirname, "..", "..", photoUrl.replace(/^\//, ""));
    return fs.existsSync(filePath) ? filePath : null;
}

async function buildResultPdf(result, answers = []) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 40 });

        const buffers = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);

        doc.rect(40, 40, doc.page.width - 80, doc.page.height - 80).stroke("#cccccc");

        doc.fontSize(18).font("Helvetica-Bold").text("Joshi's Commerce Academy", 0, 70, { align: "center" });
        doc.fontSize(13).font("Helvetica").fillColor("#555555").text("Examination Result", { align: "center" });
        doc.fillColor("#000000");
        doc.moveTo(60, 120).lineTo(doc.page.width - 60, 120).stroke("#cccccc");

        const labelX = 70;
        const valueX = 220;
        let y = 145;
        const rowGap = 22;

        const rows = [
            ["Student Name", result.student_name],
            ["Roll Number", result.roll_number],
            ["Standard", result.standard_name || "—"],
            ["Centre", result.centre_name || "—"],
            ["Exam", result.exam_name],
            ["Submitted On", new Date(result.submitted_at).toLocaleString()],
        ];

        doc.fontSize(11);
        for (const [label, value] of rows) {
            doc.font("Helvetica-Bold").text(label, labelX, y, { width: 140 });
            doc.font("Helvetica").text(String(value), valueX, y, { width: 220 });
            y += rowGap;
        }

        const photoBoxX = doc.page.width - 190;
        const photoBoxY = 145;
        const photoSize = 110;
        const photoPath = resolvePhotoPath(result.photo_url);
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

        y += 16;
        doc.moveTo(60, y).lineTo(doc.page.width - 60, y).stroke("#cccccc");
        y += 24;

        const boxWidth = 130;
        const boxGap = 16;
        const stats = [
            ["Correct", result.correct_count],
            ["Wrong", result.wrong_count],
            ["Unanswered", result.unanswered_count],
        ];
        stats.forEach(([label, value], i) => {
            const boxX = labelX + i * (boxWidth + boxGap);
            doc.rect(boxX, y, boxWidth, 60).stroke("#cccccc");
            doc.fontSize(18).font("Helvetica-Bold").text(String(value), boxX, y + 12, { width: boxWidth, align: "center" });
            doc.fontSize(9).font("Helvetica").fillColor("#555555").text(label, boxX, y + 38, { width: boxWidth, align: "center" });
            doc.fillColor("#000000");
        });
        y += 90;

        doc.fontSize(11);
        const summaryRows = [
            ["Marks Obtained", `${result.marks_obtained} / ${result.total_marks}`],
            ["Percentage", `${result.percentage}%`],
            ["Result", result.result_status === "passed" ? "PASSED" : "FAILED"],
        ];
        for (const [label, value] of summaryRows) {
            doc.font("Helvetica-Bold").text(label, labelX, y, { width: 160 });
            doc.font(label === "Result" ? "Helvetica-Bold" : "Helvetica")
                .fillColor(label === "Result" ? (result.result_status === "passed" ? "#15803d" : "#b91c1c") : "#000000")
                .text(String(value), valueX, y, { width: 220 });
            doc.fillColor("#000000");
            y += rowGap;
        }

        const footerY = doc.page.height - 90;
        doc.moveTo(60, footerY).lineTo(doc.page.width - 60, footerY).stroke("#cccccc");
        doc.fontSize(8).fillColor("#555555").text(
            "This is a computer-generated result document.",
            60,
            footerY + 10,
            { width: doc.page.width - 120, align: "center" }
        );
        doc.fillColor("#000000");

        if (answers.length) {
            const contentWidth = doc.page.width - 120;
            const pageBottom = doc.page.height - 100;
            const newAnswerPage = () => {
                doc.addPage();
                doc.rect(40, 40, doc.page.width - 80, doc.page.height - 80).stroke("#cccccc");
                return 60;
            };

            doc.addPage();
            doc.rect(40, 40, doc.page.width - 80, doc.page.height - 80).stroke("#cccccc");
            doc.fontSize(14).font("Helvetica-Bold").text("Answer Sheet", 60, 60);
            doc.fontSize(9).font("Helvetica").fillColor("#555555").text(
                `${result.student_name} (${result.roll_number}) — ${result.exam_name}`,
                60,
                80
            );
            doc.fillColor("#000000");

            let ay = 110;
            answers.forEach((a, i) => {
                const qText = `${i + 1}. ${a.question_text}`;
                doc.fontSize(10).font("Helvetica-Bold");
                const qHeight = doc.heightOfString(qText, { width: contentWidth });
                const optionRows = [
                    ["A", a.option_a], ["B", a.option_b], ["C", a.option_c], ["D", a.option_d],
                ].map(([key, text]) => {
                    const isCorrectOpt = a.correct_answer === key;
                    const isSelected = a.selected_option === key;
                    const tag = isCorrectOpt ? "[Correct] " : isSelected ? "[Your Answer] " : "";
                    return { text: `${tag}${key}. ${text}`, color: isCorrectOpt ? "#15803d" : isSelected ? "#b91c1c" : "#000000" };
                });
                const optionHeights = optionRows.map((o) => doc.heightOfString(o.text, { width: contentWidth - 12 }));
                const blockHeight = qHeight + 4 + optionHeights.reduce((a2, b2) => a2 + b2 + 2, 0) + 18;

                if (ay + blockHeight > pageBottom) ay = newAnswerPage();

                doc.fontSize(10).font("Helvetica-Bold").text(qText, 60, ay, { width: contentWidth });
                ay += qHeight + 4;

                doc.fontSize(9).font("Helvetica");
                optionRows.forEach((o, idx) => {
                    doc.fillColor(o.color).text(o.text, 72, ay, { width: contentWidth - 12 });
                    ay += optionHeights[idx] + 2;
                });
                doc.fillColor("#000000");

                const statusText = a.selected_option
                    ? a.is_correct
                        ? `Correct (+${a.marks_obtained} mark${Number(a.marks_obtained) === 1 ? "" : "s"})`
                        : `Wrong (${a.marks_obtained} / ${a.question_marks} marks)`
                    : `Not Answered (0 / ${a.question_marks} marks)`;
                doc.fontSize(8).fillColor("#555555").text(statusText, 60, ay, { width: contentWidth });
                doc.fillColor("#000000");
                ay += 20;
            });
        }

        doc.end();
    });
}

module.exports = { buildResultPdf };
