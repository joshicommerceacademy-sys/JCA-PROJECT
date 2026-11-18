import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, FileText, MapPinned, Monitor, Users, Wifi, ClipboardCheck } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import type { Exam, MonitorData, MonitorCandidate } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n")
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }))
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}
function status(c: MonitorCandidate) { return c.attempt_status === "submitted" ? "Appeared" : c.attempt_status === "in_progress" ? "Appearing" : "Not Logged In" }

export default function OperationalReports() {
  const { data: exams = [] } = useQuery<Exam[]>({ queryKey: ["exams"], queryFn: () => adminApi.exams.list() })
  const [examId, setExamId] = React.useState("")
  const [observer, setObserver] = React.useState({ venue: "", room: "", seating: "Compliant", invigilators: "Present", violations: "None", water: "Available", lighting: "Satisfactory", toilets: "Satisfactory", notes: "" })
  React.useEffect(() => { if (!examId && exams.length) setExamId(String(exams[0].id)) }, [exams, examId])
  const { data, isLoading, isError } = useQuery<MonitorData>({ queryKey: ["operational-report-monitor", examId], queryFn: () => adminApi.monitor.get(examId), enabled: !!examId, refetchInterval: 10000 })
  const candidates = data?.candidates ?? []
  const scheduled = Number((data?.exam?.questionCount ?? -1) >= 0 ? exams.find(e => String(e.id) === examId)?.candidate_count ?? candidates.length : candidates.length)
  const present = candidates.filter(c => c.attempt_status === "in_progress" || c.attempt_status === "submitted").length
  const submitted = candidates.filter(c => c.attempt_status === "submitted").length
  const online = candidates.filter(c => c.attempt_status === "in_progress").length
  const selectedExam = exams.find(e => String(e.id) === examId)
  const venue = selectedExam?.centre_name || "Multiple / not specified"
  const liveState = !selectedExam ? "Unknown" : selectedExam.status === "ongoing" ? "Started" : selectedExam.status === "completed" ? "Ended" : "Not started"
  const csvCandidates = () => downloadCsv("candidate-attendance.csv", [["Sr No", "Candidate", "Roll Number", "Venue", "Gender", "IP Address", "Status"], ...candidates.map((c, i) => [i + 1, c.full_name, c.roll_number, c.centre_name || venue, "Not available in live-monitor data", c.ip_address || "Not captured", status(c)])])
  const downloadObserver = () => downloadCsv("observer-report.csv", [["Exam", "Venue", "Room", "Seating", "Invigilators", "Disciplinary violations", "Water", "Lighting", "Toilets", "Notes"], [selectedExam?.name || "", observer.venue || venue, observer.room, observer.seating, observer.invigilators, observer.violations, observer.water, observer.lighting, observer.toilets, observer.notes]])
  const seatingRows: (string | number)[][] = [["Seat / Row", "Roll Number", "Candidate Name", "Status"], ...candidates.map((c, i) => [`Row ${Math.floor(i / 5) + 1} / Seat ${(i % 5) + 1}`, c.roll_number, c.full_name, status(c)])]
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-semibold flex items-center gap-2"><Monitor className="size-5"/> Live Service Provider Dashboard</h2><p className="text-sm text-muted-foreground">Live data refreshes every 10 seconds. Export reports as CSV for offline review.</p></div>
      <div className="w-full max-w-sm"><Label>Scheduled Exam</Label><Select value={examId} onValueChange={setExamId}><SelectTrigger><SelectValue placeholder="Select exam"/></SelectTrigger><SelectContent>{exams.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="size-4"/> Scheduled candidates</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{scheduled}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Present / logged in</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{present}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Submitted / Appeared</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{submitted}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wifi className="size-4"/> Active exam attempts</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{online}</CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><MapPinned className="size-5"/> Venue attendance and exam status</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Badge variant={liveState === "Started" ? "default" : "secondary"}>Exam: {liveState}</Badge><Badge variant="outline">Venue: {venue}</Badge><Badge variant="outline">Data received: {isLoading ? "Checking…" : isError ? "Error" : "Connected"}</Badge></div><p className="text-sm text-muted-foreground">Scheduled vs present: {scheduled} vs {present}. Data transmission is represented by successful response from the central monitor API. Individual lab terminal/node heartbeat and terminal-number offline monitoring are not available in the current API, so they are not fabricated here.</p><Button onClick={csvCandidates}><Download className="mr-2 size-4"/>Download Attendance CSV</Button></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-5"/> Invigilator / Observer Report</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div><Label>Venue / Centre</Label><Input value={observer.venue || venue} onChange={e => setObserver(p => ({...p, venue:e.target.value}))}/></div><div><Label>Room / Lab No.</Label><Input value={observer.room} onChange={e => setObserver(p => ({...p, room:e.target.value}))} placeholder="e.g. Lab 1"/></div>{([ ["seating","Seating arrangement",["Compliant","Non-compliant"]], ["invigilators","Invigilators",["Present","Absent"]], ["violations","Disciplinary violations",["None","Reported"]], ["water","Drinking water",["Available","Unavailable"]], ["lighting","Lighting",["Satisfactory","Unsatisfactory"]], ["toilets","Toilets",["Satisfactory","Unsatisfactory"]] ] as const).map(([key,label,opts]) => <div key={key}><Label>{label}</Label><Select value={observer[key]} onValueChange={v => setObserver(p => ({...p,[key]:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{opts.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>)}</div><div><Label>Observer notes / incident details</Label><Textarea value={observer.notes} onChange={e => setObserver(p => ({...p,notes:e.target.value}))} placeholder="Enter observations and incidents"/></div><p className="text-xs text-muted-foreground">This form exports a report file on your device; server-side persistence and observer sign-off are not yet connected.</p><Button onClick={downloadObserver}><Download className="mr-2 size-4"/>Download Observer Report CSV</Button></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-5"/> Room Seating Plan / Candidate-wise Report</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Candidates are laid out row-wise, five seats per row. Gender-wise totals require the gender field to be included in the live-monitor API; it is not present in the current response, so no male/female/other totals are guessed.</p><div className="overflow-x-auto"><Table><TableHeader><TableRow>{seatingRows[0].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={4}>Loading candidates…</TableCell></TableRow> : candidates.length ? candidates.map((c,i)=><TableRow key={c.id}><TableCell>{`Row ${Math.floor(i/5)+1} / Seat ${(i%5)+1}`}</TableCell><TableCell>{c.roll_number}</TableCell><TableCell>{c.full_name}</TableCell><TableCell>{status(c)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4}>No candidate records available for this exam.</TableCell></TableRow>}</TableBody></Table></div><Button variant="outline" onClick={() => downloadCsv("room-seating-plan.csv", seatingRows)}><Download className="mr-2 size-4"/>Download Seating Plan CSV</Button></CardContent></Card>
  </div>
}
