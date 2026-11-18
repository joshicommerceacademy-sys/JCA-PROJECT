import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Trash2, Eye, MoreVertical, EyeOff, Search, Trophy, FileDown, Mail, ArrowLeft, ClipboardList } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { Exam, ExamResult } from "@/api/types"
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog"
import { formatDate, formatDateTime } from "@/lib/formatDate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

export default function Results() {
  const queryClient = useQueryClient()
  const { data: exams } = useQuery<Exam[]>({
    queryKey: ["exams"],
    queryFn: () => adminApi.exams.list(),
  })
  // Step 1: exam names. Step 2: that exam's results (one batch, or every batch together).
  const [selection, setSelection] = React.useState<{ label: string; ids: number[]; multiBatch: boolean } | null>(null)
  const [batchPick, setBatchPick] = React.useState<Exam[] | null>(null)
  const [resultStatus, setResultStatus] = React.useState<string>("all")
  const [search, setSearch] = React.useState("")
  const [viewing, setViewing] = React.useState<ExamResult | null>(null)
  const [selected, setSelected] = React.useState<number[]>([])
  const [confirmTarget, setConfirmTarget] = React.useState<{ type: "single"; id: number } | { type: "bulk"; ids: number[] } | null>(null)

  const { data: results, isLoading } = useQuery<ExamResult[]>({
    queryKey: ["results", { ids: selection?.ids, resultStatus, search }],
    enabled: !!selection,
    queryFn: () =>
      adminApi.results.list({
        ...(selection ? { examIds: selection.ids.join(",") } : {}),
        ...(resultStatus !== "all" ? { resultStatus } : {}),
        ...(search ? { search } : {}),
      }),
  })

  // The list rows don't carry the per-subject breakdown (it'd mean computing it for every
  // row just to view one) — fetched on demand when the detail dialog opens instead.
  const { data: viewingDetail, isLoading: viewingDetailLoading } = useQuery<ExamResult & { answers: unknown[] }>({
    queryKey: ["result-detail", viewing?.id],
    queryFn: () => adminApi.results.get(viewing!.id),
    enabled: !!viewing,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.results.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["results"] })
      toast.success("Result deleted")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  // Enable / disable an exam's results (all of its batches) on the public Results page.
  const [enableFor, setEnableFor] = React.useState<Exam[] | null>(null)
  const [includePdf, setIncludePdf] = React.useState(false)
  const visibilityMutation = useMutation({
    mutationFn: ({ ids, enabled, pdf }: { ids: number[]; enabled: boolean; pdf: boolean }) =>
      adminApi.results.setExamVisibility(ids, enabled, pdf),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["exams"] })
      toast.success(v.enabled ? "Result enabled for candidates" : "Result disabled")
      setEnableFor(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  function openEnableDialog(batches: Exam[]) {
    setIncludePdf(batches.some((b) => b.result_pdf_enabled))
    setEnableFor(batches)
  }

  const sendMutation = useMutation({
    mutationFn: ({ id, confirmPassword }: { id: number; confirmPassword: string }) =>
      adminApi.results.send(id, confirmPassword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["results"] })
      toast.success("Result emailed with answer sheet PDF")
      setConfirmTarget(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const bulkSendMutation = useMutation({
    mutationFn: ({ ids, confirmPassword }: { ids: number[]; confirmPassword: string }) =>
      adminApi.results.bulkSend(ids, confirmPassword),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["results"] })
      setSelected([])
      toast.success(
        `Sent ${result.sentCount} email(s)${result.failedCount ? `, ${result.failedCount} failed` : ""}`
      )
      setConfirmTarget(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function handleConfirm(password: string) {
    if (!confirmTarget) return
    if (confirmTarget.type === "single") sendMutation.mutate({ id: confirmTarget.id, confirmPassword: password })
    else bulkSendMutation.mutate({ ids: confirmTarget.ids, confirmPassword: password })
  }

  const [downloadingId, setDownloadingId] = React.useState<number | null>(null)

  async function downloadPdf(result: ExamResult) {
    setDownloadingId(result.id)
    try {
      const response = await adminApi.results.downloadPdf(result.id)
      const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }))
      const link = document.createElement("a")
      link.href = url
      link.download = `Result-${result.roll_number}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setDownloadingId(null)
    }
  }

  const batchKey = (e: Exam) => `${String(e.exam_date).slice(0, 10)} ${e.start_time}`
  const groups = Object.values((exams || []).reduce<Record<string, Exam[]>>((acc, e) => {
    ;(acc[String(e.registered_exam_id ?? e.name)] ||= []).push(e)
    return acc
  }, {})).map((g) => g.sort((x, y) => batchKey(x).localeCompare(batchKey(y))))

  function openExam(batches: Exam[]) {
    if (!batches.some((b) => b.stopped_at)) return
    if (batches.length > 1) setBatchPick(batches)
    else setSelection({ label: batches[0].name, ids: [batches[0].id], multiBatch: false })
  }
  function pickBatches(batches: Exam[], only?: Exam) {
    const stopped = batches.filter((b) => b.stopped_at)
    const chosen = only ? [only] : stopped
    setSelection({
      label: only ? `${only.name} - ${formatDate(only.exam_date)} ${String(only.start_time).slice(0, 5)}` : `${batches[0].name} - all batches`,
      ids: chosen.map((b) => b.id),
      multiBatch: !only,
    })
    setBatchPick(null)
  }

  const list = results || []
  const passed = list.filter((r) => r.result_status === "passed").length
  const avg = list.length
    ? (list.reduce((sum, r) => sum + Number(r.percentage), 0) / list.length).toFixed(1)
    : "0.0"

  function toggleAll(checked: boolean) {
    setSelected(checked ? list.map((r) => r.id) : [])
  }
  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((i) => i !== id)))
  }

  if (!selection) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
          <p className="text-sm text-muted-foreground">Open an exam to see its results. Results are available after the exam has been stopped.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.length === 0 && <p className="text-sm text-muted-foreground">No exams yet.</p>}
          {groups.map((batches) => {
            const stopped = batches.filter((b) => b.stopped_at).length
            const ready = stopped > 0
            const enabled = batches.some((b) => b.result_enabled)
            const pdfOn = batches.some((b) => b.result_enabled && b.result_pdf_enabled)
            return (
              <div
                key={batches[0].id}
                className={`flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm ${ready ? "" : "opacity-70"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => openExam(batches)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold enabled:hover:text-primary disabled:cursor-not-allowed"
                  >
                    <ClipboardList className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{batches[0].name}</span>
                  </button>
                  <Badge variant={enabled ? "success" : "outline"} className="shrink-0">
                    {enabled ? "Result Enabled" : "Result Disabled"}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-my-1 -mr-2 size-8 shrink-0" title="More options">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={!ready} onClick={() => openEnableDialog(batches)}>
                        <Eye className="size-4" /> {enabled ? "Edit Result Options" : "Enable Result"}
                      </DropdownMenuItem>
                      {enabled && (
                        <DropdownMenuItem
                          disabled={visibilityMutation.isPending}
                          onClick={() => visibilityMutation.mutate({ ids: batches.map((b) => b.id), enabled: false, pdf: false })}
                        >
                          <EyeOff className="size-4" /> Disable Result
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <span className="text-xs text-muted-foreground">
                  {batches.length > 1 ? `${batches.length} batches · ${stopped} stopped` : ready ? "Stopped" : "Not stopped yet"}
                  {enabled ? (pdfOn ? " · PDF download on" : " · PDF download off") : ""}
                </span>
                {!ready && <span className="text-xs text-muted-foreground">Available after the exam is stopped</span>}
              </div>
            )
          })}
        </div>

        <Dialog open={!!enableFor} onOpenChange={(o) => !o && setEnableFor(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Enable Result - {enableFor?.[0]?.name}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Candidates will be able to see their marks, total marks and pass / fail status on the Results page
              by entering their roll number.
            </p>
            <div className="flex items-start gap-2 rounded-lg border p-3">
              <Checkbox id="include-pdf" className="mt-0.5" checked={includePdf} onCheckedChange={(c) => setIncludePdf(!!c)} />
              <Label htmlFor="include-pdf" className="flex flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">Show PDF with all questions</span>
                <span className="text-xs text-muted-foreground">
                  Adds a "Download PDF" button with every question and the candidate's answers. The PDF is never opened automatically.
                </span>
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEnableFor(null)}>Cancel</Button>
              <Button
                disabled={visibilityMutation.isPending}
                onClick={() => enableFor && visibilityMutation.mutate({ ids: enableFor.map((b) => b.id), enabled: true, pdf: includePdf })}
              >
                Enable Result
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!batchPick} onOpenChange={(o) => !o && setBatchPick(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Select batch - {batchPick?.[0]?.name}</DialogTitle></DialogHeader>
            <div className="grid gap-2">
              {(batchPick || []).map((b) => (
                <Button key={b.id} variant="outline" className="justify-between" disabled={!b.stopped_at} onClick={() => pickBatches(batchPick!, b)}>
                  <span>{formatDate(b.exam_date)} · <span className="font-mono">{String(b.start_time).slice(0, 5)}</span></span>
                  <span className="text-xs text-muted-foreground">{b.stopped_at ? "View results" : b.started_at ? "Running" : "Not started"}</span>
                </Button>
              ))}
              <Button className="mt-1" onClick={() => pickBatches(batchPick!)}>All batches (stopped)</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{selection.label}</h1>
          <p className="text-sm text-muted-foreground">Results of this exam</p>
        </div>
        <Button variant="outline" onClick={() => { setSelection(null); setSelected([]) }}><ArrowLeft className="size-4" /> All exams</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-2"><p className="text-2xl font-semibold">{list.length}</p><p className="text-xs text-muted-foreground">Total Results</p></CardContent></Card>
        <Card><CardContent className="pt-2"><p className="text-2xl font-semibold text-success">{passed}</p><p className="text-xs text-muted-foreground">Passed</p></CardContent></Card>
        <Card><CardContent className="pt-2"><p className="text-2xl font-semibold">{avg}%</p><p className="text-xs text-muted-foreground">Average Score</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">Submitted Results</CardTitle>
            {selected.length > 0 && (
              <Button size="sm" onClick={() => setConfirmTarget({ type: "bulk", ids: selected })} disabled={bulkSendMutation.isPending}>
                <Mail /> Email Selected ({selected.length})
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search name or roll no..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={resultStatus} onValueChange={setResultStatus}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={list.length > 0 && selected.length === list.length} onCheckedChange={(c) => toggleAll(!!c)} />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Percentage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Emailed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && list.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No results yet.</TableCell></TableRow>
              )}
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox checked={selected.includes(r.id)} onCheckedChange={(c) => toggleOne(r.id, !!c)} />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium leading-tight">{r.student_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{r.roll_number}</p>
                  </TableCell>
                  <TableCell>{r.exam_name}{selection.multiBatch && r.exam_date ? <span className="block text-xs text-muted-foreground">{formatDate(r.exam_date)} · {String(r.start_time).slice(0, 5)}</span> : null}</TableCell>
                  <TableCell>{r.marks_obtained} / {r.total_marks}</TableCell>
                  <TableCell>{r.percentage}%</TableCell>
                  <TableCell><Badge variant={r.result_status === "passed" ? "success" : "destructive"}>{r.result_status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.submitted_at)}</TableCell>
                  <TableCell>
                    <Badge variant={r.result_sent_at ? "success" : "outline"}>
                      {r.result_sent_at ? `Sent ${formatDate(r.result_sent_at)}` : "Not sent"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(r)}><Eye className="size-4" /></Button>
                    <Button variant="ghost" size="icon" title="Download PDF" disabled={downloadingId === r.id} onClick={() => downloadPdf(r)}>
                      <FileDown className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Email result to student" disabled={sendMutation.isPending} onClick={() => setConfirmTarget({ type: "single", id: r.id })}>
                      <Mail className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this result?")) deleteMutation.mutate(r.id) }}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trophy className="size-5" /> Result Detail</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="flex flex-col gap-4 text-sm">
              <div>
                <p className="font-semibold">{viewing.student_name}</p>
                <p className="text-xs text-muted-foreground">{viewing.roll_number} · {viewing.centre_name} · {viewing.standard_name}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-lg font-semibold text-success">{viewing.correct_count}</p><p className="text-xs text-muted-foreground">Correct</p></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-lg font-semibold text-destructive">{viewing.wrong_count}</p><p className="text-xs text-muted-foreground">Wrong</p></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-lg font-semibold">{viewing.unanswered_count}</p><p className="text-xs text-muted-foreground">Unanswered</p></div>
              </div>
              <div className="grid grid-cols-2 gap-y-1.5">
                <p className="text-muted-foreground">Marks Obtained</p><p className="text-right font-medium">{viewing.marks_obtained} / {viewing.total_marks}</p>
                <p className="text-muted-foreground">Percentage</p><p className="text-right font-medium">{viewing.percentage}%</p>
                <p className="text-muted-foreground">Result</p><p className="text-right"><Badge variant={viewing.result_status === "passed" ? "success" : "destructive"}>{viewing.result_status}</Badge></p>
                <p className="text-muted-foreground">Submitted</p><p className="text-right font-medium">{formatDateTime(viewing.submitted_at)}</p>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-muted-foreground">Subject Breakdown</p>
                {viewingDetailLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
                {viewingDetail?.subjects?.map((subject) => (
                  <div key={subject.label} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                    <span className="font-medium">{subject.label}</span>
                    <span className="text-muted-foreground">
                      {subject.marksObtained} / {subject.totalMarks} ({subject.percentage}%)
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={downloadingId === viewing.id} onClick={() => downloadPdf(viewing)}>
                  <FileDown className="size-4" /> Download PDF
                </Button>
                <Button className="flex-1" disabled={sendMutation.isPending} onClick={() => setConfirmTarget({ type: "single", id: viewing.id })}>
                  <Mail className="size-4" /> Email to Student
                </Button>
              </div>
              {viewing.result_sent_at && (
                <p className="text-center text-xs text-muted-foreground">
                  Last emailed {formatDateTime(viewing.result_sent_at)}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmPasswordDialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title="Confirm Result Email"
        description="Enter the confirmation password to email the result(s) with the answer sheet PDF."
        pending={sendMutation.isPending || bulkSendMutation.isPending}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
