// One date format for every PDF (and e-mail): DD-MM-YYYY, times in Indian Standard Time.

// A calendar date (exam_date from a DATE column, or "YYYY-MM-DD"): no time-zone shift.
function fmtDate(value) {
    if (!value) return "-";
    let y, m, d;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        [y, m, d] = value.slice(0, 10).split("-");
    } else {
        const iso = new Date(value).toISOString();
        [y, m, d] = iso.slice(0, 10).split("-");
    }
    return `${d}-${m}-${y}`;
}

// A moment in time -> "DD-MM-YYYY hh:mm:ss am" (IST).
function fmtDateTime(value, withSeconds = true) {
    if (!value) return "-";
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}), hour12: true,
    }).formatToParts(new Date(value));
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    const time = `${get("hour")}:${get("minute")}${withSeconds ? `:${get("second")}` : ""} ${get("dayPeriod").toLowerCase()}`;
    return `${get("day")}-${get("month")}-${get("year")} ${time}`;
}

module.exports = { fmtDate, fmtDateTime };
