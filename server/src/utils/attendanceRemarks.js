const { getScheduledStart } = require("./examWindow");

// Remarks / Action shown on the Attendance page and in the Attendance Report PDF.
//  - Remarks: everything noteworthy (Absent, Late entry, time over, ...).
//    "Late entry" is only ever produced here - it is an attendance-record remark and is not shown
//    on the results, monitor or desk screens.
//  - Action: only for the security cases (tab switch / left full screen / developer tools), where
//    the system auto-submitted the exam.
const SECURITY = {
    tab_switch: "Tab switched during the exam",
    fullscreen_exit: "Left full screen during the exam",
    devtools: "Developer tools opened during the exam",
};

function attendanceRemarks(row) {
    const remarks = [];
    let action = null;

    if (row.absent) remarks.push("Absent");

    if (row.access_at && row.exam_date && row.start_time) {
        const start = getScheduledStart({ exam_date: row.exam_date, start_time: row.start_time });
        const lateMs = new Date(row.access_at).getTime() - start.getTime();
        // The candidate was permitted to join (allowed at the Verification Desk) after the
        // scheduled start time.
        if (lateMs > 0) remarks.push(`Late entry (${Math.max(1, Math.round(lateMs / 60000))} min after start)`);
    }

    if (SECURITY[row.submit_reason]) {
        remarks.push(SECURITY[row.submit_reason]);
        action = "Exam auto-submitted";
    } else if (row.submit_reason === "timeout") {
        remarks.push("Time over - auto-submitted");
    }

    return { remarks: remarks.join("; "), action };
}

module.exports = { attendanceRemarks };
