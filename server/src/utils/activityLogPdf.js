const PDFDocument = require("pdfkit");
const { query } = require("../db/pool");
const { getScheduledStart } = require("./examWindow");
const { applyWatermark, loadExamLogo } = require("./pdfBrand");
const { fmtDate, fmtDateTime } = require("./dateFormat");

const REASONS = {
    manual: "Candidate pressed Done Exam",
    timeout: "Time over (auto-submitted)",
    tab_switch: "Auto-submitted: tab switch limit reached",
    fullscreen_exit: "Auto-submitted: fullscreen exit limit reached",
    devtools: "Auto-submitted: developer tools detected",
    admin_stop: "Exam batch stopped by admin",
};

const fmt = (d) => fmtDateTime(d);

// Gathers every activity of one exam batch as { at, name, roll, activity, detail } rows, oldest first.
// Lifecycle steps are rebuilt from the records already kept; restarts, desk revokes, stops and
// device restarts come from the internal event log. Nothing is stored by this report.
async function collectActivityRows(exam) {
    const students = await query(
        `SELECT st.id, st.roll_number, st.full_name, st.exam_access_allowed_at AS access_at, st.login_claimed_at, st.login_at, st.marked_absent,
                ea.started_at, ea.submitted_at, ea.submit_reason, ea.ip_address, ht.seat_number, l.name AS lab_name
         FROM students st
         LEFT JOIN exam_attempts ea ON ea.student_id = st.id AND ea.exam_id = st.exam_id
         LEFT JOIN hall_tickets ht ON ht.student_id = st.id AND ht.exam_id = st.exam_id AND ht.status = 'generated'
         LEFT JOIN centre_labs l ON l.id = ht.seat_lab_id
         WHERE st.exam_id = $1`,
        [exam.id]
    );
    const byId = new Map(students.map((s) => [s.id, s]));
    const scheduled = getScheduledStart(exam);
    const rows = [];
    const add = (at, s, activity, detail = "") => {
        if (at) rows.push({ at: new Date(at), name: s ? s.full_name : "-", roll: s ? s.roll_number : "-", activity, detail });
    };

    for (const s of students) {
        if (s.access_at) {
            const lateMin = Math.round((new Date(s.access_at).getTime() - scheduled.getTime()) / 60000);
            const parts = [];
            if (s.seat_number) parts.push(`Seat ${s.seat_number}${s.lab_name ? ` (${s.lab_name})` : ""}`);
            if (lateMin > 0) parts.push(`Late entry (${lateMin} min after start)`);
            add(s.access_at, s, "Allowed at verification desk", parts.join(" | "));
        }
        add(s.login_claimed_at, s, "Roll number selected on login page");
        add(s.login_at, s, "Logged in", s.ip_address ? `IP ${s.ip_address}` : "");
        add(s.started_at, s, "Exam started", s.ip_address ? `IP ${s.ip_address}` : "");
        add(s.submitted_at, s, "Exam submitted", REASONS[s.submit_reason] || s.submit_reason || "");
    }

    const events = await query("SELECT * FROM exam_event_log WHERE exam_id = $1 ORDER BY occurred_at", [exam.id]);
    const LABEL = {
        desk_disallowed: "Disallowed at verification desk",
        revoked_absent: "Revoked - marked Absent",
        reappear_granted: "Reappear granted",
        exam_restarted: "Exam restarted (stopped on the spot)",
        device_restarted: "Device restarted",
        exam_started_by_admin: "Exam batch started",
        exam_stopped: "Exam batch stopped",
    };
    for (const e of events) {
        add(e.occurred_at, e.student_id ? byId.get(e.student_id) : null, LABEL[e.event_type] || e.event_type, e.detail || "");
    }

    // Candidate interaction events recorded by the app during the exam window.
    const from = new Date((exam.started_at ? new Date(exam.started_at) : scheduled).getTime() - 2 * 3600000);
    const to = new Date((exam.stopped_at ? new Date(exam.stopped_at) : new Date()).getTime() + 10 * 60000);
    const ids = students.map((s) => s.id);
    if (ids.length) {
        const audit = await query(
            `SELECT actor_id, event_type, page_path, target_label, key_action, occurred_at
             FROM activity_audit_logs
             WHERE actor_role = 'student' AND actor_id = ANY($1::int[]) AND occurred_at BETWEEN $2 AND $3
             ORDER BY occurred_at LIMIT 20000`,
            [ids, from, to]
        );
        for (const a of audit) {
            const s = byId.get(a.actor_id);
            if (a.event_type === "click") add(a.occurred_at, s, "Click", a.target_label || "");
            else if (a.event_type === "key_action") add(a.occurred_at, s, "Key action", a.key_action || "");
            else if (a.event_type === "navigation") add(a.occurred_at, s, "Page opened", a.page_path || "");
            else add(a.occurred_at, s, "Form submitted", a.target_label || "");
        }
    }

    // Every answer selected (or changed): who picked which option for which question, and when.
    const answers = await query(
        `SELECT al.student_id, al.question_no, al.selected_option, al.previous_option, al.synced, al.occurred_at, q.question_text
         FROM exam_answer_log al LEFT JOIN questions q ON q.id = al.question_id
         WHERE al.exam_id = $1 ORDER BY al.occurred_at`,
        [exam.id]
    );
    for (const a of answers) {
        const text = String(a.question_text || "").replace(/\s+/g, " ").slice(0, 70);
        const change = a.previous_option ? ` (changed from ${a.previous_option})` : "";
        add(
            a.occurred_at, byId.get(a.student_id), "Answer selected",
            `Q${a.question_no || "?"}: option ${a.selected_option}${change}${a.synced ? " [sent after reconnecting]" : ""}${text ? ` - ${text}` : ""}`
        );
    }

    rows.sort((x, y) => x.at - y.at);
    return rows;
}

