export interface Centre {
  id: number
  name: string
  code: string
  address: string
  city: string | null
  status: "active" | "inactive"
  created_at: string
}

export interface Standard {
  id: number
  name: string
  code: string
  description: string
  status: "active" | "inactive"
}

export interface Exam {
  id: number
  name: string
  standard_id: number
  standard_name: string
  centre_id: number
  centre_name: string
  exam_date: string
  start_time: string
  duration_minutes: number
  question_count: number
  question_count_actual: number
  candidate_count: number
  login_window_minutes: number
  grace_period_minutes: number
  show_provisional_result: boolean
  compensate_late_login: boolean
  passing_percentage: string
  status: "upcoming" | "ongoing" | "completed" | "cancelled"
  notes: string | null
  started_at: string | null
  access_password: string | null
  negative_marking: boolean
  seat_number_required: boolean
  logo_url: string | null
}

export interface Student {
  id: number
  roll_number: string | null
  student_code: string | null
  full_name: string
  email: string
  phone: string
  dob: string
  gender: string | null
  address: string | null
  centre_id: number
  centre_name: string
  standard_id: number | null
  standard_name: string | null
  exam_id: number | null
  exam_name: string | null
  photo_url: string | null
  signature_url: string | null
  status: "pending" | "allowed"
  checked_in_at: string | null
  created_at: string
}

export interface QuestionBank {
  id: number
  name: string
  standard_id: number
  standard_name: string
  subject: string | null
  description: string | null
  status: "draft" | "published"
  question_count: number
}

export interface Question {
  id: number
  bank_id: number
  bank_name: string
  subject: string | null
  standard_name: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: "A" | "B" | "C" | "D"
  marks: number
  difficulty: "easy" | "medium" | "hard"
  status: "draft" | "published"
  explanation: string | null
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

export interface ExamResult {
  id: number
  student_id: number
  exam_id: number
  roll_number: string
  student_name: string
  centre_name: string
  standard_name: string
  exam_name: string
  total_questions: number
  correct_count: number
  wrong_count: number
  unanswered_count: number
  marks_obtained: string
  total_marks: string
  percentage: string
  result_status: "passed" | "failed"
  submitted_at: string
  started_at: string
  submit_reason: string
  result_sent_at: string | null
  subjects?: SubjectBreakdown[]
}

export interface HallTicket {
  id: number
  student_id: number
  exam_id: number
  hall_ticket_number: string
  roll_number: string
  student_name: string
  email: string
  photo_url: string | null
  standard_name: string
  exam_name: string
  exam_date: string
  start_time: string
  duration_minutes: number
  centre_name: string
  venue: string
  seat_number: string | null
  status: "generated" | "revoked"
  email_sent_at: string | null
}

export interface DashboardStats {
  totalStudents: number
  allowedStudents: number
  pendingStudents: number
  totalQuestions: number
  totalExams: number
  totalResults: number
  averagePercentage: string
  recentStudents: { id: number; roll_number: string; full_name: string; status: string; created_at: string }[]
  upcomingExams: { id: number; name: string; exam_date: string; start_time: string; status: string }[]
}

export interface AttendanceRow {
  id: number
  roll_number: string
  full_name: string
  centre_name: string | null
  standard_name: string | null
  checked_in_at: string | null
  started_at: string | null
  submitted_at: string | null
  attempt_status: "in_progress" | "submitted" | null
}

export interface MonitorCandidate {
  id: number
  roll_number: string
  full_name: string
  centre_name: string | null
  standard_name: string | null
  checked_in_at: string
  started_at: string | null
  ends_at: string | null
  attempt_status: "in_progress" | "submitted" | null
  submitted_at: string | null
  submit_reason: "manual" | "timeout" | "tab_switch" | "devtools" | "fullscreen_exit" | null
  answered_count: number
  ip_address: string | null
}

export interface MonitorData {
  exam: {
    id: number
    name: string
    examDate: string
    startTime: string
    durationMinutes: number
    questionCount: number
    status: string
  }
  candidates: MonitorCandidate[]
}

export interface QuestionDifficulty {
  id: number
  questionText: string
  subject: string | null
  marks: number
  attemptedCount: number
  correctCount: number
  wrongCount: number
  correctRate: number | null
  difficulty: "easy" | "medium" | "hard" | "unattempted"
}

export interface WeakSubject {
  subject: string
  attempted: number
  correctRate: number | null
}

export interface ExamAnalytics {
  exam: { id: number; name: string }
  summary: {
    participantCount: number
    avgPercentage: number | null
    medianPercentage: number | null
    highestPercentage: number | null
    lowestPercentage: number | null
    passRate: number | null
  }
  questionDifficulty: QuestionDifficulty[]
  weakSubjects: WeakSubject[]
}

export interface BatchAnalytics {
  standardId: number
  standardName: string
  attemptCount: number
  avgPercentage: number | null
  passRate: number | null
}

export interface ReappearRequest {
  id: number
  student_id: number
  exam_id: number
  roll_number: string
  student_name: string
  exam_name: string
  reason: string | null
  remaining_minutes: number | null
  status: "pending" | "completed"
  created_at: string
  completed_at: string | null
}

export interface AppSettings {
  id: number
  seat_number_enabled: boolean
  ip_capture_enabled: boolean
  registration_alert_enabled: boolean
  student_login_enabled: boolean
  max_security_warnings: number
  disable_copy_enabled: boolean
  updated_at: string
}

export interface ReappearEligibleCandidate {
  id: number
  roll_number: string
  full_name: string
  attempt_id: number
  started_at: string
  ends_at: string
  answered_count: number
  last_activity_at: string | null
  detected_remaining_minutes: number
  window_expired: boolean
}
