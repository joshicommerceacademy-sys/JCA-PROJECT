import * as React from "react"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Search } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { api } from "@/api/client"
import type { Exam } from "@/api/types"
import { formatDate } from "@/lib/formatDate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Opened from the highlighted time on the desk's Candidate Data screen: every candidate of this
// exam with roll number, Allow / Disallow status and (when Seating Arrangement is on) their seat.
export default function DeskCandidates() {
  const [searchText, setSearchText] = React.useState("")
  const [params] = useSearchParams()
  const slotId = params.get("slot")
  const stored = React.useMemo<Exam | null>(() => {
    try {
      const raw = localStorage.getItem("jca_desk_exam")
      return localStorage.getItem("jca_desk_token") && raw ? (JSON.parse(raw) as Exam) : null
    } catch {
      return null
    }
  }, [])

  const { data: fresh } = useQuery({
    queryKey: ["desk-exam"],
    queryFn: async () => (await api.get("/desk/login/exam")).data.data as Exam,
    enabled: !!stored,
    refetchInterval: 20000,
  })
  const { data: roster, isLoading } = useQuery({
    queryKey: ["desk-roster", "candidates", slotId],
    queryFn: () => adminApi.students.list(slotId ? { slotId } : undefined),
    enabled: !!stored,
    refetchInterval: 15000,
  })

  if (!stored) return <Navigate to="/desk/login" replace />
  const exam = { ...stored, ...(fresh || {}) }
  const slot = exam.slots?.find((s) => String(s.id) === slotId)
  const seating = !!exam.seat_number_required
  const needle = searchText.trim().toLowerCase()
  const list = (roster || []).filter(
    (c) => !needle || c.full_name.toLowerCase().includes(needle) || (c.roll_number || "").toLowerCase().includes(needle)
  )

  return (
    <div className="mx-auto min-h-svh max-w-5xl bg-background p-4 sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Candidate Data</h1>
            <p className="text-sm text-muted-foreground">
              {exam.name}{(slot?.exam_date || exam.exam_date) ? ` · ${formatDate((slot?.exam_date || exam.exam_date) as string)}` : ""}
              {(slot?.start_time || exam.start_time) ? <> · <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-primary-foreground">{String(slot?.start_time || exam.start_time).slice(0, 5)}</span></> : null}
            </p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/desk"><ArrowLeft className="size-4" /> Back to desk</Link></Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name or roll number…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Status</TableHead>
                  {seating && <TableHead>Seat</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!isLoading && list.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No candidates.</TableCell></TableRow>}
                {list.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.full_name} {s.has_reappear && s.exam_access_allowed && <Badge variant="warning" className="ml-1">Reappear</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.roll_number || "—"}</TableCell>
                    <TableCell>
                      {s.exam_access_allowed ? (
                        <Badge variant="success">Allowed</Badge>
                      ) : s.disallow_reason ? (
                        <Badge variant="destructive">Disallowed</Badge>
                      ) : exam.desk_closed || s.marked_absent ? (
                        <Badge variant="destructive">Absent</Badge>
                      ) : (
                        <Badge variant="outline">Not allowed</Badge>
                      )}
                    </TableCell>
                    {seating && <TableCell className="font-mono text-xs">{s.seat_number || ""}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