const COLS = [
    { key: "at", label: "Date & Time", width: 125 },
    { key: "name", label: "Candidate Name", width: 135 },
    { key: "roll", label: "Roll No", width: 70 },
    { key: "activity", label: "Activity", width: 175 },
    { key: "detail", label: "Details", width: 277 },
];

async function buildActivityLogPdf(exam, rows) {
    const logo = await loadExamLogo(exam);
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
        const buffers = [];
        doc.on("data", (c) => buffers.push(c));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);
        applyWatermark(doc, logo);

        const x0 = doc.page.margins.left;
        const bottom = doc.page.height - doc.page.margins.bottom;
        const rowH = 16;
        const totalW = COLS.reduce((s, c) => s + c.width, 0);

        doc.fontSize(15).font("Helvetica-Bold").text("Joshi's Commerce Academy", { align: "center" });
        doc.fontSize(11).font("Helvetica").text("Exam Activity Log", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(9);
        doc.text(`Exam: ${exam.name}`);
        doc.text(`Exam date & time: ${fmtDate(exam.exam_date)}  ${String(exam.start_time).slice(0, 5)}   |   Venue: ${exam.centre_name || "-"}`);
        doc.text(`Exam batch started: ${fmt(exam.started_at)}   |   Stopped: ${fmt(exam.stopped_at)}`);
        doc.text(`Generated: ${fmt(new Date())}   |   Total entries: ${rows.length}`);
        doc.fontSize(8).fillColor("#666666").text("This log was generated on request for this download only. It is not stored or shown anywhere else.");
        doc.fillColor("#000000");
        doc.moveDown(0.5);

        const header = (y) => {
            doc.rect(x0, y, totalW, rowH + 2).fill("#eeeeee");
            doc.fillColor("#000000").font("Helvetica-Bold").fontSize(8.5);
            let cx = x0;
            for (const c of COLS) { doc.text(c.label, cx + 3, y + 5, { width: c.width - 6, lineBreak: false }); cx += c.width; }
            return y + rowH + 2;
        };
        let y = header(doc.y);
        doc.font("Helvetica").fontSize(7.5);
        if (!rows.length) doc.text("No activity recorded for this exam batch.", x0 + 3, y + 5);

        rows.forEach((r, i) => {
            if (y + rowH > bottom) {
                doc.addPage();
                y = header(doc.page.margins.top);
                doc.font("Helvetica").fontSize(7.5);
            }
            if (i % 2) doc.rect(x0, y, totalW, rowH).fill("#fafafa");
            doc.fillColor("#000000");
            const vals = { at: fmt(r.at), name: r.name, roll: r.roll, activity: r.activity, detail: r.detail };
            let cx = x0;
            for (const c of COLS) {
                doc.text(String(vals[c.key] ?? ""), cx + 3, y + 4.5, { width: c.width - 6, height: rowH - 4, lineBreak: false, ellipsis: true });
                cx += c.width;
            }
            y += rowH;
        });
        doc.end();
    });
}

module.exports = { buildActivityLogPdf, collectActivityRows };
