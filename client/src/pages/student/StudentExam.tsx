import * as React from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { AlertTriangle, Clock, CheckCircle2, Trophy, WifiOff, RefreshCw, Maximize } from "lucide-react"
import { studentApi, type AttemptStart, type AttemptResult } from "@/api/studentApi"
import { getErrorMessage } from "@/api/client"
import { useStudentAuth } from "@/context/StudentAuthContext"
import { useDisableCopy } from "@/hooks/useDisableCopy"
import { initServerClock, serverNow } from "@/lib/serverClock"
import { Button } from "@/components/ui/button"
import { useBlockBack } from "@/hooks/useBlockBack"
import { Card } from "@/components/ui/card"
import { clearSelection } from "@/components/student/SelectionBanner"
import { cn } from "@/lib/utils"
import jcaBadge from "@/assets/jca-badge.png"
import { savePendingSubmit, clearPendingSubmit } from "@/lib/pendingSubmit"

const OPTIONS = ["A", "B", "C", "D"] as const

function ExamBrand({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className="flex items-center justify-center gap-3 bg-primary px-4 py-2 text-center text-[20px] leading-tight font-bold text-primary-foreground shadow-sm sm:px-6">
      <img src={logoUrl || jcaBadge} alt="Exam logo" className="size-[50px] shrink-0 rounded-md bg-white/90 object-contain p-1" />
      <span className="-ml-2 self-start text-xs opacity-80" aria-label="Copyright">&copy;</span>
      <span className="tracking-wide">{name}</span>
    </div>
  )
}

// Everything the device knows about this attempt is mirrored to localStorage, so answers recorded
// while the connection is down are never lost and can still be delivered once it returns.
interface LocalExamState {
  answers: Record<number, string>
  pending: number[]
}
const localKey = (attemptId: number) => `jca_exam_local_${attemptId}`
function readLocal(attemptId: number): LocalExamState | null {
  try {
    const raw = localStorage.getItem(localKey(attemptId))
    return raw ? (JSON.parse(raw) as LocalExamState) : null
  } catch {
    return null
  }
}
function writeLocal(attemptId: number, state: LocalExamState) {
  try { localStorage.setItem(localKey(attemptId), JSON.stringify(state)) } catch { /* storage full / blocked */ }
}
function clearLocal(attemptId: number) {
  try { localStorage.removeItem(localKey(attemptId)) } catch { /* ignore */ }
}

