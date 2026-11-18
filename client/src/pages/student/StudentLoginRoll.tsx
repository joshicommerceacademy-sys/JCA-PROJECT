import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { RefreshCw, CheckCircle2 } from "lucide-react"
import { studentApi } from "@/api/studentApi"
import { SelectionBanner, saveSelection, readSelection } from "@/components/student/SelectionBanner"
import { buildInstructions } from "@/lib/instructions"
import { getLoginSessionId } from "@/lib/loginSession"
import { getErrorMessage } from "@/api/client"
import axios from "axios"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// Step 2 of student login.
//  1. Pick the roll number from the list, OR type it. The candidate's standard is then shown
//     with a Submit button.
//  2. After Submit: a welcome message, with "Show Instructions" and "Proceed" below it.
//     Proceed stays disabled until the instructions have been opened and the checkbox ticked.
//  3. Proceed opens the password page.
export default function StudentLoginRoll() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const examId = searchParams.get("examId")
  const prefillRoll = searchParams.get("roll")

  const [rollNumber, setRollNumber] = React.useState("")
  const [typed, setTyped] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  const [showInstructions, setShowInstructions] = React.useState(false)
  const [agreed, setAgreed] = React.useState(false)
  const [fullName, setFullName] = React.useState("")
  const [claiming, setClaiming] = React.useState(false)
  // Pop-up shown when someone else has already selected this roll number.
  const [takenMessage, setTakenMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!examId) navigate("/student/login", { replace: true })
  }, [examId, navigate])

  const { data: candidates, isLoading: candidatesLoading, refetch: refetchCandidates } = useQuery({
    queryKey: ["login-candidates", examId],
    queryFn: () => studentApi.loginCandidates(examId!),
    enabled: !!examId,
    refetchInterval: 15000,
  })

  // The exam's own settings (duration, when Done Exam appears...) drive the instructions text.
  const { data: loginExams } = useQuery({
    queryKey: ["login-exams"],
    queryFn: () => studentApi.loginExams(),
    staleTime: 60_000,
  })
  const examInfo = loginExams?.find((x) => String(x.id) === examId)

  // Make sure the exam name/logo are known even when opened from an email/reappear link.
  React.useEffect(() => {
    if (!examId || (readSelection().examName && readSelection().examId === examId)) return
    studentApi.loginExams().then((list) => {
      const e = list.find((x) => String(x.id) === examId)
      if (e) saveSelection({ examId, examName: e.name, logoUrl: e.logoUrl ?? null, rollNumber: undefined })
    }).catch(() => {})
  }, [examId])

  React.useEffect(() => {
    if (!prefillRoll || rollNumber) return
    if (candidates?.some((c) => c.rollNumber === prefillRoll)) {
      setRollNumber(prefillRoll)
      saveSelection({ rollNumber: prefillRoll })
    }
  }, [prefillRoll, candidates, rollNumber])

  const selected = candidates?.find((c) => c.rollNumber === rollNumber)
  const typedTrim = typed.trim()
  const typedUnknown = !!typedTrim && !candidates?.some((c) => c.rollNumber.toLowerCase() === typedTrim.toLowerCase())

  function pick(roll: string) {
    setRollNumber(roll)
    setSubmitted(false)
    setShowInstructions(false)
    setAgreed(false)
    saveSelection({ rollNumber: roll })
  }

  function handleTyped(value: string) {
    setTyped(value)
    const match = candidates?.find((c) => c.rollNumber.toLowerCase() === value.trim().toLowerCase())
    if (match) pick(match.rollNumber)
    else if (rollNumber) { setRollNumber(""); setSubmitted(false) }
  }

  // Submit: go full screen (a click is required for that) so every following page stays full
  // screen, then fetch the candidate's name for the welcome message.
  async function handleSubmit() {
    if (claiming) return
    setClaiming(true)
    try {
      // Claim the roll number first: it shows up on the Attendance page straight away, and a second
      // person submitting the same roll number is stopped here.
      try {
        await studentApi.claimRoll(examId!, rollNumber, getLoginSessionId())
      } catch (error) {
        const code = axios.isAxiosError(error) ? (error.response?.data as { code?: string } | undefined)?.code : undefined
        if (code === "ROLL_ALREADY_SELECTED") {
          setTakenMessage(getErrorMessage(error))
          // Refresh the list - the roll number may have just dropped out of it.
          refetchCandidates()
        } else {
          setTakenMessage(getErrorMessage(error))
        }
        return
      }

      try {
        await document.documentElement.requestFullscreen?.()
      } catch {
        // fullscreen refused — carry on, it is requested again when the exam starts
      }
      try {
        const r = await studentApi.candidateName(examId!, rollNumber)
        setFullName(r.fullName)
      } catch {
        setFullName("")
      }
      setSubmitted(true)
    } finally {
      setClaiming(false)
    }
  }

  function closeTakenPopup() {
    setTakenMessage(null)
    setRollNumber("")
    setTyped("")
    setSubmitted(false)
  }

  function handleSelect(value: string) {
    setTyped("")
    pick(value)
  }

  if (!examId) return null

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SelectionBanner />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {!submitted ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rollNumber">Select Roll Number</Label>
                  <button type="button" onClick={() => window.location.reload()} title="Refresh" className="text-primary hover:text-primary/70">
                    <RefreshCw className="size-3.5" />
                  </button>
                </div>
                <Select value={rollNumber} onValueChange={handleSelect} disabled={candidatesLoading}>
                  <SelectTrigger id="rollNumber" className="w-full">
                    <SelectValue
                      placeholder="Select Roll Number"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates?.map((c) => (
                      <SelectItem key={c.rollNumber} value={c.rollNumber}>{c.rollNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="typedRoll">Type Roll Number</Label>
                <Input
                  id="typedRoll" value={typed} onChange={(e) => handleTyped(e.target.value)}
                  placeholder="Enter your roll number" autoComplete="off" className="font-mono"
                />
                {typedUnknown && <p className="text-xs text-destructive">This roll number is not available for this exam.</p>}
              </div>

              {selected && (
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Roll Number</span><span className="font-mono font-medium">{selected.rollNumber}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Standard</span><span className="font-medium">{selected.standardName || "—"}</span></div>
                  <Button type="button" onClick={handleSubmit} disabled={claiming}>{claiming ? "Submitting..." : "Submit"}</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <p className="text-lg font-semibold text-primary">Welcome{fullName ? `, ${fullName}` : ""}!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Roll No <span className="font-mono font-medium text-foreground">{rollNumber}</span>
                  {selected?.standardName ? ` · ${selected.standardName}` : ""}
                </p>
              </div>

              {showInstructions && (
                <div className="flex flex-col gap-4 rounded-lg border p-4">
                  <h3 className="text-sm font-semibold">Instructions</h3>
                  <ul className="flex flex-col gap-2">
                    {buildInstructions({
                      durationMinutes: examInfo?.durationMinutes ?? 0,
                      submitButtonAfterMinutes: examInfo?.submitButtonAfterMinutes ?? 0,
                      compensateLateLogin: examInfo?.compensateLateLogin ?? true,
                    }).map((t, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{t}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-start gap-2 rounded-lg border p-3">
                    <Checkbox id="agreed" className="mt-0.5" checked={agreed} onCheckedChange={(c) => setAgreed(!!c)} />
                    <Label htmlFor="agreed" className="font-normal">I have read all the instructions</Label>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setShowInstructions(false)}>Back</Button>
                </div>
              )}

              {!showInstructions && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowInstructions(true)}>
                    Show Instructions
                  </Button>
                  <Button
                    type="button" className="flex-1" disabled={!agreed}
                    onClick={() => navigate(`/student/login/password?examId=${examId}&roll=${encodeURIComponent(rollNumber)}`)}
                  >
                    Proceed
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!takenMessage} onOpenChange={(o) => !o && closeTakenPopup()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Roll number unavailable</DialogTitle>
            <DialogDescription>{takenMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={closeTakenPopup}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
