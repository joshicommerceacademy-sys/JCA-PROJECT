import { api } from "./client"

const unwrap = <T,>(promise: Promise<{ data: { data: T } }>) => promise.then((res) => res.data.data)

export interface StudentInstructions {
  student: { rollNumber: string; fullName: string; photoUrl: string | null; centreName: string; standardName: string }
  exam: { id: number; name: string; examDate: string; startTime: string; durationMinutes: number }
  sections: { label: string; questionCount: number }[]
  totalQuestions: number
  resuming: boolean
  remainingMinutes: number | null
  answeredCount: number | null
}

export interface AttemptQuestion {
  id: number
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  marks: number
}

export interface AttemptSection {
  id: number
  label: string
  questions: AttemptQuestion[]
}

export interface AttemptStart {
  attemptId: number
  startedAt: string
  endsAt: string
  exam: { id: number; name: string; durationMinutes: number; logoUrl: string | null }
  student: { rollNumber: string; fullName: string; photoUrl: string | null }
  sections: AttemptSection[]
  answers: Record<number, "A" | "B" | "C" | "D">
  security: { maxWarnings: number; disableCopyEnabled: boolean }
}

export interface SubjectBreakdown {
  label: string
  correctCount: number
  wrongCount: number
  unansweredCount: number
  marksObtained: number
  totalMarks: number
  percentage: number
}

export interface AttemptResult {
  id: number
  exam_name: string
  total_questions: number
  correct_count: number
  wrong_count: number
  unanswered_count: number
  marks_obtained: string
  total_marks: string
  percentage: string
  result_status: "passed" | "failed"
  started_at: string
  submitted_at: string
  submit_reason: string
  show_provisional_result: boolean
  subjects: SubjectBreakdown[]
}

export interface LoginCandidate {
  rollNumber: string
}

export interface LoginExam {
  id: number
  name: string
  examDate: string
  startTime: string
  durationMinutes: number
  centreName: string | null
  centreCity: string | null
}

export const studentApi = {
  loginExams: () => unwrap<LoginExam[]>(api.get("/student/login/exams")),
  loginCandidates: (examId?: string) =>
    unwrap<LoginCandidate[]>(api.get("/student/login/candidates", { params: examId ? { examId } : undefined })),
  verifyExamAccess: (examId: string, password: string) =>
    api.post("/student/login/exam-access", { examId, password }),
  // Reveals a started exam's access password so the gate above the roll-number list can be
  // auto-filled once a student picks that exam, instead of typed in.
  examAccessPassword: (examId: string) =>
    unwrap<{ accessPassword: string }>(api.get("/student/login/exam-password", { params: { examId } })),
  instructions: () => unwrap<StudentInstructions>(api.get("/student/instructions")),
  startAttempt: () => unwrap<AttemptStart>(api.post("/student/attempt/start")),
  saveAnswer: (questionId: number, selectedOption: string) =>
    api.put("/student/attempt/answer", { questionId, selectedOption }),
  submitAttempt: (reason: string) => unwrap<AttemptResult>(api.post("/student/attempt/submit", { reason })),
  getResult: () => unwrap<AttemptResult>(api.get("/student/result")),
}
