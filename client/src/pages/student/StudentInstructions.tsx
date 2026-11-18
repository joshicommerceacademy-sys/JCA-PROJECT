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
import { ExamStartTimer } from "@/components/student/ExamStartTimer"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { SelectionBanner, saveSelection } from "@/components/student/SelectionBanner"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import jcaBadge from "@/assets/jca-badge.png"
import { buildInstructions } from "@/lib/instructions"

export default function StudentInstructions() {
  useDisableCopy()
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({ queryKey: ["student-instructions"], queryFn: () => studentApi.instructions() })
  const [agreed, setAgreed] = React.useState(false)

  const [showInstructions, setShowInstructions] = React.useState(false)
  const [askPassword, setAskPassword] = React.useState(false)
  const [examPassword, setExamPassword] = React.useState("")
  const [verifying, setVerifying] = React.useState(false)

  React.useEffect(() => {
    if (data) saveSelection({ examName: data.exam.name, rollNumber: data.student.rollNumber })
  }, [data])

  // Next opens the exam-password prompt; the summary page is only reachable once it checks out.
  async function handleVerifyPassword(e: React.FormEvent) {
    e.preventDefault()
    setVerifying(true)
    try {
      await studentApi.verifyExamPassword(examPassword)
      setAskPassword(false)
      navigate("/student/exam-summary", { state: { passwordVerified: true } })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setVerifying(false)
    }
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
    <div className="flex min-h-svh flex-col bg-background select-none no-callout"><SelectionBanner />
    <div className="flex flex-1 flex-col items-center p-4 py-10">
      <div className="mb-4 flex w-full max-w-2xl items-center justify-center gap-3 rounded-xl bg-primary px-4 py-3 text-center text-primary-foreground shadow-sm">
        <img src={data.exam.logoUrl || jcaBadge} alt="Exam logo" className="size-9 rounded bg-white p-0.5 object-contain" />
        <span className="text-lg font-bold tracking-wide">{data.exam.name}</span>
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
            <ExamStartTimer examDate={data.exam.examDate} startTime={data.exam.startTime} resuming={data.resuming} remainingMinutes={data.remainingMinutes} />
            <div><p className="text-muted-foreground">Questions</p><p className="font-medium">{data.totalQuestions}</p></div>
          </div>

          <Button type="button" variant="outline" onClick={() => setShowInstructions(true)}>Instructions</Button>

          <div className="flex items-start gap-2 rounded-lg border p-3">
            <Checkbox id="agreed" className="mt-0.5" checked={agreed} onCheckedChange={(c) => setAgreed(!!c)} />
            <Label htmlFor="agreed" className="font-normal">I have read all the instructions</Label>
          </div>

          <Button size="lg" onClick={() => { setExamPassword(""); setAskPassword(true) }} disabled={data.totalQuestions === 0 || !agreed}>
            {data.resuming ? "Next (Resume)" : "Next"}
          </Button>
        </CardContent>
      </Card>
    </div>
    <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Instructions</DialogTitle></DialogHeader>
        <ul className="flex flex-col gap-2">
          {buildInstructions(data.exam).map((instr, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              {instr}
            </li>
          ))}
        </ul>
        <DialogFooter><Button onClick={() => setShowInstructions(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={askPassword} onOpenChange={setAskPassword}>
      <DialogContent>
        <form onSubmit={handleVerifyPassword} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Enter Exam Password</DialogTitle>
            <DialogDescription>Enter the exam password to continue to the exam details.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={examPassword} onChange={(e) => setExamPassword(e.target.value)} placeholder="Exam password" required />
          <DialogFooter><Button type="submit" disabled={verifying || !examPassword.trim()}>{verifying ? "Checking..." : "Continue"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </div>
  )
}
