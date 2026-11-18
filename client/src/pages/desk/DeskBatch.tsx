import { Navigate, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CalendarClock, LogOut } from "lucide-react"
import { api } from "@/api/client"
import type { Exam } from "@/api/types"
import { formatDate } from "@/lib/formatDate"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

// Step 3 of the Verification Desk sign-in: choose the batch (date & time) whose verification
// is starting. The next page lists the candidates of that batch who are still to be allowed.
export default function DeskBatch() {
  const navigate = useNavigate()
  const signedIn = !!localStorage.getItem("jca_desk_token")
  const operator = localStorage.getItem("jca_desk_operator")

  const { data: exam, isLoading } = useQuery({
    queryKey: ["desk-exam"],
    queryFn: async () => (await api.get("/desk/login/exam")).data.data as Exam,
    enabled: signedIn && !!operator,
  })

  if (!signedIn) return <Navigate to="/desk/login" replace />
  if (!operator) return <Navigate to="/desk/login" replace />

  function choose(slotId: number) {
    localStorage.setItem("jca_desk_slot", String(slotId))
    navigate("/desk")
  }

  function logout() {
    ;["jca_desk_token", "jca_desk_exam", "jca_desk_operator", "jca_desk_slot"].forEach((k) => localStorage.removeItem(k))
    navigate("/desk/login", { replace: true })
  }

  const slots = exam?.slots || []

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 bg-background p-4 sm:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Select Batch</h1>
          <p className="text-sm text-muted-foreground">{exam?.name || ""} · Operator: <span className="font-medium text-foreground">{operator}</span></p>
        </div>
        <Button variant="outline" size="sm" onClick={logout}><LogOut className="size-4" /> Log out</Button>
      </div>

      <p className="text-sm text-muted-foreground">Choose the batch whose registration is starting.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading batches…</p>}
        {!isLoading && slots.length === 0 && <p className="text-sm text-muted-foreground">No batches found for this exam.</p>}
        {slots.map((slot) => (
          <Card key={slot.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => choose(slot.id)}>
            <CardContent className="flex items-center gap-3 pt-2">
              <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarClock className="size-5" /></div>
              <div>
                <p className="font-mono text-xl font-semibold">{String(slot.start_time).slice(0, 5)}</p>
                <p className="text-sm text-muted-foreground">{formatDate(slot.exam_date)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
