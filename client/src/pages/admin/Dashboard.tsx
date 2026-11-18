import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Radio, CalendarDays, Clock3 } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { formatDate } from "@/lib/formatDate"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: exams, isLoading } = useQuery({ queryKey: ["exams"], queryFn: () => adminApi.exams.list(), refetchInterval: 15000 })
  // Live = started by the admin, not stopped, and still within 2 days of starting (an exam nobody
  // stopped stays listed as live for 2 days, then drops off).
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000
  const live = (exams || []).filter((e) => {
    if (e.stopped_at || e.status === "cancelled" || e.status === "completed") return false
    if (!e.started_at) return false
    return Date.now() - new Date(e.started_at).getTime() < TWO_DAYS
  })
  // One block per exam; each live batch is its own row with its start time.
  const groups = Object.values(live.reduce<Record<string, typeof live>>((acc, e) => {
    const key = String(e.registered_exam_id ?? e.name)
    ;(acc[key] ||= []).push(e)
    return acc
  }, {})).map((batches) => batches.sort((x, y) => `${String(x.exam_date).slice(0, 10)} ${x.start_time}`.localeCompare(`${String(y.exam_date).slice(0, 10)} ${y.start_time}`)))
  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1><p className="text-sm text-muted-foreground">Live examinations and real-time candidate status</p></div></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Radio className="size-5 text-success" /> Live Exams ({live.length})</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && live.length === 0 && <p className="text-sm text-muted-foreground">सध्या कोणतीही परीक्षा सुरू नाही.</p>}
        {groups.map((batches) => <div key={batches[0].id} className="flex flex-col gap-2 rounded-lg border p-4">
          <p className="font-semibold">{batches[0].name}</p>
          <div className="flex flex-col gap-2">
            {batches.map((exam) => <button key={exam.id} type="button" onClick={() => navigate(`/admin/live-exam/${exam.id}`)} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50">
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{formatDate(exam.exam_date)}</span><span className="flex items-center gap-1 font-mono text-foreground"><Clock3 className="size-3.5" />{String(exam.start_time).slice(0, 5)}</span></div>
              <Badge variant="success">LIVE · View batch</Badge>
            </button>)}
          </div>
        </div>)}
      </CardContent></Card>
  </div>
}
