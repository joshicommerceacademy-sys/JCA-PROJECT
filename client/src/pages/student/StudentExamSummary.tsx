import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { AlertTriangle, Clock, ListChecks } from "lucide-react"
import { studentApi } from "@/api/studentApi"
import { getErrorMessage } from "@/api/client"
import { useDisableCopy } from "@/hooks/useDisableCopy"
import { initServerClock, serverNow } from "@/lib/serverClock"
import { getExamWindow } from "@/lib/examWindow"
import { formatDate } from "@/lib/formatDate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import jcaBadge from "@/assets/jca-badge.png"

export default function StudentExamSummary() {
  useDisableCopy()
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({ queryKey: ["student-instructions"], queryFn: studentApi.instructions })
  const [starting, setStarting] = React.useState(false)
  const [earlyError, setEarlyError] = React.useState<string | null>(null)

  React.useEffect(() => {
    initServerClock()
  }, [])

  async function enterFullscreenAndStart() {
    try {
      await document.documentElement.requestFullscreen?.()
    } catch {
      // fall through — checked below via document.fullscreenElement
    }
    if (!document.fullscreenElement) {
      toast.error("Fullscreen is required to start the exam. Please allow fullscreen and try again.")
      setStarting(false)
      return
    }
    navigate("/student/exam")
  }

  async function handleStart() {
    if (!data) return
    setStarting(true)

    if (data.resuming) {
      await enterFullscreenAndStart()
      return
    }

    const { start: startDateTime } = getExamWindow({
      exam_date: data.exam.examDate,
      start_time: data.exam.startTime,
      duration_minutes: data.exam.durationMinutes,
    })
    if (serverNow() < startDateTime.getTime()) {
      setEarlyError(
        `This exam hasn't started yet. It is scheduled to begin on ${formatDate(data.exam.examDate)} at ${data.exam.startTime}.`
      )
      setStarting(false)
      return
    }

    await enterFullscreenAndStart()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Skeleton className="h-96 w-full max-w-2xl" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
        <AlertTriangle className="size-10 text-destructive" />
        <p className="font-medium">{getErrorMessage(error)}</p>
        <Button onClick={() => navigate("/student/login")}>Back to Login</Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-background select-none no-callout">
      <div className="flex flex-col items-center gap-6 bg-muted/30 p-4 py-10">
        <div className="flex items-center gap-2">
          <img src={jcaBadge} alt="Joshi's Commerce Academy" className="size-8" />
          <span className="font-semibold text-foreground">Joshi's Commerce Academy</span>
        </div>

        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-2xl">{data.exam.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{formatDate(data.exam.examDate)} · {data.exam.startTime}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <div>
                  <p className="text-muted-foreground">
                    {data.resuming ? "Time Remaining" : "Duration"}
                  </p>
                  <p className="font-medium">
                    {data.resuming ? `${data.remainingMinutes} min left` : `${data.exam.durationMinutes} min`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-primary" />
                <div>
                  <p className="text-muted-foreground">Total Questions</p>
                  <p className="font-medium">{data.totalQuestions}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Subject-wise Breakdown</h3>
              <div className="overflow-hidden rounded-lg border">
                {data.sections.map((s, i) => (
                  <div
                    key={s.label + i}
                    className="flex items-center justify-between border-b px-4 py-2 text-sm last:border-b-0 odd:bg-muted/20"
                  >
                    <span>{s.label}</span>
                    <span className="font-medium">{s.questionCount} question{s.questionCount === 1 ? "" : "s"}</span>
                  </div>
                ))}
                {data.sections.length === 0 && (
                  <div className="px-4 py-3 text-sm text-muted-foreground">No subject sections for this exam.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <Button size="lg" onClick={handleStart} disabled={starting}>
          {data.resuming ? "Resume Exam" : "Start Exam"}
        </Button>
      </div>

      <Dialog open={!!earlyError} onOpenChange={(open) => !open && setEarlyError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" /> Exam Not Started Yet
            </DialogTitle>
            <DialogDescription>{earlyError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setEarlyError(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
