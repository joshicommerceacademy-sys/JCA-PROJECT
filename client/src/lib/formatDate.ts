function isCalendarDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}(?:$|T00:00:00(?:\.\d+)?Z?$)/.test(value)
}

export function formatDate(value: string | Date): string {
  if (typeof value === "string" && isCalendarDate(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number)
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)))
  }
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Asia/Kolkata",
  })
}

export function formatDateTimeWithSeconds(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    timeZone: "Asia/Kolkata",
  })
}
