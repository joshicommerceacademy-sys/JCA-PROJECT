import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Users, PlayCircle, CheckCircle2, Flag, Radio, Search, ArrowUp, ArrowDown, ArrowUpDown, OctagonAlert, RotateCcw,
} from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { MonitorCandidate, Exam } from "@/api/types"
import { getLiveWindowState, type LiveWindowState } from "@/lib/examWindow"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const FLAGGED_REASONS = new Set(["tab_switch", "devtools", "fullscreen_exit"])
const WINDOW_PRIORITY: Record<LiveWindowState, number> = { live: 0, upcoming: 1, ended: 2 }

type StatusFilter = "all" | "not_started" | "in_progress" | "stopped" | "submitted" | "flagged"
type SortKey = "roll_number" | "progress" | "time_left"

function formatDuration(ms: number) {
  if (ms <= 0) return "0:00"
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

// "stopped" = the attempt was live (in_progress) but its window fully elapsed without ever
// reaching a proper submission — abandoned mid-exam (crash, power failure, lost connection...).
// These are exactly the candidates the Reappear page picks up.
function statusOf(c: MonitorCandidate, now: number) {
  if (c.attempt_status === "submitted") return "submitted" as const
  if (c.attempt_status === "in_progress") {
    if (c.ends_at && new Date(c.ends_at).getTime() <= now) return "stopped" as const
    return "in_progress" as const
  }
  return "not_started" as const
}

function isFlagged(c: MonitorCandidate) {
  return !!c.submit_reason && FLAGGED_REASONS.has(c.submit_reason)
}

function windowBadge(state: LiveWindowState) {
  if (state === "live") return <Badge variant="destructive">LIVE</Badge>
  if (state === "upcoming") return <Badge variant="outline">Upcoming</Badge>
  return <Badge variant="secondary">Ended</Badge>
}

function SortButton({
  label, active, dir, onClick,
}: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label} <Icon className="size-3.5" />
    </button>
  )
}

