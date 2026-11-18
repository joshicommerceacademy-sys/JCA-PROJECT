import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { adminApi } from "@/api/adminApi"
import type { Student, Exam } from "@/api/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"

export default function CentreCandidateReports() {
  const navigate = useNavigate()
  const studentsQuery = useQuery<Student[]>({ queryKey: ["students", "centre-report"], queryFn: () => adminApi.students.list() })
  const examsQuery = useQuery<Exam[]>({ queryKey: ["exams"], queryFn: () => adminApi.exams.list() })
  const rows = useMemo(() => {
    const students = studentsQuery.data || []
    const exams = examsQuery.data || []
    return exams.flatMap(exam => {
      const grouped = new Map<string, Student[]>()
      students.filter(s => Number(s.exam_id) === Number(exam.id)).forEach(s => {
        const key = s.centre_name || "Centre not assigned"
        grouped.set(key, [...(grouped.get(key) || []), s])
      })
      return [...grouped.entries()].map(([centre, list]) => ({
        examId: exam.id, examName: exam.name, centre, date: exam.exam_date, time: exam.start_time,
        total: list.length,
        male: list.filter(s => (s.gender || "").toLowerCase() === "male").length,
        female: list.filter(s => (s.gender || "").toLowerCase() === "female").length,
        other: list.filter(s => !["male", "female"].includes((s.gender || "").toLowerCase())).length,
      }))
    })
  }, [studentsQuery.data, examsQuery.data])
  return <Card><CardHeader><CardTitle>Centre-wise Candidate Report</CardTitle></CardHeader><CardContent>
    {studentsQuery.isLoading || examsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading reports…</p> :
    <div className="overflow-x-auto"><Table><TableHeader><TableRow>
      <TableHead>Centre Name</TableHead><TableHead>Exam</TableHead><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Total</TableHead><TableHead>Male</TableHead><TableHead>Female</TableHead><TableHead>Other</TableHead><TableHead>Live Monitor</TableHead>
    </TableRow></TableHeader><TableBody>{rows.map((r, i) => <TableRow key={`${r.examId}-${r.centre}-${i}`}>
      <TableCell><Button variant="link" className="h-auto p-0" onClick={() => navigate(`/admin/live-monitor?examId=${r.examId}`)}>{r.centre}</Button></TableCell>
      <TableCell>{r.examName}</TableCell><TableCell>{String(r.date).slice(0,10)}</TableCell><TableCell>{r.time}</TableCell>
      <TableCell>{r.total}</TableCell><TableCell>{r.male}</TableCell><TableCell>{r.female}</TableCell><TableCell>{r.other}</TableCell>
      <TableCell><Button size="sm" variant="outline" onClick={() => navigate(`/admin/live-monitor?examId=${r.examId}`)}>Open</Button></TableCell>
    </TableRow>)}</TableBody></Table></div>}
    {!studentsQuery.isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground">No candidate records found for scheduled exams.</p>}
  </CardContent></Card>
}