// A request that never got an answer from the server (connection lost) or hit a server fault -
// worth retrying. Anything else is a definite answer from the server.
function isRetryable(error: unknown) {
  if (!axios.isAxiosError(error)) return false
  if (!error.response) return true
  return error.response.status >= 500 || error.response.status === 429
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function StudentExam() {
  useBlockBack()
  const navigate = useNavigate()
  const { logout } = useStudentAuth()
  const [attempt, setAttempt] = React.useState<AttemptStart | null>(null)
  useDisableCopy(attempt ? attempt.security.disableCopyEnabled : true)
  const maxWarnings = attempt?.security.maxWarnings ?? 1
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [answers, setAnswers] = React.useState<Record<number, string>>({})
  const [visited, setVisited] = React.useState<Set<number>>(new Set())
  // Which subject section is open, and which question index within each section was
  // last viewed (so switching subjects and coming back doesn't reset your place).
  const [activeSection, setActiveSection] = React.useState(0)
  const [positions, setPositions] = React.useState<number[]>([])
  const [remaining, setRemaining] = React.useState(0)
  const [clockNow, setClockNow] = React.useState(Date.now())
  const [submitting, setSubmitting] = React.useState(false)
  const [view, setView] = React.useState<"exam" | "confirm" | "thankyou">("exam")
  // True while the finished exam is held on this device waiting for the connection to come back.
  const [submitPending, setSubmitPending] = React.useState(false)

  // After the Thank You message, send the candidate back to the Select Exam page.
  React.useEffect(() => {
    if (view !== "thankyou" || submitPending) return
    const t = setTimeout(() => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      clearSelection()
      logout()
      navigate("/student/login", { replace: true })
    }, 6000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, submitPending])
  const [result, setResult] = React.useState<AttemptResult | null>(null)
  const [showResumeScreen, setShowResumeScreen] = React.useState(false)
  const tabHideCount = React.useRef(0)
  const fullscreenExitCount = React.useRef(0)
  const submittingRef = React.useRef(false)
  const [isOnline, setIsOnline] = React.useState(navigator.onLine)
  const [pendingIds, setPendingIds] = React.useState<Set<number>>(new Set())
  const answersRef = React.useRef<Record<number, string>>({})
  const pendingRef = React.useRef<Set<number>>(new Set())
  const flushingRef = React.useRef(false)
  const deliveringRef = React.useRef(false)
  const attemptIdRef = React.useRef<number | null>(null)
  const submitReasonRef = React.useRef("manual")

  React.useEffect(() => {
    initServerClock()
    studentApi
      .startAttempt()
      .then((data) => {
        attemptIdRef.current = data.attemptId
        setAttempt(data)
        // Answers this device recorded earlier (e.g. while offline) win over what the server has.
        const local = readLocal(data.attemptId)
        const merged = { ...(data.answers as unknown as Record<number, string>), ...(local?.answers || {}) }
        const stillPending = new Set<number>((local?.pending || []).filter((id) => merged[id]))
        for (const [id, option] of Object.entries(merged)) {
          if ((data.answers as unknown as Record<number, string>)[Number(id)] !== option) stillPending.add(Number(id))
        }
        answersRef.current = merged
        pendingRef.current = stillPending
        setPendingIds(new Set(stillPending))
        setAnswers(merged)
        setPositions(new Array(data.sections.length).fill(0))
        if (data.sections[0]?.questions[0]) setVisited(new Set([data.sections[0].questions[0].id]))
      })
      .catch((error) => setLoadError(getErrorMessage(error)))
  }, [])

  // Network resilience. The exam keeps running with no connection: every answer is kept on this
  // device, queued, and pushed to the server (in one batch) as soon as the connection is back. The
  // final submit also carries every answer, so nothing recorded offline is lost.
  React.useEffect(() => {
    answersRef.current = answers
  }, [answers])

  // Mirror answers + queue to localStorage.
  React.useEffect(() => {
    if (!attempt) return
    writeLocal(attempt.attemptId, { answers, pending: [...pendingIds] })
  }, [attempt, answers, pendingIds])

  const markPending = React.useCallback((questionId: number) => {
    pendingRef.current.add(questionId)
    setPendingIds(new Set(pendingRef.current))
  }, [])

  const flushPending = React.useCallback(async () => {
    if (flushingRef.current || pendingRef.current.size === 0) return
    flushingRef.current = true
    const sent: Record<number, string> = {}
    for (const id of pendingRef.current) {
      if (answersRef.current[id]) sent[id] = answersRef.current[id]
    }
    try {
      await studentApi.syncAnswers(sent)
      // Only clear entries that were not changed again while the request was in flight.
      for (const [id, option] of Object.entries(sent)) {
        if (answersRef.current[Number(id)] === option) pendingRef.current.delete(Number(id))
      }
      setPendingIds(new Set(pendingRef.current))
    } catch {
      // still offline (or the server is busy) - the next pass retries
    } finally {
      flushingRef.current = false
    }
  }, [])

  React.useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      flushPending()
    }
    function handleOffline() {
      setIsOnline(false)
    }
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [flushPending])

  React.useEffect(() => {
    if (pendingIds.size === 0) return
    const interval = setInterval(flushPending, 5000)
    return () => clearInterval(interval)
  }, [pendingIds.size, flushPending])

  // Sends the final submit (with every answer held on this device). If the connection is down the
  // finished exam stays on this device and delivery is retried until it goes through - the exam is
  // complete for the candidate either way.
  const deliverSubmit = React.useCallback(async () => {
    if (deliveringRef.current) return
    deliveringRef.current = true
    try {
      const data = await studentApi.submitAttempt(submitReasonRef.current, answersRef.current)
      if (attemptIdRef.current) clearLocal(attemptIdRef.current)
      clearPendingSubmit()
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      setResult(data)
      setSubmitPending(false)
      setView("thankyou")
    } catch (error) {
      setView("thankyou")
      // Retryable: stay on the "waiting for connection" screen and keep trying. Anything else is a
      // definite answer (e.g. the session ended) - the server finalises the attempt on its own.
      const retry = isRetryable(error)
      setSubmitPending(retry)
      if (retry && attemptIdRef.current) {
        // Survives closing / reloading the page: delivered later by the app-level retry (see App.tsx).
        savePendingSubmit({
          token: localStorage.getItem("jca_student_token") || "",
          reason: submitReasonRef.current,
          answers: answersRef.current,
          attemptId: attemptIdRef.current,
        })
      }
    } finally {
      deliveringRef.current = false
    }
  }, [])

  const submit = React.useCallback(
    async (reason: string) => {
      if (submittingRef.current) return
      submittingRef.current = true
      setSubmitting(true)
      submitReasonRef.current = reason
      await deliverSubmit()
    },
    [deliverSubmit]
  )

  React.useEffect(() => {
    if (!submitPending) return
    const interval = setInterval(deliverSubmit, 4000)
    window.addEventListener("online", deliverSubmit)
    return () => {
      clearInterval(interval)
      window.removeEventListener("online", deliverSubmit)
    }
  }, [submitPending, deliverSubmit])

  const submitDelayMs = Math.max(0, Number(attempt?.exam.submitButtonAfterMinutes || 0)) * 60_000
  const manualSubmitAllowed = !!attempt && clockNow >= (new Date(attempt.startedAt).getTime() + submitDelayMs)

  // Timer
  React.useEffect(() => {
    if (!attempt) return
    const endsAt = new Date(attempt.endsAt).getTime()
    const tick = () => {
      const secs = Math.max(0, Math.round((endsAt - serverNow()) / 1000))
      setRemaining(secs)
      setClockNow(serverNow())
      if (secs <= 0) submit("timeout")
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [attempt, submit])

  // Anti-cheat: tab switching. Offenses up to maxWarnings (Settings page, default 1): kick
  // the candidate to a dedicated full-screen "resume" interstitial they must click through
  // (re-entering fullscreen) to continue — the exam timer keeps running the whole time. The
  // offense after that auto-submits. maxWarnings = 0 means the very first switch auto-submits.
  React.useEffect(() => {
    function handleVisibility() {
      if (document.hidden && attempt && !submittingRef.current) {
        tabHideCount.current += 1
        if (tabHideCount.current <= maxWarnings) {
          setShowResumeScreen(true)
        } else {
          submit("tab_switch")
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [attempt, submit, maxWarnings])

  // Anti-cheat: exiting fullscreen without switching tabs (e.g. pressing Escape). Guarded
  // against document.hidden / showResumeScreen so a tab switch - which also exits fullscreen
  // in most browsers - is only counted once, by the tab-switch handler above. Same
  // maxWarnings threshold as the tab-switch handler. The candidate just gets the plain
  // "return to fullscreen" screen - no counts or warnings are shown.
  React.useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement && attempt && !submittingRef.current && !document.hidden && !showResumeScreen) {
        fullscreenExitCount.current += 1
        if (fullscreenExitCount.current <= maxWarnings) {
          setShowResumeScreen(true)
        } else {
          submit("fullscreen_exit")
        }
      }
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [attempt, submit, showResumeScreen, maxWarnings])

  function handleResumeFromTabSwitch() {
    setShowResumeScreen(false)
    document.documentElement.requestFullscreen?.().catch(() => {})
  }

  // Anti-cheat: right-click + devtools shortcuts
  React.useEffect(() => {
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault()
    }
    function handleKeyDown(e: KeyboardEvent) {
      const isDevtoolsShortcut =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && e.key === "I") ||
        (e.ctrlKey && (e.key === "u" || e.key === "s"))
      if (isDevtoolsShortcut) {
        e.preventDefault()
        if (attempt && !submittingRef.current) submit("devtools")
      }
    }
    document.addEventListener("contextmenu", handleContextMenu)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [attempt, submit])

  function selectAnswer(questionId: number, option: string) {
    answersRef.current = { ...answersRef.current, [questionId]: option }
    setAnswers((prev) => ({ ...prev, [questionId]: option }))
    studentApi.saveAnswer(questionId, option).catch((error) => {
      if (axios.isAxiosError(error) && error.response?.data?.code === "ATTEMPT_CLOSED") {
        // The exam was ended (e.g. stopped by the administrator) - nothing more can be saved.
        setView("thankyou")
        return
      }
      // No connection (or a server hiccup): keep the answer on this device and queue it - the
      // periodic flush, the `online` event and the final submit all deliver it.
      markPending(questionId)
    })
  }

  function goTo(sectionIndex: number, questionIndex: number) {
    if (!attempt) return
    setActiveSection(sectionIndex)
    setPositions((prev) => {
      const next = [...prev]
      next[sectionIndex] = questionIndex
      return next
    })
    const questionId = attempt.sections[sectionIndex].questions[questionIndex]?.id
    if (questionId) setVisited((prev) => new Set(prev).add(questionId))
  }

  if (loadError) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
        <AlertTriangle className="size-10 text-destructive" />
        <p className="font-medium">{loadError}</p>
        <Button onClick={() => { logout(); navigate("/student/login") }}>Back to Login</Button>
      </div>
    )
  }

  if (!attempt || positions.length === 0) {
    return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Loading exam...</div>
  }

  const sections = attempt.sections
  const flatQuestions = sections.flatMap((s) => s.questions)
  const totalQuestions = flatQuestions.length
  const answeredCount = Object.keys(answers).length
  const activeSectionData = sections[activeSection]
  const currentIndex = positions[activeSection]
  const question = activeSectionData.questions[currentIndex]
  const isLastQuestionInSection = currentIndex === activeSectionData.questions.length - 1
  const isLastSection = activeSection === sections.length - 1
  const isVeryLast = isLastQuestionInSection && isLastSection
  const isVeryFirst = activeSection === 0 && currentIndex === 0

  function goPrevious() {
    if (currentIndex > 0) {
      goTo(activeSection, currentIndex - 1)
    } else if (activeSection > 0) {
      goTo(activeSection - 1, sections[activeSection - 1].questions.length - 1)
    }
  }

  function goNext() {
    if (currentIndex < activeSectionData.questions.length - 1) {
      goTo(activeSection, currentIndex + 1)
    } else if (activeSection < sections.length - 1) {
      goTo(activeSection + 1, 0)
    }
  }

  if (showResumeScreen) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-4 text-center select-none no-callout">
        <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-8" />
        </div>
        <h1 className="text-2xl font-semibold">You Left the Exam</h1>
        <p className="max-w-md text-muted-foreground">
          Click below to return to fullscreen and continue your exam.
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-base font-semibold">
          <Clock className="size-4" /> {formatTime(remaining)}
        </div>
        <Button onClick={handleResumeFromTabSwitch}>
          <Maximize className="size-4" /> Resume in Fullscreen
        </Button>
      </div>
    )
  }

  if (view === "thankyou") {
    return (
      <div className="flex min-h-svh flex-col bg-background select-none no-callout">
        {attempt && <ExamBrand name={attempt.exam.name} logoUrl={attempt.exam.logoUrl} />}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-8" />
        </div>
        {submitPending ? (
          <>
            <h1 className="text-2xl font-semibold">Exam Completed</h1>
            <p className="max-w-sm text-muted-foreground">
              Your answers are saved on this computer and are being sent to the server. Please keep this window open
              until the connection is back - your result is generated as soon as they arrive.
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin" /> Waiting for connection...
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Thank You!</h1>
            <p className="max-w-sm text-muted-foreground">
              {result
                ? "Your exam has been submitted successfully."
                : "Your answers have been recorded."}{" "}
              {(result?.show_provisional_result === false || !result) && "Your result will be declared by the administrator."}
            </p>
          </>
        )}

        {!submitPending && result?.show_provisional_result && (
          <Card className="w-full max-w-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="size-5 text-primary" />
                <div className="text-left">
                  <p className="text-sm text-muted-foreground">Score</p>
                  <p className="font-semibold">{result.marks_obtained} / {result.total_marks} ({result.percentage}%)</p>
                </div>
              </div>
              <span className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                result.result_status === "passed" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
              )}>
                {result.result_status}
              </span>
            </div>
          </Card>
        )}

        {!submitPending && (
          <>
            <p className="text-xs text-muted-foreground">Returning to the Select Exam page…</p>
            <Button onClick={() => { clearSelection(); logout(); navigate("/student/login", { replace: true }) }}>Done</Button>
          </>
        )}
        </div>
      </div>
    )
  }

  if (view === "confirm") {
    return (
      <div className="flex min-h-svh flex-col bg-background p-0 text-center select-none no-callout">
        {attempt && <ExamBrand name={attempt.exam.name} logoUrl={attempt.exam.logoUrl} />}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <AlertTriangle className="size-14 text-warning-foreground" />
        <h1 className="text-2xl font-semibold">Final Warning</h1>
        <p className="max-w-md text-muted-foreground">
          This is your final warning before submitting the exam. Once submitted, you cannot make any
          further changes or come back to review your answers.
        </p>

        <div className="mt-2 flex gap-3">
          <Button variant="outline" onClick={() => setView("exam")}>Return to Exam</Button>
          <Button disabled={submitting || !manualSubmitAllowed} onClick={() => submit("manual")}>
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-muted/30 select-none no-callout">
      <ExamBrand name={attempt.exam.name} logoUrl={attempt.exam.logoUrl} />
      <header className="flex items-center justify-between border-b bg-background px-4 py-2 sm:px-6">
        <div className="flex items-center gap-3">
          {attempt.exam.showPhotoSignature && attempt.student.photoUrl && (
            <img src={attempt.student.photoUrl} alt="Candidate photo" className="h-12 w-10 rounded border object-cover" />
          )}
          <div>
            <p className="text-sm font-semibold leading-tight">{attempt.student.fullName}</p>
            <p className="text-xs font-mono leading-tight">{attempt.student.rollNumber}</p>
          </div>
          {attempt.exam.showPhotoSignature && attempt.student.signatureUrl && (
            <img src={attempt.student.signatureUrl} alt="Candidate signature" className="h-8 w-20 rounded border bg-white object-contain" />
          )}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border-2 px-4 py-1.5 font-mono text-lg font-bold shadow-sm transition-colors",
            remaining <= 60
              ? "animate-pulse border-destructive bg-destructive/10 text-destructive"
              : remaining <= 300
                ? "border-warning bg-warning/10 text-warning-foreground"
                : "border-primary/40 bg-primary/5 text-primary"
          )}
        >
          <Clock className="size-5" /> {formatTime(remaining)}
        </div>
        {!isOnline && <WifiOff className="size-5 shrink-0 text-destructive" aria-label="Offline" />}
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto sm:flex-row sm:gap-4 sm:overflow-hidden p-3 sm:p-4">
        <aside className="flex w-full shrink-0 flex-col sm:w-56 sm:overflow-y-auto sm:no-scrollbar lg:w-64">
          <Card className="flex flex-col p-3 sm:p-4">
            {sections.length > 1 && (
              <>
                <div className="flex gap-1 overflow-x-auto sm:flex-col">
                  {sections.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => goTo(i, positions[i])}
                      className={cn(
                        "shrink-0 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        i === activeSection ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="my-3 border-t" />
              </>
            )}

            <p className="mb-2 text-sm font-semibold">{activeSectionData.label} Questions</p>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-5">
              {activeSectionData.questions.map((q, i) => {
                const state = i === currentIndex ? "current" : answers[q.id] ? "answered" : visited.has(q.id) ? "visited" : "untouched"
                return (
                  <button
                    key={q.id}
                    onClick={() => goTo(activeSection, i)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                      state === "current" && "bg-primary text-primary-foreground border-primary",
                      state === "answered" && "bg-success/15 text-success border-success/40",
                      state === "visited" && "bg-warning/15 text-warning-foreground border-warning/40",
                      state === "untouched" && "bg-background text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-col gap-1.5 text-xs text-muted-foreground">
              <p><span className="mr-2 inline-block size-2.5 rounded-full bg-success" />Answered</p>
              <p><span className="mr-2 inline-block size-2.5 rounded-full bg-warning" />Visited</p>
              <p><span className="mr-2 inline-block size-2.5 rounded-full bg-primary" />Current</p>
              <p><span className="mr-2 inline-block size-2.5 rounded-full border" />Not visited</p>
            </div>
            <p className="mt-4 text-sm">{answeredCount} / {totalQuestions} answered overall</p>
          </Card>
        </aside>

        <main className="flex-1 sm:overflow-y-auto sm:no-scrollbar">
          <Card className="flex flex-col p-4 sm:p-5">
            <p className="mb-1 text-sm text-muted-foreground">
              {activeSectionData.label}
            </p>
            <p className="mb-4 text-base font-medium">{question.question_text}</p>
            <div className="flex flex-col gap-2">
              {OPTIONS.map((opt) => {
                const text = question[`option_${opt.toLowerCase()}` as keyof typeof question] as string
                const selected = answers[question.id] === opt
                return (
                  <button
                    key={opt}
                    onClick={() => selectAnswer(question.id, opt)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
                      selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                    )}
                  >
                    <span className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      selected && "bg-primary text-primary-foreground border-primary"
                    )}>
                      {opt}
                    </span>
                    {text}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex justify-between">
              <Button disabled={isVeryFirst} onClick={goPrevious}>Previous</Button>
              {isVeryLast ? (
                manualSubmitAllowed ? (
                  <Button onClick={() => setView("confirm")}>Done Exam</Button>
                ) : null
              ) : (
                <Button onClick={goNext}>Next</Button>
              )}
            </div>
          </Card>
        </main>
      </div>
    </div>
  )
}
