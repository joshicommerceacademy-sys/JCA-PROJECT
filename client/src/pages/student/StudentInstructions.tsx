import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { studentApi } from "@/api/studentApi"
import { getErrorMessage } from "@/api/client"
import { useDisableCopy } from "@/hooks/useDisableCopy"
import { formatDate } from "@/lib/formatDate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PhotoFallback } from "@/components/ui/media-placeholder"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import jcaBadge from "@/assets/jca-badge.png"

const INSTRUCTIONS = [
  "The exam is timed. Once started, the timer runs continuously until the scheduled end time.",
  "The timer is based on the exam's scheduled duration, not on when you personally logged in.",
  "You can navigate between questions freely using the question palette or Next/Previous buttons.",
  "You may change your selected answer for any question at any time before submitting.",
  "Do not switch tabs or minimize the browser — this will be flagged and may auto-submit your exam.",
  "Do not refresh or close the browser window during the exam.",
  "Ensure you have a stable internet connection throughout the exam.",
  "Once submitted, answers cannot be changed under any circumstances.",
  "This exam must be taken in fullscreen mode. Exiting fullscreen or switching tabs more than once will auto-submit your exam.",
  "The exam will not open before its scheduled start time, even if you're logged in earlier.",
]

export default function StudentInstructions() {
  useDisableCopy()
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({ queryKey: ["student-instructions"], queryFn: studentApi.instructions })
  const [agreed, setAgreed] = React.useState(false)

  function handleContinue() {
    navigate("/student/exam-summary")
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
    <div className="flex min-h-svh flex-col items-center bg-muted/30 p-4 py-10 select-none no-callout">
      <div className="mb-4 flex items-center gap-2">
        <img src={jcaBadge} alt="Joshi's Commerce Academy" className="size-8" />
        <span className="font-semibold text-foreground">Joshi's Commerce Academy</span>
      </div>
      <Card className="w-full max-w-2xl">
        <CardHeader className="items-center text-center">
          <Avatar className="mb-2 size-20">
            {data.student.photoUrl && <AvatarImage src={data.student.photoUrl} />}
            <AvatarFallback className="p-0"><PhotoFallback /></AvatarFallback>
          </Avatar>
          <CardTitle className="text-xl">{data.student.fullName}</CardTitle>
          <p className="text-sm text-muted-foreground font-mono">{data.student.rollNumber}</p>
          <p className="text-sm text-muted-foreground">{data.student.centreName} · {data.student.standardName}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {data.resuming && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
              <div>
                <p className="font-medium text-foreground">You have an exam in progress</p>
                <p className="text-muted-foreground">
                  {data.answeredCount} of {data.totalQuestions} question{data.totalQuestions === 1 ? "" : "s"} already
                  answered — your answers are saved. Resuming will pick up exactly where you left off with
                  your remaining time, not a fresh full duration.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-4">
            <div><p className="text-muted-foreground">Exam</p><p className="font-medium">{data.exam.name}</p></div>
            <div><p className="text-muted-foreground">Date</p><p className="font-medium">{formatDate(data.exam.examDate)}</p></div>
            <div>
              <p className="text-muted-foreground">{data.resuming ? "Time Remaining" : "Duration"}</p>
              <p className="font-medium">
                {data.resuming ? `${data.remainingMinutes} min left` : `${data.exam.durationMinutes} min`}
              </p>
            </div>
            <div><p className="text-muted-foreground">Questions</p><p className="font-medium">{data.totalQuestions}</p></div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Instructions</h3>
            <ul className="flex flex-col gap-2">
              {INSTRUCTIONS.map((instr, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  {instr}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 rounded-lg border p-3">
            <Checkbox id="agreed" className="mt-0.5" checked={agreed} onCheckedChange={(c) => setAgreed(!!c)} />
            <Label htmlFor="agreed" className="font-normal">I have read all the instructions above</Label>
          </div>

          <Button size="lg" onClick={handleContinue} disabled={data.totalQuestions === 0 || !agreed}>
            {data.resuming ? "Continue to Resume" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
