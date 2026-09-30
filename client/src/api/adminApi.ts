import { api } from "./client"
import type {
  Centre, Standard, Exam, Student, QuestionBank, Question, ExamResult, HallTicket, DashboardStats,
  AttendanceRow, ReappearRequest, ReappearEligibleCandidate, MonitorData, ExamAnalytics, BatchAnalytics,
  AppSettings,
} from "./types"

const unwrap = <T,>(promise: Promise<{ data: { data: T } }>) => promise.then((res) => res.data.data)

export const adminApi = {
  dashboardStats: () => unwrap<DashboardStats>(api.get("/admin/dashboard/stats")),

  centres: {
    list: () => unwrap<Centre[]>(api.get("/admin/centres")),
    create: (body: Partial<Centre>) => unwrap<Centre>(api.post("/admin/centres", body)),
    update: (id: number, body: Partial<Centre>) => unwrap<Centre>(api.put(`/admin/centres/${id}`, body)),
    remove: (id: number) => api.delete(`/admin/centres/${id}`),
  },

  standards: {
    list: () => unwrap<Standard[]>(api.get("/admin/standards")),
    create: (body: Partial<Standard>) => unwrap<Standard>(api.post("/admin/standards", body)),
    update: (id: number, body: Partial<Standard>) => unwrap<Standard>(api.put(`/admin/standards/${id}`, body)),
    remove: (id: number) => api.delete(`/admin/standards/${id}`),
  },

  students: {
    list: (params?: Record<string, string>) => unwrap<Student[]>(api.get("/admin/students", { params })),
    get: (id: number) => unwrap<Student>(api.get(`/admin/students/${id}`)),
    create: (formData: FormData) =>
      unwrap<Student & { defaultPassword: string }>(
        api.post("/admin/students", formData, { headers: { "Content-Type": "multipart/form-data" } })
      ),
    update: (id: number, formData: FormData) =>
      unwrap<Student>(api.put(`/admin/students/${id}`, formData, { headers: { "Content-Type": "multipart/form-data" } })),
    remove: (id: number) => api.delete(`/admin/students/${id}`),
    allow: (id: number, seatNumber?: string) =>
      unwrap<{ rollNumber: string; seatNumber: string | null }>(api.put(`/admin/students/${id}/allow`, { seatNumber })),
    disallow: (id: number) => api.put(`/admin/students/${id}/disallow`),
    bulkAllow: (studentIds: number[]) => api.post("/admin/students/bulk-allow", { studentIds }),
    bulkDisallow: (studentIds: number[]) => api.post("/admin/students/bulk-disallow", { studentIds }),
    checkIn: (id: number) => api.put(`/admin/students/${id}/check-in`),
    checkOut: (id: number) => api.put(`/admin/students/${id}/check-out`),
    bulkCheckIn: (studentIds: number[]) => api.post("/admin/students/bulk-check-in", { studentIds }),
    assignCode: (id: number) => unwrap<Student>(api.put(`/admin/students/${id}/assign-code`)),
  },

  questionBanks: {
    list: () => unwrap<QuestionBank[]>(api.get("/admin/question-banks")),
    create: (body: Partial<QuestionBank> & { standardId: number }) =>
      unwrap<QuestionBank>(api.post("/admin/question-banks", body)),
    update: (id: number, body: Partial<QuestionBank> & { standardId: number }) =>
      unwrap<QuestionBank>(api.put(`/admin/question-banks/${id}`, body)),
    remove: (id: number) => api.delete(`/admin/question-banks/${id}`),
  },

  questions: {
    list: (params?: Record<string, string>) => unwrap<Question[]>(api.get("/admin/questions", { params })),
    create: (body: Record<string, unknown>) => unwrap<Question>(api.post("/admin/questions", body)),
    update: (id: number, body: Record<string, unknown>) => unwrap<Question>(api.put(`/admin/questions/${id}`, body)),
    remove: (id: number) => api.delete(`/admin/questions/${id}`),
    bulkStatus: (questionIds: number[], status: "draft" | "published") =>
      api.post("/admin/questions/bulk-status", { questionIds, status }),
    bulkDelete: (questionIds: number[]) => api.post("/admin/questions/bulk-delete", { questionIds }),
    bulkImport: (bankId: number, rows: Record<string, unknown>[]) =>
      unwrap<{ createdCount: number; skipped: { row: number; reason: string }[] }>(
        api.post("/admin/questions/bulk-import", { bankId, rows })
      ),
  },

  exams: {
    list: (params?: Record<string, string>) => unwrap<Exam[]>(api.get("/admin/exams", { params })),
    get: (id: number) =>
      unwrap<Exam & { questions: Question[]; sections: { id: number; bank_id: number; subject_label: string; question_count: number; ordinal: number }[] }>(
        api.get(`/admin/exams/${id}`)
      ),
    create: (body: Record<string, unknown>) => unwrap<Exam>(api.post("/admin/exams", body)),
    update: (id: number, body: Record<string, unknown>) => unwrap<Exam>(api.put(`/admin/exams/${id}`, body)),
    updateStatus: (id: number, status: string) => unwrap<Exam>(api.put(`/admin/exams/${id}/status`, { status })),
    remove: (id: number) => api.delete(`/admin/exams/${id}`),
    downloadAttendanceSheet: (id: number) =>
      api.get(`/admin/exams/${id}/attendance-sheet`, { responseType: "blob" }),
    start: (id: number) => unwrap<Exam>(api.put(`/admin/exams/${id}/start`)),
    uploadLogo: (id: number, file: File) => {
      const formData = new FormData()
      formData.append("logo", file)
      return unwrap<Exam>(
        api.post(`/admin/exams/${id}/logo`, formData, { headers: { "Content-Type": "multipart/form-data" } })
      )
    },
  },

  results: {
    list: (params?: Record<string, string>) => unwrap<ExamResult[]>(api.get("/admin/results", { params })),
    get: (id: number) => unwrap<ExamResult & { answers: unknown[] }>(api.get(`/admin/results/${id}`)),
    remove: (id: number) => api.delete(`/admin/results/${id}`),
    downloadPdf: (id: number) => api.get(`/admin/results/${id}/pdf`, { responseType: "blob" }),
    send: (id: number, confirmPassword: string) => api.post(`/admin/results/${id}/send`, { confirmPassword }),
    bulkSend: (resultIds: number[], confirmPassword: string) =>
      unwrap<{
        sentCount: number
        failedCount: number
        failed: { resultId: number; studentName: string; email: string; error: string }[]
      }>(api.post("/admin/results/bulk-send", { resultIds, confirmPassword })),
  },

  attendance: {
    list: (params?: Record<string, string>) => unwrap<AttendanceRow[]>(api.get("/admin/attendance", { params })),
    downloadReport: (examId: string) =>
      api.get(`/admin/attendance/${examId}/report-pdf`, { responseType: "blob" }),
  },

  monitor: {
    get: (examId: string) => unwrap<MonitorData>(api.get("/admin/monitor", { params: { examId } })),
  },

  analytics: {
    exam: (examId: string) => unwrap<ExamAnalytics>(api.get(`/admin/analytics/exam/${examId}`)),
    batches: () => unwrap<BatchAnalytics[]>(api.get("/admin/analytics/batches")),
  },

  reappear: {
    list: (params?: Record<string, string>) => unwrap<ReappearRequest[]>(api.get("/admin/reappear", { params })),
    eligible: (examId: string) =>
      unwrap<ReappearEligibleCandidate[]>(api.get("/admin/reappear/eligible", { params: { examId } })),
    create: (body: { studentId: number; examId: number; reason?: string }) =>
      unwrap<{ id: number; remainingMinutes: number }>(api.post("/admin/reappear", body)),
    remove: (id: number) => api.delete(`/admin/reappear/${id}`),
  },

  hallTickets: {
    list: (params?: Record<string, string>) => unwrap<HallTicket[]>(api.get("/admin/hall-tickets", { params })),
    updateSeat: (id: number, seatNumber: string) =>
      unwrap<HallTicket>(api.put(`/admin/hall-tickets/${id}/seat`, { seatNumber })),
    send: (id: number, confirmPassword: string) => api.post(`/admin/hall-tickets/${id}/send`, { confirmPassword }),
    bulkSend: (ticketIds: number[], confirmPassword: string) =>
      unwrap<{
        sentCount: number
        failedCount: number
        failed: { ticketId: number; studentName: string; email: string; error: string }[]
      }>(api.post("/admin/hall-tickets/bulk-send", { ticketIds, confirmPassword })),
    generate: (body: { studentIds: number[]; standardId: string; examId: string }) =>
      unwrap<{
        created: { studentId: number; studentName: string; hallTicketId: number; rollNumber: string }[]
        skipped: { studentId: number; studentName?: string; reason: string }[]
      }>(api.post("/admin/hall-tickets/generate", body)),
  },

  settings: {
    get: () => unwrap<AppSettings>(api.get("/admin/settings")),
    update: (
      body: Partial<
        Pick<
          AppSettings,
          | "seat_number_enabled"
          | "ip_capture_enabled"
          | "registration_alert_enabled"
          | "student_login_enabled"
          | "max_security_warnings"
          | "disable_copy_enabled"
        >
      >
    ) =>
      unwrap<AppSettings>(
        api.put("/admin/settings", {
          seatNumberEnabled: body.seat_number_enabled,
          ipCaptureEnabled: body.ip_capture_enabled,
          registrationAlertEnabled: body.registration_alert_enabled,
          studentLoginEnabled: body.student_login_enabled,
          maxSecurityWarnings: body.max_security_warnings,
          disableCopyEnabled: body.disable_copy_enabled,
        })
      ),
    changePassword: (body: { currentPassword: string; newPassword: string; confirmNewPassword: string }) =>
      api.put("/admin/settings/password", body),
  },
}
