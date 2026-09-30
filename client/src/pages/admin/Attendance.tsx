import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Users, UserCheck, UserX, CheckCircle2, LogIn, LogOut, Download } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import { formatDate, formatDateTimeWithSeconds } from "@/lib/formatDate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

export default function Attendance() {
  const queryClient = useQueryClient()
  const { data: exams } = useQuery({ queryKey: ["exams"], queryFn: adminApi.exams.list })
  const [examId, setExamId] = React.useState<string>("")
  const [selected, setSelected] = React.useState<number[]>([])

  React.useEffect(() => {
    if (!examId && exams && exams.length > 0) setExamId(String(exams[0].id))
  }, [exams, examId])

  const { data: rows, isLoading } = useQuery({
    queryKey: ["attendance", { examId }],
    queryFn: () => adminApi.attendance.list(examId ? { examId } : undefined),
    enabled: !!examId,
    refetchInterval: 15000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["attendance"] })
    setSelected([])
  }

  const checkInMutation = useMutation({
    mutationFn: (id: number) => adminApi.students.checkIn(id),
    onSuccess: () => { invalidate(); toast.success("Student checked in") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const checkOutMutation = useMutation({
    mutationFn: (id: number) => adminApi.students.checkOut(id),
    onSuccess: () => { invalidate(); toast.success("Check-in undone") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const bulkCheckInMutation = useMutation({
    mutationFn: () => adminApi.students.bulkCheckIn(selected),
    onSuccess: () => { invalidate(); toast.success("Selected students checked in") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const selectedExam = exams?.find((e) => String(e.id) === examId)

  async function downloadReport() {
    if (!examId || !selectedExam) return
    try {
      const res = await adminApi.attendance.downloadReport(examId)
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `attendance-report-${selectedExam.name.replace(/\s+/g, "-")}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const list = rows || []
  const checkedIn = list.filter((r) => r.checked_in_at).length
  const notCheckedIn = list.length - checkedIn
  const submitted = list.filter((r) => r.submitted_at).length

  function toggleAll(checked: boolean) {
    setSelected(checked ? list.filter((r) => !r.checked_in_at).map((r) => r.id) : [])
  }
  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((i) => i !== id)))
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Candidates are marked checked in automatically as soon as they're Allowed on the
          Verification page. Use Undo/Check In here only if you want the timestamp to reflect
          when they actually arrived instead.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-xs flex-1">
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select exam" /></SelectTrigger>
            <SelectContent>
              {exams?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedExam && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Scheduled start: {formatDate(selectedExam.exam_date)} at {selectedExam.start_time}
            </p>
          )}
        </div>
        <Button variant="outline" disabled={!examId || list.length === 0} onClick={downloadReport}>
          <Download /> Download Attendance Report
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></div>
          <div><p className="text-xl font-semibold">{list.length}</p><p className="text-xs text-muted-foreground">Scheduled</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success"><UserCheck className="size-5" /></div>
          <div><p className="text-xl font-semibold">{checkedIn}</p><p className="text-xs text-muted-foreground">Checked In</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground"><UserX className="size-5" /></div>
          <div><p className="text-xl font-semibold">{notCheckedIn}</p><p className="text-xs text-muted-foreground">Not Checked In</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary"><CheckCircle2 className="size-5" /></div>
          <div><p className="text-xl font-semibold">{submitted}</p><p className="text-xs text-muted-foreground">Submitted</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Candidates</CardTitle>
          {selected.length > 0 && (
            <Button size="sm" onClick={() => bulkCheckInMutation.mutate()}>
              <LogIn /> Check In ({selected.length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={list.some((r) => !r.checked_in_at) && selected.length === list.filter((r) => !r.checked_in_at).length}
                    onCheckedChange={(c) => toggleAll(!!c)}
                  />
                </TableHead>
                <TableHead>Roll No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Standard</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Access Granted</TableHead>
                <TableHead>Login Time</TableHead>
                <TableHead>Submit Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && list.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No candidates allowed for this exam.</TableCell></TableRow>
              )}
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {!r.checked_in_at && (
                      <Checkbox checked={selected.includes(r.id)} onCheckedChange={(c) => toggleOne(r.id, !!c)} />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.roll_number}</TableCell>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell>{r.centre_name || "—"}</TableCell>
                  <TableCell>{r.standard_name || "—"}</TableCell>
                  <TableCell>
                    {r.submitted_at ? (
                      <Badge variant="success">Submitted</Badge>
                    ) : r.started_at ? (
                      <Badge variant="warning">In Progress</Badge>
                    ) : (
                      <Badge variant="outline">Not Started</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.checked_in_at ? formatDateTimeWithSeconds(r.checked_in_at) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.started_at ? formatDateTimeWithSeconds(r.started_at) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.submitted_at ? formatDateTimeWithSeconds(r.submitted_at) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.checked_in_at ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!r.started_at}
                        title={r.started_at ? "Can't undo after the exam has started" : undefined}
                        onClick={() => checkOutMutation.mutate(r.id)}
                      >
                        <LogOut /> Undo
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => checkInMutation.mutate(r.id)}>
                        <LogIn /> Check In
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
