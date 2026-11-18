import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Eye, EyeOff } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { studentApi } from "@/api/studentApi"
import { useStudentAuth } from "@/context/StudentAuthContext"
import { SelectionBanner, saveSelection } from "@/components/student/SelectionBanner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"

// Step 3: the candidate types their own password, then Login → full exam details page.
export default function StudentLoginPassword() {
  const { login, isLoading } = useStudentAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const examId = searchParams.get("examId")
  const rollNumber = searchParams.get("roll")
  const [password, setPassword] = React.useState("")
  const [show, setShow] = React.useState(false)
  const [alreadyStarted, setAlreadyStarted] = React.useState<string | null>(null)
  const [taken, setTaken] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!examId || !rollNumber) navigate("/student/login", { replace: true })
    else saveSelection({ rollNumber })
  }, [examId, rollNumber, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rollNumber) return
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.().catch(() => {})
      await login(rollNumber, password)
      navigate("/student/exam-summary")
    } catch (error) {
      const code = (error as { code?: string })?.code
      const message = error instanceof Error ? error.message : "Login failed"
      if (code === "EXAM_ALREADY_SUBMITTED") setAlreadyStarted(message)
      else if (code === "ROLL_ALREADY_SELECTED") setTaken(message)
      else toast.error(message)
    }
  }

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["exam-status", examId],
    queryFn: () => studentApi.examStatus(examId as string),
    enabled: !!examId,
  })

  if (!examId || !rollNumber) return null
  if (statusLoading) return null

  // No question bank linked to this exam — the only place students are told.
  if (status && !status.questionBankActive) {
    return (
      <div className="flex min-h-svh flex-col bg-background">
        <SelectionBanner />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
          <p className="text-xl font-semibold text-destructive">Question Bank Not Active</p>
          <Button variant="outline" onClick={() => navigate(`/student/login/roll?examId=${examId}`)}>Back</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SelectionBanner />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <form className="flex w-full max-w-sm flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Roll Number</Label>
            <Input value={rollNumber} readOnly className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password" autoFocus type={show ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)} required className="pr-9"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={isLoading}>{isLoading ? "Signing in..." : "Submit"}</Button>
        </form>
      </div>
      <Dialog open={!!taken} onOpenChange={(o) => { if (!o) { setTaken(null); navigate(`/student/login/roll?examId=${examId}`, { replace: true }) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Roll number unavailable</DialogTitle>
            <DialogDescription>{taken}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => { setTaken(null); navigate(`/student/login/roll?examId=${examId}`, { replace: true }) }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!alreadyStarted} onOpenChange={(o) => !o && setAlreadyStarted(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exam Already Started</DialogTitle>
            <DialogDescription>{alreadyStarted}</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={() => setAlreadyStarted(null)}>OK</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
