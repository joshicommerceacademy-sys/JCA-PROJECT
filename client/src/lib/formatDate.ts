// Unambiguous day-month-year formatting (the month spelled out) used everywhere a date
// appears in the admin/student UI, instead of the browser's default en-US M/D/YYYY
// (e.g. "8/26/2026"), which reads as day/month to most of this app's audience.

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  })
}

// Same as formatDateTime but with seconds — used where the exact moment matters (e.g. the
// attendance log's access-granted / login timestamps).
export function formatDateTimeWithSeconds(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  })
}
