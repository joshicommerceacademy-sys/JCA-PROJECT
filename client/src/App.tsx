import { Routes, Route } from "react-router-dom"
import Home from "@/pages/Home"
import AdminLogin from "@/pages/admin/AdminLogin"
import Dashboard from "@/pages/admin/Dashboard"
import Students from "@/pages/admin/Students"
import Verification from "@/pages/admin/Verification"
import Centres from "@/pages/admin/Centres"
import Standards from "@/pages/admin/Standards"
import Exams from "@/pages/admin/Exams"
import Questions from "@/pages/admin/Questions"
import Results from "@/pages/admin/Results"
import HallTickets from "@/pages/admin/HallTickets"
import GenerateHallTickets from "@/pages/admin/GenerateHallTickets"
import Attendance from "@/pages/admin/Attendance"
import LiveMonitor from "@/pages/admin/LiveMonitor"
import Analytics from "@/pages/admin/Analytics"
import Reappear from "@/pages/admin/Reappear"
import Settings from "@/pages/admin/Settings"
import StudentLogin from "@/pages/student/StudentLogin"
import StudentLoginRoll from "@/pages/student/StudentLoginRoll"
import StudentInstructions from "@/pages/student/StudentInstructions"
import StudentExamSummary from "@/pages/student/StudentExamSummary"
import StudentExam from "@/pages/student/StudentExam"
import StudentResult from "@/pages/student/StudentResult"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { ProtectedAdminRoute, ProtectedStudentRoute } from "@/components/layout/ProtectedRoute"

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route element={<ProtectedAdminRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="/admin/students" element={<Students />} />
          <Route path="/admin/verification" element={<Verification />} />
          <Route path="/admin/centres" element={<Centres />} />
          <Route path="/admin/standards" element={<Standards />} />
          <Route path="/admin/exams" element={<Exams />} />
          <Route path="/admin/questions" element={<Questions />} />
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

      <Route path="/student/login" element={<StudentLogin />} />
      <Route path="/student/login/roll" element={<StudentLoginRoll />} />
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
