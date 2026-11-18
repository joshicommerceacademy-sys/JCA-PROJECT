import axios from "axios"

export const api = axios.create({ baseURL: "/api" })

api.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem("jca_admin_token")
  const studentToken = localStorage.getItem("jca_student_token")
  // The Verification Desk reuses the /admin verification endpoints with its own exam-scoped token.
  const deskToken = window.location.pathname.startsWith("/desk") ? localStorage.getItem("jca_desk_token") : null
  const url = config.url || ""
  const token = url.startsWith("/admin") ? (deskToken || adminToken) : url.startsWith("/desk") ? localStorage.getItem("jca_desk_token") : studentToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface ApiErrorShape {
  status: "error"
  message: string
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorShape | undefined
    return data?.message || error.message
  }
  if (error instanceof Error) return error.message
  return "Something went wrong"
}
