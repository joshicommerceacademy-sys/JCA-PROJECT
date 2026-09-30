// Mirrors server/src/utils/examWindow.js. The API serializes the Postgres DATE column as a
// UTC-midnight ISO string, so `new Date(examDate)` read back with LOCAL getters (not the UTC
// ones) lands on the correct calendar date — same trick used in StudentInstructions.tsx.
export interface ExamWindowInput {
  exam_date: string
  start_time: string
  duration_minutes: number
  login_window_minutes?: number | null
}

export function getExamWindow(exam: ExamWindowInput) {
  const d = new Date(exam.exam_date)
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const start = new Date(`${dateStr}T${exam.start_time}`)
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
