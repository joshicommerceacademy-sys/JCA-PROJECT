import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Users, UserCheck, UserX, CheckCircle2, Download, MousePointerClick } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import { formatDate, formatDateTimeWithSeconds } from "@/lib/formatDate"
import { examLabel } from "@/lib/examLabel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const ALL_ROLLS = "__all__"

export default function Attendance() {
  const { data: exams } = useQuery({ queryKey: ["exams"], queryFn: () => adminApi.exams.list() })
  const [examId, setExamId] = React.useState<string>("")
  const [roll, setRoll] = React.useState<string>(ALL_ROLLS)

  React.useEffect(() => {
    if (!examId && exams && exams.length > 0) setExamId(String(exams[0].id))
  }, [exams, examId])

  const { data: rows, isLoading } = useQuery({
    queryKey: ["attendance", { examId }],
    queryFn: () => adminApi.attendance.list(examId ? { examId } : undefined),
    enabled: !!examId,
    refetchInterval: 5000,
  })

  const selectedExam = exams?.find((e) => String(e.id) === examId)

  // Batches of the selected exam (same registered exam / same name), earliest first.
  const batches = (exams || [])
    .filter((e) => selectedExam && (selectedExam.registered_exam_id != null ? e.registered_exam_id === selectedExam.registered_exam_id : e.name === selectedExam.name))
    .sort((x, y) => `${String(x.exam_date).slice(0, 10)} ${x.start_time}`.localeCompare(`${String(y.exam_date).slice(0, 10)} ${y.start_time}`))
  const multiBatch = batches.length > 1
  const [batchPopup, setBatchPopup] = React.useState(false)
  // The report is offered only after the exam (batch) has been stopped.
  const reportReady = multiBatch ? batches.some((b) => b.stopped_at) : !!selectedExam?.stopped_at

  async function downloadReport(target = selectedExam) {
    if (!target) return
    try {
      const res = await adminApi.attendance.downloadReport(String(target.id))
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `attendance-report-${target.name.replace(/\s+/g, "-")}${multiBatch ? `-${String(target.start_time).slice(0, 5).replace(":", "")}` : ""}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setBatchPopup(false)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const all = rows || []
  const list = roll === ALL_ROLLS ? all : all.filter((r) => r.roll_number === roll)
  const loggedIn = all.filter((r) => r.login_at).length
  const notLoggedIn = all.length - loggedIn
  const rollSelected = all.filter((r) => r.roll_selected_at).length
  const submitted = all.filter((r) => r.submitted_at).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Candidates appear here once they are granted access at the Verification Desk. A roll number is
          recorded the moment a candidate selects and submits it on the login page; login time is recorded
          when they submit their password.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-1.5 sm:w-64">
          <Label>Select Exam Name</Label>
          <Select value={examId} onValueChange={(v) => { setExamId(v); setRoll(ALL_ROLLS) }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select exam" /></SelectTrigger>
            <SelectContent>
              {exams?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{examLabel(e, exams)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-48 flex-col gap-1.5">
          <Label>Select Roll Number</Label>
          <Select value={roll} onValueChange={setRoll} disabled={!all.length}>
            <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ROLLS}>All roll numbers</SelectItem>
              {all.map((r) => <SelectItem key={r.id} value={r.roll_number}>{r.roll_number}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {reportReady && (
          <Button onClick={() => (multiBatch ? setBatchPopup(true) : downloadReport())}>
            <Download /> Download Attendance Report
          </Button>
        )}
        {selectedExam && (
          <p className="text-xs text-muted-foreground">
            Scheduled start: {formatDate(selectedExam.exam_date)} at {selectedExam.start_time}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></div>
          <div><p className="text-xl font-semibold">{all.length}</p><p className="text-xs text-muted-foreground">Access Granted</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground"><MousePointerClick className="size-5" /></div>
          <div><p className="text-xl font-semibold">{rollSelected}</p><p className="text-xs text-muted-foreground">Roll No. Selected</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success"><UserCheck className="size-5" /></div>
          <div><p className="text-xl font-semibold">{loggedIn}</p><p className="text-xs text-muted-foreground">Logged In</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground"><UserX className="size-5" /></div>
          <div><p className="text-xl font-semibold">{notLoggedIn}</p><p className="text-xs text-muted-foreground">Not Logged In</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary"><CheckCircle2 className="size-5" /></div>
          <div><p className="text-xl font-semibold">{submitted}</p><p className="text-xs text-muted-foreground">Submitted</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Candidates</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sr. No.</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Captured IP Address</TableHead>
                <TableHead>Roll No</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Standard</TableHead>
                <TableHead>Seat No.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Access Granted</TableHead>
                <TableHead>Roll Selected</TableHead>
                <TableHead>Login Time</TableHead>
                <TableHead>Submit Time</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && list.length === 0 && (
                <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground">No candidates have been granted access for this exam yet.</TableCell></TableRow>
              )}
              {list.map((r, index) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{index + 1}</TableCell>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="font-mono text-xs">{r.ip_address || "Not captured"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.roll_number}</TableCell>
                  <TableCell>{r.centre_name || "—"}</TableCell>
                  <TableCell>{r.standard_name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.seat_number || ""}
                    {r.seat_number && r.lab_name ? <span className="block font-sans text-[10px] text-muted-foreground">{r.lab_name}</span> : null}
                  </TableCell>
                  <TableCell>
                    {r.absent ? (
                      <Badge variant="destructive">Absent</Badge>
                    ) : r.submitted_at ? (
                      <Badge variant="success">Appeared</Badge>
                    ) : r.started_at ? (
                      <Badge variant="warning">Appearing</Badge>
                    ) : r.login_at ? (
                      <Badge variant="outline">Logged In</Badge>
                    ) : r.roll_selected_at ? (
                      <Badge variant="warning">Roll Selected</Badge>
                    ) : (
                      <Badge variant="outline">Not Logged In</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.access_at ? formatDateTimeWithSeconds(r.access_at) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.roll_selected_at ? formatDateTimeWithSeconds(r.roll_selected_at) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.login_at ? formatDateTimeWithSeconds(r.login_at) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.submitted_at ? formatDateTimeWithSeconds(r.submitted_at) : "—"}
                  </TableCell>
                  <TableCell className="max-w-64 text-xs">
                    {r.remarks ? (
                      <div className="flex flex-col items-start gap-1">
                        {r.remarks.split("; ").map((remark) => (
                          // "Late entry" appears only here, in the attendance record.
                          remark.startsWith("Late entry")
                            ? <Badge key={remark} variant="warning">{remark}</Badge>
                            : <span key={remark}>{remark}</span>
                        ))}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.action ? <p className="font-medium text-destructive">{r.action}</p> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={batchPopup} onOpenChange={setBatchPopup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download batch report</DialogTitle>
            <DialogDescription>{selectedExam?.name} runs in several batches. Choose the batch.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {batches.map((b) => (
              <Button key={b.id} variant="outline" className="justify-between" disabled={!b.stopped_at} onClick={() => downloadReport(b)}>
                <span>{formatDate(b.exam_date)} · <span className="font-mono">{String(b.start_time).slice(0, 5)}</span></span>
                <span className="text-xs text-muted-foreground">{b.stopped_at ? "Download" : b.started_at ? "Running" : "Not started"}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
