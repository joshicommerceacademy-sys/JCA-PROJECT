import axios from "axios"

export const api = axios.create({ baseURL: "/api" })

api.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem("jca_admin_token")
  const studentToken = localStorage.getItem("jca_student_token")
  const token = config.url?.startsWith("/admin") ? adminToken : studentToken
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
