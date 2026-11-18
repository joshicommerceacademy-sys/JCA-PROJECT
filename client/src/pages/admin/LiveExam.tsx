import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams, Link } from "react-router-dom"
import { UserRound, CheckCircle2, Timer, Monitor, ArrowLeft, OctagonX } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { formatDate } from "@/lib/formatDate"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export default function LiveExam() {
  const navigate = useNavigate()
  const { examId = "" } = useParams()
  const { data: monitor, isLoading: monitorLoading } = useQuery({
    queryKey: ["dashboard-live-detail", examId],
    queryFn: () => adminApi.monitor.get(examId),
    enabled: !!examId,
    refetchInterval: 10000,
  })
  const candidates = monitor?.candidates || []
  const male = candidates.filter(c => (c.gender || "").toLowerCase() === "male").length
  const female = candidates.filter(c => (c.gender || "").toLowerCase() === "female").length
  const other = candidates.length - male - female
  const appearing = candidates.filter(c => c.attempt_status === "in_progress").length
  const appeared = candidates.filter(c => c.attempt_status === "submitted").length
  const notLoggedIn = candidates.filter(c => !c.attempt_status).length
  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">Live Exam</h1><p className="text-sm text-muted-foreground">Complete exam data and real-time candidate status</p></div>
      <Button asChild variant="outline"><Link to="/admin/dashboard"><ArrowLeft className="size-4" /> Back to Dashboard</Link></Button>
    </div>
        <Card><CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2"><span>{monitor?.exam.name || "Live Exam Details"}</span><span className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={() => navigate(`/admin/live-monitor?examId=${examId}`)}><Monitor className="size-4" /> Open Full Live Monitor</Button><Button size="sm" variant="destructive" onClick={() => navigate(`/admin/live-exam/${examId}/stop`)}><OctagonX className="size-4" /> Stop Exam</Button></span></CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
      {monitorLoading ? <Skeleton className="h-20 w-full" /> : <>
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-4 text-sm md:grid-cols-4">
          <div><p className="text-muted-foreground">Exam</p><p className="font-medium">{monitor?.exam.name}</p></div>
          <div><p className="text-muted-foreground">Date & Time</p><p className="font-medium">{monitor && formatDate(monitor.exam.examDate)} · {monitor?.exam.startTime}</p></div>
          <div><p className="text-muted-foreground">Duration</p><p className="font-medium">{monitor?.exam.durationMinutes} min</p></div>
          <div><p className="text-muted-foreground">Total Questions</p><p className="font-medium">{monitor?.exam.questionCount}</p></div>
          <div className="col-span-2 md:col-span-4"><p className="text-muted-foreground">Centres</p>
            {(monitor?.centres || []).length === 0 && <p className="font-medium">—</p>}
            {(monitor?.centres || []).map((c) => <p key={c.name} className="font-medium">{c.name} · {c.city || "—"} · {c.address || "—"} · Capacity {c.capacity}</p>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total Candidates</p><p className="text-2xl font-semibold">{candidates.length}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Male</p><p className="text-2xl font-semibold">{male}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Female</p><p className="text-2xl font-semibold">{female}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Other</p><p className="text-2xl font-semibold">{other}</p></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border p-3"><Timer className="size-5 text-success"/><div><p className="text-xs text-muted-foreground">Appearing</p><p className="text-xl font-semibold">{appearing}</p></div></div>
          <div className="flex items-center gap-3 rounded-lg border p-3"><CheckCircle2 className="size-5 text-primary"/><div><p className="text-xs text-muted-foreground">Appeared</p><p className="text-xl font-semibold">{appeared}</p></div></div>
          <div className="flex items-center gap-3 rounded-lg border p-3"><UserRound className="size-5 text-muted-foreground"/><div><p className="text-xs text-muted-foreground">Not Logged In</p><p className="text-xl font-semibold">{notLoggedIn}</p></div></div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Roll No</th><th className="p-2">Candidate</th><th className="p-2">Centre</th><th className="p-2">Seat</th><th className="p-2">IP Address</th><th className="p-2">Attendance</th></tr></thead><tbody>
          {candidates.map(c => <tr key={c.id} className="border-b"><td className="p-2 font-mono">{c.roll_number}</td><td className="p-2">{c.full_name}</td><td className="p-2">{c.centre_name || "—"}</td><td className="p-2 font-mono">{c.seat_number || "—"}</td><td className="p-2 font-mono">{c.ip_address || "—"}</td><td className="p-2">{c.attempt_status === "in_progress" ? <Badge variant="success">Appearing</Badge> : c.attempt_status === "submitted" ? <Badge variant="secondary">Appeared</Badge> : <Badge variant="outline">Not Logged In</Badge>}</td></tr>)}
        </tbody></table></div>
      </>}
    </CardContent></Card>
  </div>
}
