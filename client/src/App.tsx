import * as React from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { deliverPendingSubmit } from "@/lib/pendingSubmit"
import Home from "@/pages/Home"
import AdminLogin from "@/pages/admin/AdminLogin"
import Dashboard from "@/pages/admin/Dashboard"
import LiveExam from "@/pages/admin/LiveExam"
import StopExam from "@/pages/admin/StopExam"
import Students from "@/pages/admin/Students"
import StudentRegistration from "@/pages/student/StudentRegistration"
import ResultExams from "@/pages/student/ResultExams"
import ResultView from "@/pages/student/ResultView"
import StudentTrack from "@/pages/student/StudentTrack"
import DeskLogin from "@/pages/desk/DeskLogin"
import DeskVerification from "@/pages/desk/DeskVerification"
import DeskBatch from "@/pages/desk/DeskBatch"
import DeskCandidates from "@/pages/desk/DeskCandidates"
import Centres from "@/pages/admin/Centres"
import Standards from "@/pages/admin/Standards"
import Exams from "@/pages/admin/Exams"
import Questions from "@/pages/admin/Questions"
import Results from "@/pages/admin/Results"
import Reports from "@/pages/admin/Reports"
import HallTickets from "@/pages/admin/HallTickets"
import GenerateHallTickets from "@/pages/admin/GenerateHallTickets"
import Attendance from "@/pages/admin/Attendance"
import LiveMonitor from "@/pages/admin/LiveMonitor"
import Analytics from "@/pages/admin/Analytics"
import Reappear from "@/pages/admin/Reappear"
import Settings from "@/pages/admin/Settings"
import StudentLogin from "@/pages/student/StudentLogin"
import StudentLoginRoll from "@/pages/student/StudentLoginRoll"
import StudentLoginPassword from "@/pages/student/StudentLoginPassword"
import StudentInstructions from "@/pages/student/StudentInstructions"
import StudentExamSummary from "@/pages/student/StudentExamSummary"
import StudentExam from "@/pages/student/StudentExam"
import StudentResult from "@/pages/student/StudentResult"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { ProtectedAdminRoute, ProtectedStudentRoute } from "@/components/layout/ProtectedRoute"

function App() {
  // A finished exam that could not be sent (no internet) is retried in the background on every
  // page of the app, so the result still reaches the admin once the computer is online again.
  React.useEffect(() => {
    const run = () => { deliverPendingSubmit() }
    run()
    const id = setInterval(run, 10000)
    window.addEventListener("online", run)
    return () => { clearInterval(id); window.removeEventListener("online", run) }
  }, [])
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route element={<ProtectedAdminRoute />}>
        <Route path="/admin/live-exam/:examId/stop" element={<StopExam />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="/admin/live-exam/:examId" element={<LiveExam />} />
          <Route path="/admin/students" element={<Students />} />
                    <Route path="/admin/centres" element={<Centres />} />
          <Route path="/admin/standards" element={<Standards />} />
          <Route path="/admin/exams" element={<Exams />} />
          <Route path="/admin/questions" element={<Questions />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/results" element={<Results />} />
          <Route path="/admin/hall-tickets" element={<HallTickets />} />
          <Route path="/admin/generate-hall-tickets" element={<GenerateHallTickets />} />
          <Route path="/admin/attendance" element={<Attendance />} />
          <Route path="/admin/live-monitor" element={<LiveMonitor />} />
          <Route path="/admin/analytics" element={<Analytics />} />
          <Route path="/admin/reappear" element={<Reappear />} />
          <Route path="/admin/settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="/student/register" element={<StudentRegistration />} />
      <Route path="/results" element={<ResultExams />} />
      <Route path="/results/:examId" element={<ResultView />} />
      <Route path="/student/track" element={<StudentTrack />} />
      <Route path="/student/track/:applicationId" element={<StudentTrack />} />
      <Route path="/student/registered" element={<Navigate to="/student/track" replace />} />
      <Route path="/desk/login" element={<DeskLogin />} />
      <Route path="/desk/batch" element={<DeskBatch />} />
      <Route path="/desk" element={<DeskVerification />} />
      <Route path="/desk/candidates" element={<DeskCandidates />} />
      <Route path="/student/login" element={<StudentLogin />} />
      <Route path="/student/login/roll" element={<StudentLoginRoll />} />
      <Route path="/student/login/password" element={<StudentLoginPassword />} />
      <Route element={<ProtectedStudentRoute />}>
        <Route path="/student/instructions" element={<StudentInstructions />} />
        <Route path="/student/exam-summary" element={<StudentExamSummary />} />
        <Route path="/student/exam" element={<StudentExam />} />
        <Route path="/student/result" element={<StudentResult />} />
      </Route>
    </Routes>
  )
}

export default App
