import * as React from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { Exam } from "@/api/types"
import Verification from "@/pages/admin/Verification"

// Exam-scoped Verification Desk - signed in via /desk/login, no admin access.
export default function DeskVerification() {
  const navigate = useNavigate()
  const stored = React.useMemo<Exam | null>(() => {
    try {
      const raw = localStorage.getItem("jca_desk_exam")
      return localStorage.getItem("jca_desk_token") && raw ? (JSON.parse(raw) as Exam) : null
    } catch {
      return null
    }
  }, [])

  // Seating Arrangement / Live Photo Capture can change after sign-in, so always read them fresh.
  const { data: fresh } = useQuery({
    queryKey: ["desk-exam"],
    queryFn: async () => (await api.get("/desk/login/exam")).data.data as Exam,
    enabled: !!stored,
    refetchInterval: 20000,
  })

  const operator = localStorage.getItem("jca_desk_operator")
  const [slotId, setSlotId] = React.useState<string | null>(() => localStorage.getItem("jca_desk_slot"))

  if (!stored) return <Navigate to="/desk/login" replace />
  if (!operator) return <Navigate to="/desk/login" replace />

  function logout() {
    ;["jca_desk_token", "jca_desk_exam", "jca_desk_operator", "jca_desk_slot"].forEach((k) => localStorage.removeItem(k))
    navigate("/desk/login", { replace: true })
  }

  return (
    <div className="mx-auto min-h-svh max-w-5xl bg-background p-4 sm:p-6">
      <Verification exam={{ ...stored, ...(fresh || {}) }} onExit={logout} operator={operator} slotId={slotId} onSelectSlot={setSlotId} />
    </div>
  )
}
