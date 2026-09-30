import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import { studentApi } from "@/api/studentApi"
import { getErrorMessage } from "@/api/client"
import { formatDate } from "@/lib/formatDate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// Standalone "Select Exam" step — deliberately not wrapped in the wider student-portal shell
// (no branding panel, no other content) so this is the only thing a student sees here. Picking
// an exam auto-fills the exam-access password and auto-submits it — nothing to type.
export default function StudentLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlExamId = searchParams.get("examId")
  const prefillRoll = searchParams.get("roll")

  const [examId, setExamId] = React.useState("")
  const [examPassword, setExamPassword] = React.useState("")
  const [refreshing, setRefreshing] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const autoSubmitted = React.useRef(false)

  const { data: exams, isLoading: examsLoading } = useQuery({
    queryKey: ["login-exams"],
    queryFn: studentApi.loginExams,
    refetchInterval: 30000,
  })

  const selectedExam = exams?.find((e) => String(e.id) === examId)

  const proceed = React.useCallback(
    async (id: string, password: string) => {
      setSubmitting(true)
      try {
        await studentApi.verifyExamAccess(id, password)
        const rollParam = prefillRoll ? `&roll=${encodeURIComponent(prefillRoll)}` : ""
        navigate(`/student/login/roll?examId=${id}${rollParam}`)
      } catch (error) {
        toast.error(getErrorMessage(error))
        setSubmitting(false)
      }
    },
    [navigate, prefillRoll]
  )

  // Once an exam is picked, fetch its access password, show it, then auto-submit — no typing,
  // no separate click needed (a manual Continue button is still there as a fallback/retry).
  async function handleSelectExam(id: string) {
    setExamId(id)
    setExamPassword("")
    try {
      const { accessPassword } = await studentApi.examAccessPassword(id)
      setExamPassword(accessPassword)
      proceed(id, accessPassword)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  // A hall-ticket-email or reappear link carries ?examId= — select it automatically once the
  // exam list has loaded, same as picking it by hand.
  React.useEffect(() => {
    if (!urlExamId || autoSubmitted.current || !exams) return
    if (exams.some((e) => String(e.id) === urlExamId)) {
      autoSubmitted.current = true
      handleSelectExam(urlExamId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlExamId, exams])

  function handleRefresh() {
    setRefreshing(true)
    window.location.reload()
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-primary">Select Exam</h1>
      <Card className="w-full max-w-sm">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-base font-normal text-muted-foreground">
            Pick your exam to continue
          </CardTitle>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh"
            className="text-primary transition-colors hover:text-primary/70 disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exam">Exam</Label>
            <Select value={examId} onValueChange={handleSelectExam} disabled={examsLoading || submitting}>
              <SelectTrigger id="exam" className="w-full">
                <SelectValue
                  placeholder={
                    examsLoading
                      ? "Loading..."
                      : exams?.length
                        ? "Select an exam"
                        : "No exam is open for login right now"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {exams?.map((exam) => (
                  <SelectItem key={exam.id} value={String(exam.id)}>
                    {exam.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedExam && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <div><p className="text-muted-foreground">Date</p><p className="font-medium">{formatDate(selectedExam.examDate)}</p></div>
              <div><p className="text-muted-foreground">Time</p><p className="font-medium">{selectedExam.startTime}</p></div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Centre</p>
                <p className="font-medium">
                  {selectedExam.centreName || "—"}
                  {selectedExam.centreCity ? `, ${selectedExam.centreCity}` : ""}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="examPassword">Password</Label>
            <Input id="examPassword" value={examPassword} readOnly placeholder="Auto-filled once you pick an exam" />
          </div>

          <Button
            className="mt-2"
            disabled={!examId || !examPassword || submitting}
            onClick={() => proceed(examId, examPassword)}
          >
            {submitting ? "Logging in..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
