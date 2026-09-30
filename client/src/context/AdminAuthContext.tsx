import * as React from "react"
import { api, getErrorMessage } from "@/api/client"

interface AdminUser {
  id: number
  email: string
  fullName: string
}

interface AdminAuthState {
  admin: AdminUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AdminAuthContext = React.createContext<AdminAuthState | undefined>(undefined)

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = React.useState<AdminUser | null>(() => {
    const raw = localStorage.getItem("jca_admin_user")
    return raw ? JSON.parse(raw) : null
  })
  const [isLoading, setIsLoading] = React.useState(false)

  const login = React.useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const res = await api.post("/admin/login", { email, password })
      const { token, admin: adminData } = res.data.data
      localStorage.setItem("jca_admin_token", token)
      localStorage.setItem("jca_admin_user", JSON.stringify(adminData))
      setAdmin(adminData)
    } catch (error) {
      throw new Error(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = React.useCallback(() => {
    localStorage.removeItem("jca_admin_token")
    localStorage.removeItem("jca_admin_user")
    setAdmin(null)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ admin, isLoading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = React.useContext(AdminAuthContext)
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider")
  return ctx
}
