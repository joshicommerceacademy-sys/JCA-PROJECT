import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Trash2, CalendarClock, Download, PlayCircle, Copy, Pencil, Library } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import { formatDate, formatDateTime } from "@/lib/formatDate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const emptyForm = {
  name: "", registeredExamId: "", standardId: "", centreId: "", centreIds: [] as string[], examDate: "", startTime: "",
  durationMinutes: "60", passingPercentage: "40", notes: "",
  loginWindowMinutes: "30", gracePeriodMinutes: "25", submitButtonAfterMinutes: "0", showProvisionalResult: true,
  compensateLateLogin: true, negativeMarking: false, seatNumberRequired: false, showPhotoSignature: false, livePhotoCapture: false, verificationCloseMinutes: "", verificationOpenMinutes: "",
}

type SectionForm = { bankId: string; mode: "random" | "manual"; questionCount: string; questionIds: number[] }
const emptySection: SectionForm = { bankId: "", mode: "random", questionCount: "10", questionIds: [] }

export default function Exams() {
  const queryClient = useQueryClient()
  const { data: exams, isLoading } = useQuery({ queryKey: ["exams"], queryFn: () => adminApi.exams.list() })
  const { data: standards } = useQuery({ queryKey: ["standards"], queryFn: () => adminApi.standards.list() })
  const { data: centres } = useQuery({ queryKey: ["centres"], queryFn: () => adminApi.centres.list() })
  const { data: banks } = useQuery({ queryKey: ["question-banks"], queryFn: () => adminApi.questionBanks.list() })
  const { data: registered } = useQuery({ queryKey: ["registered-exams"], queryFn: () => adminApi.registeredExams.list() })
  const [open, setOpen] = React.useState(false)
  const [extraSlots, setExtraSlots] = React.useState<{ examDate: string; startTime: string }[]>([])
  const [newRegName, setNewRegName] = React.useState("")
  const [bankExam, setBankExam] = React.useState<any>(null)
  const [bankSections, setBankSections] = React.useState<SectionForm[]>([{ ...emptySection }])
  const [form, setForm] = React.useState(emptyForm)
  const [sections, setSections] = React.useState<SectionForm[]>([])
  const [logoFile, setLogoFile] = React.useState<File | null>(null)
  const [editingExam, setEditingExam] = React.useState<any>(null)
  const [editForm, setEditForm] = React.useState({ name: "", centreIds: [] as string[], examDate: "", startTime: "", durationMinutes: "60", notes: "", seatNumberRequired: false, showPhotoSignature: false, livePhotoCapture: false, verificationCloseMinutes: "", verificationOpenMinutes: "" })

  const sectionsIncomplete = sections.some((s) =>
    !s.bankId || (s.mode === "random" ? !s.questionCount : s.questionIds.length === 0)
  )

  const createMutation = useMutation({
    mutationFn: async () => {
      const exam = await adminApi.exams.create({
        ...form,
        centreId: form.centreIds[0] || form.centreId,
        centreIds: form.centreIds.length ? form.centreIds.map(Number) : (form.centreId ? [Number(form.centreId)] : []),
        slots: extraSlots.filter((s) => s.examDate && s.startTime),
        durationMinutes: Number(form.durationMinutes),
        passingPercentage: Number(form.passingPercentage),
        loginWindowMinutes: Number(form.loginWindowMinutes),
        gracePeriodMinutes: Number(form.gracePeriodMinutes),
        submitButtonAfterMinutes: Number(form.submitButtonAfterMinutes),
        sections: sections.map((s) =>
          s.mode === "manual"
            ? { bankId: Number(s.bankId), questionIds: s.questionIds }
            : { bankId: Number(s.bankId), questionCount: Number(s.questionCount) }
        ),
      })
      // A logo is optional and uploaded as a separate step right after creation succeeds —
      // if this upload fails, the exam itself was still created successfully.
      if (logoFile) {
        try {
          await adminApi.exams.uploadLogo(exam.id, logoFile)
        } catch (error) {
          toast.error(`Exam scheduled, but the logo upload failed: ${getErrorMessage(error)}`)
        }
      }
      return exam
    },
    onSuccess: (_data, _vars) => {
      queryClient.invalidateQueries({ queryKey: ["exams"] })
      toast.success("Exam scheduled")
      setOpen(false)
      setForm(emptyForm)
      setSections([])
      setExtraSlots([])
      setLogoFile(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const registerMutation = useMutation({
    mutationFn: () => adminApi.registeredExams.create(newRegName.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registered-exams"] })
      toast.success("Exam registered")
      setNewRegName("")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const unregisterMutation = useMutation({
    mutationFn: (id: number) => adminApi.registeredExams.remove(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["registered-exams"] }); toast.success("Registered exam removed") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const bankMutation = useMutation({
    mutationFn: () => adminApi.exams.setSections(bankExam.id, bankSections.map((s) =>
      s.mode === "manual"
        ? { bankId: Number(s.bankId), questionIds: s.questionIds }
        : { bankId: Number(s.bankId), questionCount: Number(s.questionCount) }
    )),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] })
      toast.success("Question bank linked")
      setBankExam(null)
      setBankSections([{ ...emptySection }])
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const bankIncomplete = bankSections.some((s) =>
    !s.bankId || (s.mode === "random" ? !s.questionCount : s.questionIds.length === 0)
  )
  const scheduledRegIds = new Set((exams || []).map((e) => e.registered_exam_id).filter(Boolean))
  const unscheduledRegistered = (registered || []).filter((r) => !scheduledRegIds.has(r.id))
  const selectedRegistered = registered?.find((r) => String(r.id) === form.registeredExamId)

  const editMutation = useMutation({
    mutationFn: () => adminApi.exams.update(editingExam.id, { ...editForm, centreId: editForm.centreIds[0], centreIds: editForm.centreIds.map(Number), durationMinutes: Number(editForm.durationMinutes) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exams"] }); toast.success("Exam details and centres updated"); setEditingExam(null) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  function openEdit(exam: any) {
    setEditingExam(exam)
    setEditForm({
      name: exam.name || "",
      centreIds: centres?.filter(c => (exam.centre_name || "").split(" / ").includes(c.name)).map(c => String(c.id)) || (exam.centre_id ? [String(exam.centre_id)] : []),
      examDate: String(exam.exam_date || "").slice(0, 10), startTime: String(exam.start_time || "").slice(0, 5),
      durationMinutes: String(exam.duration_minutes || 60), notes: exam.notes || "", seatNumberRequired: !!exam.seat_number_required, showPhotoSignature: !!exam.show_photo_signature, livePhotoCapture: !!exam.live_photo_capture, verificationCloseMinutes: exam.verification_close_minutes === null || exam.verification_close_minutes === undefined ? "" : String(exam.verification_close_minutes), verificationOpenMinutes: exam.verification_open_minutes === null || exam.verification_open_minutes === undefined ? "" : String(exam.verification_open_minutes),
    })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.exams.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] })
      toast.success("Exam deleted")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const startMutation = useMutation({
    mutationFn: (id: number) => adminApi.exams.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] })
      toast.success("Exam started — students can now log in")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function copyPassword(password: string) {
    navigator.clipboard.writeText(password)
    toast.success("Password copied")
  }

  // An exam that runs in several batches opens a pop-up listing every batch with its scheduled
  // candidates and a Download button; a single-batch exam downloads straight away.
  const [sheetBatches, setSheetBatches] = React.useState<any[] | null>(null)
  function openAttendanceSheet(exam: any) {
    const siblings = (exams || [])
      .filter((x: any) => (exam.registered_exam_id != null ? x.registered_exam_id === exam.registered_exam_id : x.name === exam.name))
      .sort((x: any, y: any) => `${String(x.exam_date).slice(0, 10)} ${x.start_time}`.localeCompare(`${String(y.exam_date).slice(0, 10)} ${y.start_time}`))
    if (siblings.length > 1) setSheetBatches(siblings)
    else downloadAttendanceSheet(exam.id, exam.name)
  }

  async function downloadAttendanceSheet(id: number, name: string, batchTime?: string) {
    try {
      const res = await adminApi.exams.downloadAttendanceSheet(id)
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `attendance-${name.replace(/\s+/g, "-")}${batchTime ? `-${batchTime.replace(":", "")}` : ""}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Registered Exam Name</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (newRegName.trim()) registerMutation.mutate() }}>
            <Input className="max-w-sm" placeholder="e.g. JCA Entrance" value={newRegName} onChange={(e) => setNewRegName(e.target.value)} />
            <Button type="submit" disabled={!newRegName.trim() || registerMutation.isPending}><Plus /> Register Exam</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {(registered || []).length === 0 && <p className="text-sm text-muted-foreground">No exams registered yet. Register an exam name, then schedule it below.</p>}
            {registered?.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm">
                {r.name}
                <span className="text-xs text-muted-foreground">{r.student_count} student{r.student_count === 1 ? "" : "s"}</span>
                {r.scheduled_exam_id ? <Badge variant="secondary" className="text-[10px]">Scheduled</Badge> : null}
                <button type="button" title="Remove" className="text-destructive" onClick={() => { if (confirm(`Remove registered exam "${r.name}"?`)) unregisterMutation.mutate(r.id) }}>
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exam Schedule</h1>
          <p className="text-sm text-muted-foreground">Schedule exams and freeze their question set</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus /> Schedule Exam
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All Exams</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exam</TableHead>
                <TableHead>Standard</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Date &amp; Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Question Bank</TableHead>
                <TableHead>Candidates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && (exams || []).length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">No exams scheduled yet.</TableCell></TableRow>
              )}
              {exams?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {e.name}
                    {e.desk_logins?.length ? e.desk_logins.map((d) => (
                      <div key={d.userId} className="text-[10px] font-normal text-muted-foreground">
                        Desk ID: {d.userId}{d.centreId ? ` (${d.centreName})` : ""}
                      </div>
                    )) : e.desk_user_id && <div className="text-[10px] font-normal text-muted-foreground">Desk ID: {e.desk_user_id}</div>}
                    {e.negative_marking && (
                      <Badge variant="outline" className="ml-2 text-[10px]" title="Negative marking: -25% of a question's marks per wrong answer">−ve</Badge>
                    )}
                    {e.logo_url && (
                      <img src={e.logo_url} alt="" className="ml-2 inline-block size-4 rounded-sm align-middle" title="Custom exam logo set" />
                    )}
                  </TableCell>
                  <TableCell>{e.standard_name}</TableCell>
                  <TableCell>{e.centre_name}</TableCell>
                  <TableCell>{formatDate(e.exam_date)} · {e.start_time}</TableCell>
                  <TableCell>{e.duration_minutes} min</TableCell>
                  <TableCell>{e.question_count_actual}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block size-3 rounded-full ${Number(e.question_count_actual) > 0 ? "bg-green-500" : "bg-red-500"}`}
                        title={Number(e.question_count_actual) > 0 ? "Question bank active" : "No question bank linked"}
                      />
                      <Button variant="outline" size="icon" className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary" title="Add / change question bank" onClick={() => { setBankExam(e); setBankSections([{ ...emptySection }]) }}>
                        <Library className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{e.candidate_count}</TableCell>
                  <TableCell>
                    {/* Automatic: Upcoming -> Running (after Start Exam) -> Completed (after Stop Exam). */}
                    {e.status === "cancelled" ? (
                      <Badge variant="destructive">Cancelled</Badge>
                    ) : e.stopped_at ? (
                      <Badge variant="secondary">Completed</Badge>
                    ) : e.started_at ? (
                      <Badge variant="success">Running</Badge>
                    ) : (
                      <Badge variant="outline">Upcoming</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {e.started_at ? (
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => e.access_password && copyPassword(e.access_password)}
                          className="flex items-center gap-1 font-mono text-xs underline decoration-dotted underline-offset-2 hover:text-primary"
                          title="Copy password"
                        >
                          {e.access_password} <Copy className="size-3" />
                        </button>
                        {e.stop_password && !e.stopped_at && (
                          <button
                            type="button"
                            onClick={() => copyPassword(e.stop_password!)}
                            className="flex items-center gap-1 font-mono text-[11px] text-destructive underline decoration-dotted underline-offset-2"
                            title="Stop exam password - click to copy"
                          >
                            Stop pwd: {e.stop_password} <Copy className="size-3" />
                          </button>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          Started {formatDateTime(e.started_at)}{e.stopped_at ? ` · Stopped ${formatDateTime(e.stopped_at)}` : ""}
                        </span>
                      </div>
                    ) : (
                      <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90" onClick={() => startMutation.mutate(e.id)} disabled={startMutation.isPending}>
                        <PlayCircle className="size-3.5" /> Start Exam
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" title="Edit exam and centres" onClick={() => openEdit(e)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" title="Download attendance sheet" onClick={() => openAttendanceSheet(e)}>
                      <Download className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete exam "${e.name}"?`)) deleteMutation.mutate(e.id) }}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!sheetBatches} onOpenChange={(o) => !o && setSheetBatches(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Attendance sheets - {sheetBatches?.[0]?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Batch (date &amp; time)</span><span>Candidates</span><span />
            </div>
            {(sheetBatches || []).map((b) => (
              <div key={b.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                <span>{formatDate(b.exam_date)} · <span className="font-mono">{String(b.start_time).slice(0, 5)}</span></span>
                <span className="text-center font-medium">{b.candidate_count ?? 0}</span>
                <Button size="sm" onClick={() => downloadAttendanceSheet(b.id, b.name, String(b.start_time).slice(0, 5))}>
                  <Download className="size-3.5" /> Download
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="size-5" /> Schedule New Exam</DialogTitle>
          </DialogHeader>
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}>
            <div className="flex items-start gap-2 sm:col-span-2">
              <Switch id="showPhotoSignature" checked={form.showPhotoSignature} onCheckedChange={(c) => setForm({ ...form, showPhotoSignature: c })} />
              <Label htmlFor="showPhotoSignature" className="flex flex-col items-start gap-0.5 font-normal">
                <span>Show candidate photo and signature on the exam page</span>
                <span className="text-xs text-muted-foreground">The candidate's name is always shown. Turn this on to also show their photo and signature.</span>
              </Label>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Select Exam</Label>
              <Select
                value={form.registeredExamId}
                onValueChange={(v) => {
                  const r = registered?.find((x) => String(x.id) === v)
                  const prev = registered?.find((x) => String(x.id) === form.registeredExamId)
                  // Fill the display name from the selection unless the admin already typed their own.
                  const keepTyped = form.name.trim() && form.name !== (prev?.name || "")
                  setForm({ ...form, registeredExamId: v, name: keepTyped ? form.name : r?.name || "" })
                }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder={unscheduledRegistered.length ? "Select a registered exam" : "No unscheduled registered exams"} /></SelectTrigger>
                <SelectContent>
                  {unscheduledRegistered.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedRegistered && (
                <p className="text-sm font-medium text-primary">{selectedRegistered.student_count} student{selectedRegistered.student_count === 1 ? "" : "s"} registered for this exam</p>
              )}
              <Label className="mt-2">Exam Name</Label>
              <Input
                placeholder="Exam name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Standard (optional)</Label>
              <Select value={form.standardId} onValueChange={(v) => setForm({ ...form, standardId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select standard" /></SelectTrigger>
                <SelectContent>
                  {standards?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Exam Centres (select one or more)</Label>
              <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                {centres?.map((c) => {
                  const checked = form.centreIds.includes(String(c.id)) || (!form.centreIds.length && form.centreId === String(c.id))
                  return <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={checked} onCheckedChange={(v) => {
                      const next = v ? [...new Set([...form.centreIds, String(c.id)])] : form.centreIds.filter((id) => id !== String(c.id))
                      setForm({ ...form, centreIds: next, centreId: next[0] || "" })
                    }} />
                    <span>{c.name}{c.city ? ` — ${c.city}` : ""}</span>
                  </label>
                })}
              </div>
              <p className="text-xs text-muted-foreground">The selected centres will be shown beside the exam name on the student exam selection page.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Exam Date</Label>
              <Input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Start Time</Label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>More dates &amp; times <span className="font-normal text-muted-foreground">(same password, desk ID and questions)</span></Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setExtraSlots((prev) => [...prev, { examDate: "", startTime: "" }])}>
                  <Plus /> Add date &amp; time
                </Button>
              </div>
              {extraSlots.map((slot, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Input type="date" value={slot.examDate} onChange={(e) => setExtraSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, examDate: e.target.value } : s)))} required />
                  <Input type="time" value={slot.startTime} onChange={(e) => setExtraSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, startTime: e.target.value } : s)))} required />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setExtraSlots((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              ))}
              {extraSlots.length > 0 && (
                <p className="text-xs text-muted-foreground">Each slot becomes its own row in the schedule. Assign candidates to a slot in Reports &rarr; Registrations (a candidate belongs to one slot).</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Duration (minutes)</Label>
              <Input type="number" min={5} max={300} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Passing Percentage</Label>
              <Input type="number" min={1} max={100} value={form.passingPercentage} onChange={(e) => setForm({ ...form, passingPercentage: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Login Window (minutes before start)</Label>
              <Input type="number" min={0} max={180} value={form.loginWindowMinutes} onChange={(e) => setForm({ ...form, loginWindowMinutes: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Grace Period (minutes after start)</Label>
              <Input type="number" min={0} max={180} value={form.gracePeriodMinutes} onChange={(e) => setForm({ ...form, gracePeriodMinutes: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Show Submit Button After (minutes)</Label>
              <Input type="number" min={0} max={300} value={form.submitButtonAfterMinutes} onChange={(e) => setForm({ ...form, submitButtonAfterMinutes: e.target.value })} required />
              <p className="text-xs text-muted-foreground">0 means the Submit/Done Exam button is available immediately.</p>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                id="showProvisionalResult"
                checked={form.showProvisionalResult}
                onCheckedChange={(c) => setForm({ ...form, showProvisionalResult: c })}
              />
              <Label htmlFor="showProvisionalResult" className="font-normal">
                Show provisional result to students immediately after they submit
              </Label>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
              <Switch
                id="compensateLateLogin"
                checked={form.compensateLateLogin}
                onCheckedChange={(c) => setForm({ ...form, compensateLateLogin: c })}
              />
              <Label htmlFor="compensateLateLogin" className="flex flex-col items-start gap-0.5 font-normal">
                <span>Grant full duration to candidates who log in during the grace period</span>
                <span className="text-xs text-muted-foreground">
                  On: a candidate who logs in a few minutes late (within the grace period) still gets the
                  full duration, counted from their actual login. Off: everyone shares the same fixed
                  deadline (start time + duration), so logging in late costs them time.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
              <Switch
                id="negativeMarking"
                checked={form.negativeMarking}
                onCheckedChange={(c) => setForm({ ...form, negativeMarking: c })}
              />
              <Label htmlFor="negativeMarking" className="flex flex-col items-start gap-0.5 font-normal">
                <span>Enable negative marking</span>
                <span className="text-xs text-muted-foreground">
                  Each wrong answer deducts 25% of that question's own marks — 1 mark → -0.25,
                  2 marks → -0.50, 3 marks → -0.75, 4 marks → -1.00 — worked out automatically
                  from each question's marks, no separate setup needed.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
              <Switch id="seatNumberRequired" checked={form.seatNumberRequired} onCheckedChange={(c) => setForm({ ...form, seatNumberRequired: c })} />
              <Label htmlFor="seatNumberRequired" className="flex flex-col items-start gap-0.5 font-normal">
                <span>Seating Arrangement</span>
                <span className="text-xs text-muted-foreground">At the Verification Desk, every Allowed candidate is given the next free seat from the labs and seat numbers set on the Centres page.</span>
              </Label>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
              <Switch id="livePhotoCapture" checked={form.livePhotoCapture} onCheckedChange={(c) => setForm({ ...form, livePhotoCapture: c })} />
              <Label htmlFor="livePhotoCapture" className="flex flex-col items-start gap-0.5 font-normal">
                <span>Live Photo Capture</span>
                <span className="text-xs text-muted-foreground">The camera opens automatically when a candidate is Allowed at the Verification Desk.</span>
              </Label>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Open Verification Desk before exam start (minutes)</Label>
              <Input type="number" min={0} max={600} placeholder="Leave empty to open from the start" value={form.verificationOpenMinutes} onChange={(e) => setForm({ ...form, verificationOpenMinutes: e.target.value })} />
              <p className="text-xs text-muted-foreground">The Verification Desk accepts Allow only between this opening time and the closing time below.</p>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Close Verification Desk after exam start (minutes)</Label>
              <Input type="number" min={0} max={600} placeholder="Leave empty to keep it open" value={form.verificationCloseMinutes} onChange={(e) => setForm({ ...form, verificationCloseMinutes: e.target.value })} />
              <p className="text-xs text-muted-foreground">After this many minutes from the exam start, candidates can no longer be Allowed (the desk shows "Verification desk is closed") and anyone not Allowed is marked Absent.</p>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Exam Logo (optional)</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                Shown next to the exam name on the student exam page. If not set, the academy's default logo is used.
              </p>
            </div>
            <SectionsEditor sections={sections} setSections={setSections} banks={banks} allowNone />
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Questions are chosen randomly from each subject's published question bank, and frozen for this exam.
              The login window and grace period control when students are allowed to log in: from
              (start time − login window) up to (start time + grace period).
            </p>
            <DialogFooter className="sm:col-span-2">
              <Button type="submit" disabled={createMutation.isPending || sectionsIncomplete || !form.name.trim()}>
                {createMutation.isPending ? "Scheduling..." : "Schedule Exam"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!bankExam} onOpenChange={(v) => !v && setBankExam(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Question Bank — {bankExam?.name}</DialogTitle></DialogHeader>
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); bankMutation.mutate() }}>
            <SectionsEditor sections={bankSections} setSections={setBankSections} banks={banks} />
            <p className="text-xs text-muted-foreground sm:col-span-2">Saving replaces any question bank already linked to this exam. Not possible once candidates have started.</p>
            <DialogFooter className="sm:col-span-2">
              <Button type="submit" disabled={bankMutation.isPending || bankIncomplete}>{bankMutation.isPending ? "Saving..." : "Link Question Bank"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingExam} onOpenChange={(v) => !v && setEditingExam(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit Exam / Add Centres</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); editMutation.mutate() }}>
            <div className="grid gap-1"><Label>Exam Name</Label><Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required /></div>
            <div className="grid gap-2"><Label>Centres (select one or more)</Label>
              <div className="max-h-36 overflow-y-auto rounded-md border p-3 grid gap-2">
                {centres?.map(c => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={editForm.centreIds.includes(String(c.id))} onChange={e => setEditForm({ ...editForm, centreIds: e.target.checked ? [...editForm.centreIds, String(c.id)] : editForm.centreIds.filter(id => id !== String(c.id)) })} />{c.name}</label>)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label>Date</Label><Input type="date" value={editForm.examDate} onChange={e => setEditForm({ ...editForm, examDate: e.target.value })} required /></div>
              <div className="grid gap-1"><Label>Start Time</Label><Input type="time" value={editForm.startTime} onChange={e => setEditForm({ ...editForm, startTime: e.target.value })} required /></div>
            </div>
            <div className="grid gap-1"><Label>Duration (minutes)</Label><Input type="number" min="1" value={editForm.durationMinutes} onChange={e => setEditForm({ ...editForm, durationMinutes: e.target.value })} required /></div>
            <div className="grid gap-1"><Label>Open Verification Desk before exam start (minutes)</Label><Input type="number" min="0" max="600" placeholder="Empty = open from the start" value={editForm.verificationOpenMinutes} onChange={e => setEditForm({ ...editForm, verificationOpenMinutes: e.target.value })} /></div>
            <div className="grid gap-1"><Label>Close Verification Desk after exam start (minutes)</Label><Input type="number" min="0" max="600" placeholder="Empty = stays open" value={editForm.verificationCloseMinutes} onChange={e => setEditForm({ ...editForm, verificationCloseMinutes: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch id="editSeat" checked={editForm.seatNumberRequired} onCheckedChange={(c) => setEditForm({ ...editForm, seatNumberRequired: c })} /><Label htmlFor="editSeat" className="font-normal">Seating Arrangement</Label></div>
            <div className="flex items-center gap-2"><Switch id="editLive" checked={editForm.livePhotoCapture} onCheckedChange={(c) => setEditForm({ ...editForm, livePhotoCapture: c })} /><Label htmlFor="editLive" className="font-normal">Live Photo Capture</Label></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={editForm.showPhotoSignature} onChange={e => setEditForm({ ...editForm, showPhotoSignature: e.target.checked })} />Show candidate photo and signature on the exam page</label>
            <div className="grid gap-1"><Label>Notes</Label><Textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingExam(null)}>Cancel</Button><Button type="submit" disabled={editMutation.isPending || !editForm.centreIds.length}>{editMutation.isPending ? "Saving..." : "Save Changes"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SectionsEditor({
  sections, setSections, banks, allowNone,
}: {
  sections: SectionForm[]
  setSections: React.Dispatch<React.SetStateAction<SectionForm[]>>
  banks: any[] | undefined
  allowNone?: boolean
}) {
  function setSubjectCount(countStr: string) {
    const count = Number(countStr)
    setSections((prev) => {
      const next = [...prev]
      while (next.length < count) next.push({ ...emptySection })
      next.length = count
      return next
    })
  }
  return (
    <>
            <div className="flex flex-col gap-1.5">
              <Label>Number of Subjects</Label>
              <Select value={String(sections.length)} onValueChange={setSubjectCount}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(allowNone ? [0, 1, 2, 3, 4] : [1, 2, 3, 4]).map((n) => <SelectItem key={n} value={String(n)}>{n === 0 ? "None - add question bank later" : n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden sm:block" />
            {sections.map((section, i) => (
              <React.Fragment key={i}>
                <div className="flex flex-col gap-1.5">
                  <Label>Subject {i + 1} — Question Bank</Label>
                  <Select
                    value={section.bankId}
                    onValueChange={(v) =>
                      setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, bankId: v, questionIds: [] } : s)))
                    }
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select question bank" /></SelectTrigger>
                    <SelectContent>
                      {banks?.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name} — {b.subject || "No subject"} ({b.question_count} published)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Questions from this subject</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={section.mode === "random" ? "default" : "outline"}
                        onClick={() => setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, mode: "random" } : s)))}
                      >
                        Random count
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={section.mode === "manual" ? "default" : "outline"}
                        onClick={() => setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, mode: "manual" } : s)))}
                      >
                        Choose specific
                      </Button>
                    </div>
                  </div>
                  {section.mode === "random" ? (
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={section.questionCount}
                      onChange={(e) => setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, questionCount: e.target.value } : s)))}
                      required
                    />
                  ) : (
                    <SectionQuestionPicker
                      bankId={section.bankId}
                      selected={section.questionIds}
                      onChange={(ids) => setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, questionIds: ids } : s)))}
                    />
                  )}
                </div>
              </React.Fragment>
            ))}
    </>
  )
}

function SectionQuestionPicker({
  bankId, selected, onChange,
}: {
  bankId: string
  selected: number[]
  onChange: (ids: number[]) => void
}) {
  const { data: bankQuestions, isLoading } = useQuery({
    queryKey: ["questions", { bankId, status: "published" }],
    queryFn: () => adminApi.questions.list({ bankId, status: "published" }),
    enabled: !!bankId,
  })

  if (!bankId) {
    return <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Pick a question bank first.</p>
  }

  function toggle(id: number, checked: boolean) {
    onChange(checked ? [...selected, id] : selected.filter((qid) => qid !== id))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="max-h-56 overflow-y-auto rounded-md border">
        {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading questions...</p>}
        {!isLoading && (bankQuestions || []).length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">This bank has no published questions.</p>
        )}
        {bankQuestions?.map((q) => (
          <label key={q.id} className="flex items-start gap-2 border-b p-2 text-sm last:border-b-0 hover:bg-muted/50">
            <Checkbox
              className="mt-0.5"
              checked={selected.includes(q.id)}
              onCheckedChange={(c) => toggle(q.id, !!c)}
            />
            <span className="flex-1">
              {q.question_text} <span className="text-xs text-muted-foreground">({q.marks} mark{q.marks === 1 ? "" : "s"})</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{selected.length} question{selected.length === 1 ? "" : "s"} selected</p>
    </div>


  )
}
