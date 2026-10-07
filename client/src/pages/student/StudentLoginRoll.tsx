import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Eye, EyeOff, RefreshCw, ArrowLeft } from "lucide-react"
import { useStudentAuth } from "@/context/StudentAuthContext"
import { studentApi } from "@/api/studentApi"
import { StudentLoginLayout } from "@/components/student/StudentLoginLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// Step 2 of student login: pick your roll number (scoped to the exam chosen on step 1) and
// type your own password — this step is deliberately manual, no auto-fill or auto-submit.
export default function StudentLoginRoll() {
  const { login, isLoading } = useStudentAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const examId = searchParams.get("examId")
  const prefillRoll = searchParams.get("roll")

  const [rollNumber, setRollNumber] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

  // No exam chosen (e.g. this page was opened directly) — send them back to pick one.
  React.useEffect(() => {
    if (!examId) navigate("/student/login", { replace: true })
  }, [examId, navigate])

  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ["login-candidates", examId],
    queryFn: () => studentApi.loginCandidates(examId!),
    enabled: !!examId,
    refetchInterval: 15000,
  })

  // A reappear "Copy Login Link" carries ?roll= — pick it for the student so they only have to
  // type their password and click Login.
  React.useEffect(() => {
    if (!prefillRoll || rollNumber) return
    if (candidates?.some((c) => c.rollNumber === prefillRoll)) {
      setRollNumber(prefillRoll)
    }
  }, [prefillRoll, candidates, rollNumber])

  function handleRefresh() {
    setRefreshing(true)
    window.location.reload()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rollNumber) {
      toast.error("Please select your roll number")
      return
    }
    try {
      await login(rollNumber, password)
      toast.success("Login successful")
      navigate("/student/instructions")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed")
    }
  }

  if (!examId) return null

  return (
    <StudentLoginLayout title="Student Login" subtitle="Select your roll number to continue">
      <button
        type="button"
        onClick={() => navigate("/student/login")}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Choose a different exam
      </button>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="rollNumber">Roll Number</Label>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh"
              className="text-primary transition-colors hover:text-primary/70 disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          <Select value={rollNumber} onValueChange={setRollNumber} disabled={candidatesLoading}>
            <SelectTrigger id="rollNumber" className="w-full">
              <SelectValue
                placeholder={
                  candidatesLoading
                    ? "Loading..."
                    : candidates?.length
                      ? "Select your roll number"
                      : "No roll numbers available for this exam right now"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {candidates?.map((c) => (
                <SelectItem key={c.rollNumber} value={c.rollNumber}>
                  {c.rollNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!candidatesLoading && candidates?.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Roll numbers appear here once you're allowed for this exam.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="mt-2" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Start Exam"}
        </Button>
      </form>
    </StudentLoginLayout>
  )
}
