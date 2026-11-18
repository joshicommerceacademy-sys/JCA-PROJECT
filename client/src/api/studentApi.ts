import { api } from "./client"

const unwrap = <T,>(promise: Promise<{ data: { data: T } }>) => promise.then((res) => res.data.data)

export interface StudentInstructions {
  student: { rollNumber: string; fullName: string; photoUrl: string | null; centreName: string; standardName: string }
  exam: {
    id: number; name: string; examDate: string; startTime: string; durationMinutes: number; logoUrl?: string | null
    submitButtonAfterMinutes: number; compensateLateLogin: boolean
  }
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
  exam: { id: number; name: string; durationMinutes: number; logoUrl: string | null; showPhotoSignature?: boolean; submitButtonAfterMinutes: number }
  student: { rollNumber: string; fullName: string; photoUrl: string | null; signatureUrl?: string | null; centreName?: string | null; centreCode?: string | null }
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
  standardName?: string | null
}

export interface LoginExam {
  id: number
  name: string
  examDate: string
  startTime: string
  durationMinutes: number
  submitButtonAfterMinutes: number
  compensateLateLogin: boolean
  centreName: string | null
  centreCity: string | null
  logoUrl?: string | null
}

export const studentApi = {
  loginExams: () => unwrap<LoginExam[]>(api.get("/student/login/exams")),
  loginCandidates: (examId?: string) =>
    unwrap<LoginCandidate[]>(api.get("/student/login/candidates", { params: examId ? { examId } : undefined })),
  candidateName: (examId: string, rollNumber: string) =>
    unwrap<{ fullName: string }>(api.get("/student/login/candidate-name", { params: { examId, rollNumber } })),
  examStatus: (examId: string) =>
    unwrap<{ questionBankActive: boolean }>(api.get("/student/login/exam-status", { params: { examId } })),
  verifyExamAccess: (examId: string, password: string) =>
    api.post("/student/login/exam-access", { examId, password }),
  // Reveals a started exam's access password so the gate above the roll-number list can be
  // auto-filled once a student picks that exam, instead of typed in.
  examAccessPassword: (examId: string) =>
    unwrap<{ accessPassword: string }>(api.get("/student/login/exam-password", { params: { examId } })),
  verifyExamPassword: (password: string) => api.post("/student/verify-exam-password", { password }),
  instructions: () => unwrap<StudentInstructions>(api.get("/student/instructions")),
  startAttempt: () => unwrap<AttemptStart>(api.post("/student/attempt/start")),
  saveAnswer: (questionId: number, selectedOption: string) =>
    api.put("/student/attempt/answer", { questionId, selectedOption }),
  // Pushes answers that were recorded while the connection was down.
  syncAnswers: (answers: Record<number, string>) => api.put("/student/attempt/answers", { answers }),
  // Every answer held on the device goes in with the submit, so nothing recorded offline is lost.
  submitAttempt: (reason: string, answers?: Record<number, string>) =>
    unwrap<AttemptResult>(api.post("/student/attempt/submit", { reason, answers })),
  // Selecting + submitting a roll number claims it; throws a 409 (ROLL_ALREADY_SELECTED) if taken.
  claimRoll: (examId: string, rollNumber: string, sessionId: string) =>
    unwrap<{ rollNumber: string; claimedAt: string }>(api.post("/student/login/claim", { examId, rollNumber, sessionId })),
  getResult: () => unwrap<AttemptResult>(api.get("/student/result")),
}
