import * as React from "react"
import { api, getErrorMessage } from "@/api/client"
import { getLoginSessionId } from "@/lib/loginSession"

interface StudentUser {
  id: number
  rollNumber: string
  fullName: string
  photoUrl: string | null
}

interface StudentAuthState {
  student: StudentUser | null
  isLoading: boolean
  login: (rollNumber: string, password: string) => Promise<void>
  logout: () => void
}

const StudentAuthContext = React.createContext<StudentAuthState | undefined>(undefined)

export function StudentAuthProvider({ children }: { children: React.ReactNode }) {
  const [student, setStudent] = React.useState<StudentUser | null>(() => {
    const raw = localStorage.getItem("jca_student_user")
    return raw ? JSON.parse(raw) : null
  })
  const [isLoading, setIsLoading] = React.useState(false)

  const login = React.useCallback(async (rollNumber: string, password: string) => {
    setIsLoading(true)
    try {
      const res = await api.post("/student/login", { rollNumber, password, sessionId: getLoginSessionId() })
      const { token, student: studentData } = res.data.data
      localStorage.setItem("jca_student_token", token)
      localStorage.setItem("jca_student_user", JSON.stringify(studentData))
      setStudent(studentData)
    } catch (error) {
      const err = new Error(getErrorMessage(error)) as Error & { code?: string }
      err.code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Closing or reloading the page ends the candidate's session immediately: the stored login is
  // wiped, so getting back into the exam means signing in again (which resumes with the time
  // that is left — the server-side deadline never stops).
  React.useEffect(() => {
    const endSession = () => {
      localStorage.removeItem("jca_student_token")
      localStorage.removeItem("jca_student_user")
    }
    window.addEventListener("pagehide", endSession)
    return () => window.removeEventListener("pagehide", endSession)
  }, [])

  const logout = React.useCallback(() => {
    localStorage.removeItem("jca_student_token")
    localStorage.removeItem("jca_student_user")
    setStudent(null)
  }, [])

  return (
    <StudentAuthContext.Provider value={{ student, isLoading, login, logout }}>
      {children}
    </StudentAuthContext.Provider>
  )
}

export function useStudentAuth() {
  const ctx = React.useContext(StudentAuthContext)
  if (!ctx) throw new Error("useStudentAuth must be used within StudentAuthProvider")
  return ctx
}
