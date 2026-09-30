import * as React from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import axios from "axios"
import { AlertTriangle, Clock, CheckCircle2, Trophy, WifiOff, RefreshCw, Maximize } from "lucide-react"
import { studentApi, type AttemptStart, type AttemptResult } from "@/api/studentApi"
import { getErrorMessage } from "@/api/client"
import { useStudentAuth } from "@/context/StudentAuthContext"
import { useDisableCopy } from "@/hooks/useDisableCopy"
import { initServerClock, serverNow } from "@/lib/serverClock"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PhotoFallback } from "@/components/ui/media-placeholder"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import jcaBadge from "@/assets/jca-badge.png"

const OPTIONS = ["A", "B", "C", "D"] as const

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function StudentExam() {
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
  const [submitting, setSubmitting] = React.useState(false)
  const [view, setView] = React.useState<"exam" | "confirm" | "thankyou">("exam")
  const [result, setResult] = React.useState<AttemptResult | null>(null)
  const [showResumeScreen, setShowResumeScreen] = React.useState(false)
  const [fullscreenWarning, setFullscreenWarning] = React.useState(false)
  const tabHideCount = React.useRef(0)
  const fullscreenExitCount = React.useRef(0)
  const submittingRef = React.useRef(false)
  const [isOnline, setIsOnline] = React.useState(navigator.onLine)
  const [pendingIds, setPendingIds] = React.useState<Set<number>>(new Set())
  const answersRef = React.useRef<Record<number, string>>({})
  const flushingRef = React.useRef(false)

  React.useEffect(() => {
    initServerClock()
    studentApi
      .startAttempt()
      .then((data) => {
        setAttempt(data)
        setAnswers(data.answers as unknown as Record<number, string>)
        setPositions(new Array(data.sections.length).fill(0))
        if (data.sections[0]?.questions[0]) setVisited(new Set([data.sections[0].questions[0].id]))
      })
      .catch((error) => setLoadError(getErrorMessage(error)))
  }, [])

  // Network resilience: an answer that fails to save because the connection dropped is queued
  // instead of silently lost — it's retried automatically once we're back online.
  React.useEffect(() => {
    answersRef.current = answers
  }, [answers])

  const flushPending = React.useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    try {
      for (const questionId of pendingIds) {
        const selected = answersRef.current[questionId]
        if (!selected) continue
        try {
          await studentApi.saveAnswer(questionId, selected)
          setPendingIds((prev) => {
            const next = new Set(prev)
            next.delete(questionId)
            return next
          })
        } catch (error) {
          if (axios.isAxiosError(error) && !error.response) break // still offline, stop retrying this pass
        }
      }
    } finally {
      flushingRef.current = false
    }
  }, [pendingIds])

  React.useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      toast.success("Back online — syncing your answers.")
      flushPending()
    }
    function handleOffline() {
      setIsOnline(false)
      toast.warning("You're offline. Your answers are being saved locally and will sync automatically once you're back online.")
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

  const submit = React.useCallback(
    async (reason: string) => {
      if (submittingRef.current) return
      submittingRef.current = true
      setSubmitting(true)
      try {
        await flushPending() // best-effort: get as many queued answers saved as possible first
        const data = await studentApi.submitAttempt(reason)
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
        setResult(data)
        setView("thankyou")
      } catch (error) {
        toast.error(getErrorMessage(error))
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [flushPending]
  )

  // Timer
  React.useEffect(() => {
    if (!attempt) return
    const endsAt = new Date(attempt.endsAt).getTime()
    const tick = () => {
      const secs = Math.max(0, Math.round((endsAt - serverNow()) / 1000))
      setRemaining(secs)
      if (secs <= 0) {
        toast.error("Time is up! Submitting your exam.")
        submit("timeout")
      }
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
  // against document.hidden / showResumeScreen so a tab switch — which also exits fullscreen
  // in most browsers — is only counted once, by the tab-switch handler above. Same
  // maxWarnings threshold as the tab-switch handler.
  React.useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement && attempt && !submittingRef.current && !document.hidden && !showResumeScreen) {
        fullscreenExitCount.current += 1
        if (fullscreenExitCount.current <= maxWarnings) {
          setFullscreenWarning(true)
          toast.warning(
            maxWarnings - fullscreenExitCount.current > 0
              ? `You exited fullscreen. ${maxWarnings - fullscreenExitCount.current + 1} more exit(s) allowed before your exam is auto-submitted.`
              : "You exited fullscreen. One more exit will auto-submit your exam."
          )
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
      toast.warning("Right-click is disabled during the exam.")
    }
    function handleKeyDown(e: KeyboardEvent) {
      const isDevtoolsShortcut =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && e.key === "I") ||
        (e.ctrlKey && (e.key === "u" || e.key === "s"))
      if (isDevtoolsShortcut) {
        e.preventDefault()
        if (attempt && !submittingRef.current) {
          toast.error("Developer tools detected! Submitting your exam.")
          submit("devtools")
        }
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
    setAnswers((prev) => ({ ...prev, [questionId]: option }))
    studentApi.saveAnswer(questionId, option).catch((error) => {
      if (axios.isAxiosError(error) && !error.response) {
        // No connection right now — queue it, the periodic flush (and the `online` event)
        // will retry it rather than losing the answer.
        setPendingIds((prev) => new Set(prev).add(questionId))
      } else {
        toast.error(getErrorMessage(error))
      }
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
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted/30 p-4 text-center select-none no-callout">
        <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-8" />
        </div>
        <h1 className="text-2xl font-semibold">You Left the Exam</h1>
        <p className="max-w-md text-muted-foreground">
          Switching tabs or windows during the exam is not allowed. Your timer kept running while
          you were away. Click below to re-enter fullscreen and continue.
        </p>
        <p className="max-w-md text-sm font-medium text-destructive">
          {maxWarnings - tabHideCount.current > 0
            ? `Warning: ${maxWarnings - tabHideCount.current + 1} more switch(es) allowed before your exam is auto-submitted.`
            : "Warning: switching away one more time will auto-submit your exam."}
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
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted/30 p-4 text-center select-none no-callout">
        <div className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-8" />
        </div>
        <h1 className="text-2xl font-semibold">Thank You!</h1>
        <p className="max-w-sm text-muted-foreground">
          Your exam has been submitted successfully. {result?.show_provisional_result === false && "Your result will be declared by the administrator."}
        </p>

        {result?.show_provisional_result && (
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

        <Button onClick={() => { logout(); navigate("/student/login") }}>Done</Button>
      </div>
    )
  }

  if (view === "confirm") {
    const unanswered = totalQuestions - answeredCount
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted/30 p-4 text-center select-none no-callout">
        <AlertTriangle className="size-14 text-warning-foreground" />
        <h1 className="text-2xl font-semibold">Final Warning</h1>
        <p className="max-w-md text-muted-foreground">
          This is your final warning before submitting the exam. Once submitted, you cannot make any
          further changes or come back to review your answers.
        </p>

        <div className="flex w-full max-w-sm items-center justify-center gap-4">
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-base font-semibold",
              remaining <= 60 ? "border-destructive/50 bg-destructive/10 text-destructive" : "text-foreground"
            )}
          >
            <Clock className="size-4" /> {formatTime(remaining)}
          </div>
          <div className="rounded-lg border px-4 py-2 text-sm">
            <span className="font-semibold">{answeredCount}</span> / {totalQuestions} answered
            {unanswered > 0 && <span className="text-muted-foreground"> ({unanswered} unanswered)</span>}
          </div>
        </div>

        <div className="mt-2 flex gap-3">
          <Button variant="outline" onClick={() => setView("exam")}>Go to Test</Button>
          <Button disabled={submitting} onClick={() => submit("manual")}>
            {submitting ? "Submitting..." : "Submit Exam"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-muted/30 select-none no-callout">
      <div className="flex items-center justify-center gap-2 bg-primary px-4 py-1 text-center text-sm font-semibold text-primary-foreground sm:px-6">
        <img src={attempt.exam.logoUrl || jcaBadge} alt="" className="size-5 rounded-sm bg-white/90 object-contain p-0.5" />
        {attempt.exam.name}
      </div>
      <header className="flex items-center justify-between border-b bg-background px-4 py-2 sm:px-6">
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            {attempt.student.photoUrl && <AvatarImage src={attempt.student.photoUrl} />}
            <AvatarFallback className="p-0"><PhotoFallback /></AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium leading-tight">{attempt.student.fullName}</p>
            <p className="text-xs text-muted-foreground leading-tight font-mono">{attempt.student.rollNumber}</p>
          </div>
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
      </header>

      {!isOnline && (
        <div className="flex items-center justify-center gap-2 bg-destructive/10 px-4 py-1.5 text-center text-sm font-medium text-destructive">
          <WifiOff className="size-4" /> You're offline — your answers are saved locally and will sync automatically.
        </div>
      )}
      {isOnline && pendingIds.size > 0 && (
        <div className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-center text-sm font-medium text-warning-foreground">
          <RefreshCw className="size-4 animate-spin" /> Syncing {pendingIds.size} answer{pendingIds.size === 1 ? "" : "s"}...
        </div>
      )}
      {fullscreenWarning && (
        <div className="bg-destructive/10 px-4 py-1.5 text-center text-sm font-medium text-destructive">
          Warning: exiting fullscreen again will auto-submit your exam.
        </div>
      )}

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
              {activeSectionData.label} — Question {currentIndex + 1} of {activeSectionData.questions.length} · {question.marks} mark{question.marks === 1 ? "" : "s"}
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
                <Button onClick={() => setView("confirm")}>
                  Done Exam
                </Button>
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
