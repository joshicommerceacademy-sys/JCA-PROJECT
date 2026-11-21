import { api } from "./client"
import type {
  Centre, Standard, Exam, Student, QuestionBank, Question, ExamResult, HallTicket, DashboardStats,
  AttendanceRow, ReappearRequest, ReappearEligibleCandidate, MonitorData, ExamAnalytics, BatchAnalytics,
  AppSettings, CentreLab, RegisteredExam,
} from "./types"

const unwrap = <T,>(promise: Promise<{ data: { data: T } }>) => promise.then((res) => res.data.data)

export const adminApi = {
  dashboardStats: () => unwrap<DashboardStats>(api.get("/admin/dashboard/stats")),

  centres: {
    list: () => unwrap<Centre[]>(api.get("/admin/centres")),
    create: (body: Partial<Centre>) => unwrap<Centre>(api.post("/admin/centres", body)),
    update: (id: number, body: Partial<Centre>) => unwrap<Centre>(api.put(`/admin/centres/${id}`, body)),
    remove: (id: number) => api.delete(`/admin/centres/${id}`),
    addLab: (centreId: number, body: { name: string; capacity: number }) =>
      unwrap<CentreLab>(api.post(`/admin/centres/${centreId}/labs`, body)),
    updateLab: (labId: number, body: { name: string; capacity: number }) =>
      unwrap<CentreLab>(api.put(`/admin/centres/labs/${labId}`, body)),
    removeLab: (labId: number) => api.delete(`/admin/centres/labs/${labId}`),
    addSeats: (labId: number, seatNumbers: string) => api.post(`/admin/centres/labs/${labId}/seats`, { seatNumbers }),
    removeSeat: (labId: number, seat: string) => api.delete(`/admin/centres/labs/${labId}/seats/${encodeURIComponent(seat)}`),
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
    assignSlot: (id: number, examId: number) => unwrap<{ emailed: boolean }>(api.put(`/admin/students/${id}/assign-slot`, { examId })),
    deskAllow: (id: number) =>
      unwrap<{ rollNumber: string | null; seatNumber: string | null; labName: string | null }>(api.put(`/admin/students/${id}/desk-allow`)),
    deskDisallow: (id: number, reason: string) => api.put(`/admin/students/${id}/desk-disallow`, { reason }),
    deskReappear: (id: number) => api.put(`/admin/students/${id}/desk-reappear`),
    // Verify All / Revoke All for one batch (slot).
    deskVerifyAll: (slotId: number) =>
      unwrap<{ allowed: number; failed: { rollNumber: string; error: string }[] }>(api.put("/admin/students/desk-verify-all", { slotId })),
    deskRevokeAll: (slotId: number) => unwrap<{ revoked: number }>(api.put("/admin/students/desk-revoke-all", { slotId })),
    uploadLivePhoto: (id: number, blob: Blob) => {
      const fd = new FormData()
      fd.append("photo", blob, "live.jpg")
      return api.put(`/admin/students/${id}/live-photo`, fd)
    },
    verify: (studentIds: number[]) =>
      unwrap<{ verified: number; ticketsIssued: number; emailed: number; emailFailed: { studentId: number; error: string }[] }>(
        api.post("/admin/students/verify", { studentIds })
      ),
    allow: (id: number, seatNumber?: string) =>
      unwrap<{ rollNumber: string; seatNumber: string | null }>(api.put(`/admin/students/${id}/allow`, { seatNumber })),
    disallow: (id: number) => api.put(`/admin/students/${id}/disallow`),
    allowExam: (id: number) => unwrap<{ exam_access_allowed_at: string }>(api.put(`/admin/students/${id}/exam-allow`)),
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

  registeredExams: {
    list: () => unwrap<RegisteredExam[]>(api.get("/admin/registered-exams")),
    create: (name: string) => unwrap<RegisteredExam>(api.post("/admin/registered-exams", { name })),
    remove: (id: number) => api.delete(`/admin/registered-exams/${id}`),
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
    // Built on the fly for this download only; nothing is stored. Available after the batch is stopped.
    downloadActivityLog: (id: number) =>
      api.get(`/admin/exams/${id}/activity-log-pdf`, { responseType: "blob" }),
    downloadAttendanceSheet: (id: number) =>
      api.get(`/admin/exams/${id}/attendance-sheet`, { responseType: "blob" }),
    start: (id: number) => unwrap<Exam>(api.put(`/admin/exams/${id}/start`)),
    stop: (id: number, password: string) => api.post(`/admin/exams/${id}/stop`, { password }),
    setSections: (id: number, sections: Record<string, unknown>[]) => api.post(`/admin/exams/${id}/sections`, { sections }),
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
    // Enable / disable an exam's results on the public Results page (all its batches at once).
    setExamVisibility: (examIds: number[], enabled: boolean, includePdf: boolean) =>
      api.post("/admin/results/exam-visibility", { examIds, enabled, includePdf }),
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
    restart: (studentId: number) => api.post("/admin/monitor/restart", { studentId }),
    deskReport: () =>
      unwrap<{
        exams: {
          examId: number; name: string; examDate: string; startTime: string; stopped: boolean
          status: "logged_in" | "active" | "inactive"
          logins: { userId: string; centreName: string | null; status: "logged_in" | "active" | "inactive"; lastLoginAt: string | null; lastSeenAt: string | null }[]
        }[]
      }>(api.get("/admin/monitor/desk-report")),
    // Verification Desk report of one exam, as a PDF (built on the fly).
    deskReportPdf: (examId: number) =>
      api.get("/admin/monitor/desk-report-pdf", { params: { examId }, responseType: "blob" }),
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
    createBatch: (body: { examId: number; reason?: string }) =>
      unwrap<{ grantedCount: number; skippedCount: number; granted: { id: number; studentId: number; remainingMinutes: number }[] }>(api.post("/admin/reappear/batch", body)),
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
          | "registration_link_enabled"
          | "result_link_enabled"
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
          registrationLinkEnabled: body.registration_link_enabled,
          resultLinkEnabled: body.result_link_enabled,
        })
      ),
    deviceExams: () => unwrap<{ key: string; name: string; id: number; batches: number }[]>(api.get("/admin/settings/devices/exams")),
    devices: (examId: number) =>
      unwrap<{
        examName: string
        candidates: { id: number; roll_number: string; full_name: string; last_ip: string | null; last_ip_at: string | null; pending_command: string | null; attempt_status: string | null; last_seen_at: string | null }[]
      }>(api.get("/admin/settings/devices", { params: { examId } })),
    restartDevice: (studentId: number) => api.post(`/admin/settings/devices/${studentId}/restart`),
    changePassword: (body: { currentPassword: string; newPassword: string; confirmNewPassword: string }) =>
      api.put("/admin/settings/password", body),
  },
}
