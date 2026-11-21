import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, RotateCcw } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { MonitorCandidate } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function timeLeft(c: MonitorCandidate, now: number) {
  if (!c.ends_at) return "—"
  const ms = new Date(c.ends_at).getTime() - now
  if (ms <= 0) return "0:00"
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`
}

function lastActivity(c: MonitorCandidate, now: number) {
  const at = c.last_activity_at || c.started_at
  if (!at) return "—"
  const diff = Math.max(0, Math.floor((now - new Date(at).getTime()) / 1000))
  const when = new Date(at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  if (diff < 60) return `${when} (${diff}s ago)`
  return `${when} (${Math.floor(diff / 60)} min ago)`
}

// Candidates whose exam is running right now, with a Restart Exam button per row. Restart stops that
// candidate's exam on the spot, sends their device back to the roll-number login page and puts them on
// Reappear (their roll number shows on the login list again, with the time they had left).
export default function RestartExam() {
  const [params] = useSearchParams()
  const examId = params.get("examId") || ""
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const [target, setTarget] = React.useState<MonitorCandidate | null>(null)
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ["monitor", examId],
    queryFn: () => adminApi.monitor.get(examId),
    enabled: !!examId,
    refetchInterval: 5000,
  })

  const restartMutation = useMutation({
    mutationFn: (studentId: number) => adminApi.monitor.restart(studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitor", examId] })
      toast.success("Exam stopped. Grant Reappear from the Reappear page when the candidate may continue.")
      setTarget(null)
    },
    onError: (error) => { toast.error(getErrorMessage(error)); setTarget(null) },
  })

  const needle = search.trim().toLowerCase()
  const live = (data?.candidates || []).filter(
    (c) =>
      c.attempt_status === "in_progress" && !c.has_reappear && !c.force_stopped_at && (!c.ends_at || new Date(c.ends_at).getTime() > now) &&
      (!needle || c.full_name.toLowerCase().includes(needle) || c.roll_number.toLowerCase().includes(needle))
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Restart Exam</h1>
          <p className="text-sm text-muted-foreground">{data?.exam.name || "Live exam"} — candidates whose exam is running right now</p>
        </div>
        <Button asChild variant="outline"><Link to={`/admin/live-monitor?examId=${examId}`}><ArrowLeft className="size-4" /> Back to Live Monitor</Link></Button>
      </div>

      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Live candidates ({live.length})</CardTitle>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search roll no / name" className="h-8 w-56 text-sm" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate Name</TableHead>
                  <TableHead>Roll Number</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Time Left</TableHead>
                  <TableHead className="text-right">Restart Exam</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>}
                {!isLoading && live.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No candidate is taking the exam right now.</TableCell></TableRow>
                )}
                {live.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell className="font-mono">{c.roll_number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lastActivity(c, now)}</TableCell>
                    <TableCell className="font-mono">{timeLeft(c, now)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="destructive" onClick={() => setTarget(c)}><RotateCcw className="size-3.5" /> Restart Exam</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restart exam for {target?.full_name}?</DialogTitle>
            <DialogDescription>
              {target?.roll_number} — the exam is stopped on the spot and their screen goes back to the login page. Nothing else
              happens automatically: the clock is paused and they appear on the Reappear page, where you grant Reappear when they may
              continue (with the time they had left; saved answers are kept).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={restartMutation.isPending} onClick={() => target && restartMutation.mutate(target.id)}>
              {restartMutation.isPending ? "Restarting..." : "Restart Exam"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