export default function LiveMonitor() {
  const queryClient = useQueryClient()
  const { data: exams } = useQuery({ queryKey: ["exams"], queryFn: adminApi.exams.list })
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: adminApi.settings.get })
  const showIpColumn = !!settings?.ip_capture_enabled
  const [examId, setExamId] = React.useState<string>("")
  const [now, setNow] = React.useState(() => Date.now())
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
  const [sortKey, setSortKey] = React.useState<SortKey>("roll_number")
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc")

  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const sortedExams = React.useMemo(() => {
    if (!exams) return [] as (Exam & { windowState: LiveWindowState })[]
    return exams
      .map((e) => ({ ...e, windowState: getLiveWindowState(e, now) }))
      .sort((a, b) => WINDOW_PRIORITY[a.windowState] - WINDOW_PRIORITY[b.windowState])
    // Re-sorting every tick would reorder the dropdown under the admin's cursor — only
    // recompute when the exam list itself changes, not on every `now` tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exams])

  React.useEffect(() => {
    if (examId || sortedExams.length === 0) return
    setExamId(String(sortedExams[0].id))
  }, [sortedExams, examId])

  const { data, isLoading } = useQuery({
    queryKey: ["monitor", examId],
    queryFn: () => adminApi.monitor.get(examId),
    enabled: !!examId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })

  // Quick action: grant a reappear right from the Stopped row, instead of making the admin
  // leave this page and re-find the same candidate on the Reappear page. Reuses the same
  // endpoint — the backend still auto-detects the correct remaining time server-side.
  const grantReappearMutation = useMutation({
    mutationFn: ({ studentId }: { studentId: number; name: string }) =>
      adminApi.reappear.create({ studentId, examId: Number(examId) }),
    onSuccess: (result, { name }) => {
      queryClient.invalidateQueries({ queryKey: ["monitor", examId] })
      toast.success(`Reappear granted for ${name} — ${result.remainingMinutes} min remaining`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function grantReappear(c: MonitorCandidate) {
    if (!confirm(`Grant reappear for ${c.full_name} (${c.roll_number})? They'll be able to log back in and resume with their remaining time.`)) return
    grantReappearMutation.mutate({ studentId: c.id, name: c.full_name })
  }

  // Real-time alerts: diff each poll against the previous one and toast on genuinely new
  // events (a candidate just got flagged, or one just went from in-progress to stopped) —
  // not on every poll, and not when switching exams.
  const prevStatesRef = React.useRef<Map<number, { flagged: boolean; stopped: boolean }> | null>(null)
  const prevExamIdRef = React.useRef<string>("")
  React.useEffect(() => {
    if (!data) return
    const isFirstLoadForThisExam = prevExamIdRef.current !== examId
    prevExamIdRef.current = examId
    const prevStates = isFirstLoadForThisExam ? null : prevStatesRef.current
    const nextStates = new Map<number, { flagged: boolean; stopped: boolean }>()

    for (const c of data.candidates) {
      const flagged = isFlagged(c)
      const stopped = statusOf(c, Date.now()) === "stopped"
      nextStates.set(c.id, { flagged, stopped })

      if (prevStates) {
        const prev = prevStates.get(c.id)
        if (flagged && !prev?.flagged) {
          toast.warning(`${c.full_name} (${c.roll_number}) flagged: ${c.submit_reason?.replace("_", " ")}`)
        }
        if (stopped && !prev?.stopped) {
          toast.error(`${c.full_name} (${c.roll_number}) stopped without submitting — needs reappear.`)
        }
      }
    }
    prevStatesRef.current = nextStates
  }, [data, examId])

  const list = data?.candidates || []
  const notStarted = list.filter((c) => statusOf(c, now) === "not_started").length
  const inProgress = list.filter((c) => statusOf(c, now) === "in_progress").length
  const stopped = list.filter((c) => statusOf(c, now) === "stopped").length
  const submitted = list.filter((c) => statusOf(c, now) === "submitted").length
  const flagged = list.filter(isFlagged).length

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = list.filter((c) => {
      if (q && !c.roll_number.toLowerCase().includes(q) && !c.full_name.toLowerCase().includes(q)) return false
      if (statusFilter === "flagged") return isFlagged(c)
      if (statusFilter !== "all") return statusOf(c, now) === statusFilter
      return true
    })

    const remaining = (c: MonitorCandidate) => (c.ends_at ? new Date(c.ends_at).getTime() - now : -Infinity)
    rows = [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === "roll_number") cmp = a.roll_number.localeCompare(b.roll_number)
      else if (sortKey === "progress") cmp = a.answered_count - b.answered_count
      else cmp = remaining(a) - remaining(b)
      return sortDir === "asc" ? cmp : -cmp
    })
    return rows
  }, [list, search, statusFilter, sortKey, sortDir, now])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const selectedExam = sortedExams.find((e) => String(e.id) === examId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Radio className="size-5 text-destructive" />
          Live Exam Monitor
        </h1>
        <p className="text-sm text-muted-foreground">
          Real-time view of every allowed candidate for this exam — refreshes every few seconds
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-xs flex-1 min-w-48">
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select exam" /></SelectTrigger>
            <SelectContent>
              {sortedExams.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  <span className="flex items-center gap-2">
                    {e.name}
                    {e.windowState === "live" && <span className="size-1.5 rounded-full bg-destructive" />}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedExam && windowBadge(selectedExam.windowState)}
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></div>
          <div><p className="text-xl font-semibold">{list.length}</p><p className="text-xs text-muted-foreground">Total Candidates</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground"><PlayCircle className="size-5" /></div>
          <div><p className="text-xl font-semibold">{inProgress}</p><p className="text-xs text-muted-foreground">In Progress</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><OctagonAlert className="size-5" /></div>
          <div><p className="text-xl font-semibold">{stopped}</p><p className="text-xs text-muted-foreground">Stopped (needs reappear)</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success"><CheckCircle2 className="size-5" /></div>
          <div><p className="text-xl font-semibold">{submitted}</p><p className="text-xs text-muted-foreground">Submitted</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Flag className="size-5" /></div>
          <div><p className="text-xl font-semibold">{flagged}</p><p className="text-xs text-muted-foreground">Flagged (auto-submitted)</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base shrink-0">
            Candidates{notStarted > 0 ? ` · ${notStarted} not started yet` : ""}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roll no / name"
                className="h-8 w-48 pl-8 text-sm"
              />
            </div>
            {([
              ["all", "All"],
              ["not_started", "Not Started"],
              ["in_progress", "In Progress"],
              ["stopped", "Stopped"],
              ["submitted", "Submitted"],
              ["flagged", "Flagged"],
            ] as [StatusFilter, string][]).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={statusFilter === key ? "default" : "outline"}
                className="h-8"
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortButton label="Roll No" active={sortKey === "roll_number"} dir={sortDir} onClick={() => toggleSort("roll_number")} /></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><SortButton label="Progress" active={sortKey === "progress"} dir={sortDir} onClick={() => toggleSort("progress")} /></TableHead>
                <TableHead><SortButton label="Time Left" active={sortKey === "time_left"} dir={sortDir} onClick={() => toggleSort("time_left")} /></TableHead>
                <TableHead>Flag</TableHead>
                {showIpColumn && <TableHead>IP Address</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={showIpColumn ? 9 : 8} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && list.length === 0 && (
                <TableRow><TableCell colSpan={showIpColumn ? 9 : 8} className="text-center text-muted-foreground">No allowed candidates for this exam yet.</TableCell></TableRow>
              )}
              {!isLoading && list.length > 0 && visible.length === 0 && (
                <TableRow><TableCell colSpan={showIpColumn ? 9 : 8} className="text-center text-muted-foreground">No candidates match this search/filter.</TableCell></TableRow>
              )}
              {visible.map((c) => {
                const status = statusOf(c, now)
                const totalQuestions = data?.exam.questionCount ?? 0
                const remainingMs = c.ends_at ? new Date(c.ends_at).getTime() - now : null
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.roll_number}</TableCell>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell>{c.centre_name || "—"}</TableCell>
                    <TableCell>
                      {status === "submitted" && <Badge variant="success">Submitted</Badge>}
                      {status === "in_progress" && <Badge variant="warning">In Progress</Badge>}
                      {status === "stopped" && <Badge variant="destructive"><OctagonAlert /> Stopped</Badge>}
                      {status === "not_started" && <Badge variant="outline">Not Started</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {status === "not_started" ? "—" : `${c.answered_count} / ${totalQuestions}`}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {status === "in_progress" && remainingMs !== null
                        ? formatDuration(remainingMs)
                        : status === "stopped"
                          ? <span className="text-destructive">needs reappear</span>
                          : "—"}
                    </TableCell>
                    <TableCell>
                      {isFlagged(c) ? (
                        <Badge variant="destructive">
                          <Flag /> {c.submit_reason!.replace("_", " ")}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    {showIpColumn && (
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.ip_address || "—"}</TableCell>
                    )}
                    <TableCell className="text-right">
                      {status === "stopped" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={grantReappearMutation.isPending}
                          onClick={() => grantReappear(c)}
                        >
                          <RotateCcw className="size-3.5" /> Grant Reappear
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
