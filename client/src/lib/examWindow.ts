export interface ExamWindowInput {
  exam_date: string
  start_time: string
  duration_minutes: number
  login_window_minutes?: number | null
}

const INDIA_OFFSET = "+05:30"

function datePart(value: string) {
  // PostgreSQL DATE is serialized as YYYY-MM-DD. Never turn a calendar date into
  // a browser-local Date first, because that can shift the displayed day.
  return value.slice(0, 10)
}

function timePart(value: string) {
  const text = String(value || "00:00:00")
  return text.length >= 8 ? text.slice(0, 8) : `${text}:00`.slice(0, 8)
}

export function getExamWindow(exam: ExamWindowInput) {
  // Scheduled exam time is always IST (Asia/Kolkata), independent of browser timezone.
  const start = new Date(`${datePart(exam.exam_date)}T${timePart(exam.start_time)}${INDIA_OFFSET}`)
  const loginWindowMinutes = exam.login_window_minutes ?? 30
  const loginStart = new Date(start.getTime() - loginWindowMinutes * 60000)
  const examEnd = new Date(start.getTime() + exam.duration_minutes * 60000)
  return { start, loginStart, examEnd }
}

export type LiveWindowState = "upcoming" | "live" | "ended"

export function getLiveWindowState(exam: ExamWindowInput, now: number = Date.now()): LiveWindowState {
  const { loginStart, examEnd } = getExamWindow(exam)
  if (now < loginStart.getTime()) return "upcoming"
  if (now >= examEnd.getTime()) return "ended"
  return "live"
}
