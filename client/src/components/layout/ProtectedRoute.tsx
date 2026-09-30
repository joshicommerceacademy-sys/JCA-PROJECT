import { Navigate, Outlet } from "react-router-dom"
import { useAdminAuth } from "@/context/AdminAuthContext"
import { useStudentAuth } from "@/context/StudentAuthContext"

export function ProtectedAdminRoute() {
  const { admin } = useAdminAuth()
  if (!admin) return <Navigate to="/admin/login" replace />
  return <Outlet />
}

export function ProtectedStudentRoute() {
  const { student } = useStudentAuth()
  if (!student) return <Navigate to="/student/login" replace />
  return <Outlet />
}
