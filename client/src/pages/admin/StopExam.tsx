import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { OctagonX, CheckCircle2 } from "lucide-react"
import { formatDate } from "@/lib/formatDate"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Full-page, password-protected "Stop Exam": only the exam name and the stop password.
// The password is generated when the exam is started and shown on the Exam Schedule page.
export default function StopExam() {
  const { examId = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [password, setPassword] = React.useState("")
  const [stopping, setStopping] = React.useState(false)
  const [done, setDone] = React.useState(false)

  const { data: exams } = useQuery({ queryKey: ["exams"], queryFn: () => adminApi.exams.list() })
  const exam = exams?.find((e) => String(e.id) === examId)
  // When the exam runs in several batches, show which batch this stop applies to.
  const hasBatches = !!exam && (exams || []).filter((e) => (e.registered_exam_id != null ? e.registered_exam_id === exam.registered_exam_id : e.name === exam.name)).length > 1

  async function stop(e: React.FormEvent) {
    e.preventDefault()
    setStopping(true)
    try {
      await adminApi.exams.stop(Number(examId), password.trim())
      queryClient.invalidateQueries({ queryKey: ["exams"] })
      setDone(true)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setStopping(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4">
      <h1 className="text-center text-3xl font-bold tracking-wide text-primary">{exam?.name || ""}</h1>
      {hasBatches && exam && (
        <p className="-mt-3 text-sm text-muted-foreground">Batch: {formatDate(exam.exam_date)} · {String(exam.start_time).slice(0, 5)}</p>
      )}
      {done ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-12 text-success" />
          <p className="text-lg font-semibold">Successfully stopped the exam</p>
          <p className="text-sm text-muted-foreground">
            All running attempts have been submitted{hasBatches ? " for this batch" : ""}. The exam no longer appears on the student Select Exam page.
          </p>
          <Button onClick={() => navigate("/admin/dashboard", { replace: true })}>Back to Dashboard</Button>
        </div>
      ) : (
      <form className="flex w-full max-w-sm flex-col gap-4" onSubmit={stop}>
        <Input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Stop exam password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" variant="destructive" disabled={stopping || !password.trim()}>
          <OctagonX className="size-4" /> {stopping ? "Stopping..." : "Stop Exam Batch"}
        </Button>
        <button type="button" onClick={() => navigate(-1)} className="text-center text-sm text-muted-foreground underline hover:text-foreground">
          Cancel
        </button>
      </form>
      )}
    </div>
  )
}
