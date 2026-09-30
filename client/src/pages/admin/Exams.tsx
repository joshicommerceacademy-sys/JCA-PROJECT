import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Trash2, CalendarClock, Download, PlayCircle, Copy } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import { formatDate, formatDateTime } from "@/lib/formatDate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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
  name: "", standardId: "", centreId: "", examDate: "", startTime: "",
  durationMinutes: "60", passingPercentage: "40", notes: "",
  loginWindowMinutes: "30", gracePeriodMinutes: "25", showProvisionalResult: true,
  compensateLateLogin: true, negativeMarking: false, seatNumberRequired: false,
}

type SectionForm = { bankId: string; mode: "random" | "manual"; questionCount: string; questionIds: number[] }
const emptySection: SectionForm = { bankId: "", mode: "random", questionCount: "10", questionIds: [] }

const statusVariant = {
  upcoming: "outline", ongoing: "success", completed: "secondary", cancelled: "destructive",
} as const

export default function Exams() {
  const queryClient = useQueryClient()
  const { data: exams, isLoading } = useQuery({ queryKey: ["exams"], queryFn: adminApi.exams.list })
  const { data: standards } = useQuery({ queryKey: ["standards"], queryFn: adminApi.standards.list })
  const { data: centres } = useQuery({ queryKey: ["centres"], queryFn: adminApi.centres.list })
  const { data: banks } = useQuery({ queryKey: ["question-banks"], queryFn: adminApi.questionBanks.list })
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: adminApi.settings.get })
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState(emptyForm)
  const [sections, setSections] = React.useState<SectionForm[]>([emptySection])
  const [logoFile, setLogoFile] = React.useState<File | null>(null)

  function setSubjectCount(countStr: string) {
    const count = Number(countStr)
    setSections((prev) => {
      const next = [...prev]
      while (next.length < count) next.push({ ...emptySection })
      next.length = count
      return next
    })
  }

  const sectionsIncomplete = sections.some((s) =>
    !s.bankId || (s.mode === "random" ? !s.questionCount : s.questionIds.length === 0)
  )

  const createMutation = useMutation({
    mutationFn: async () => {
      const exam = await adminApi.exams.create({
        ...form,
        durationMinutes: Number(form.durationMinutes),
        passingPercentage: Number(form.passingPercentage),
        loginWindowMinutes: Number(form.loginWindowMinutes),
        gracePeriodMinutes: Number(form.gracePeriodMinutes),
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
      setSections([emptySection])
      setLogoFile(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => adminApi.exams.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] })
      toast.success("Status updated")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

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

  async function downloadAttendanceSheet(id: number, name: string) {
    try {
      const res = await adminApi.exams.downloadAttendanceSheet(id)
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `attendance-${name.replace(/\s+/g, "-")}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <div className="flex flex-col gap-6">
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
                <TableHead>Candidates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && (exams || []).length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No exams scheduled yet.</TableCell></TableRow>
              )}
              {exams?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {e.name}
                    {e.negative_marking && (
                      <Badge variant="outline" className="ml-2 text-[10px]" title="Negative marking: -25% of a question's marks per wrong answer">−ve</Badge>
                    )}
                    {e.seat_number_required && (
                      <Badge variant="outline" className="ml-2 text-[10px]" title="Seat number required to allow each student">Seat#</Badge>
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
                  <TableCell>{e.candidate_count}</TableCell>
                  <TableCell>
                    <Select value={e.status} onValueChange={(v) => statusMutation.mutate({ id: e.id, status: v })}>
                      <SelectTrigger size="sm" className="w-32">
                        <Badge variant={statusVariant[e.status]} className="capitalize">{e.status}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upcoming">Upcoming</SelectItem>
                        <SelectItem value="ongoing">Ongoing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
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
                        <span className="text-[10px] text-muted-foreground">
                          Started {formatDateTime(e.started_at)}
                        </span>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startMutation.mutate(e.id)} disabled={startMutation.isPending}>
                        <PlayCircle className="size-3.5" /> Start Exam
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" title="Download attendance sheet" onClick={() => downloadAttendanceSheet(e.id, e.name)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="size-5" /> Schedule New Exam</DialogTitle>
          </DialogHeader>
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Exam Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Standard</Label>
              <Select value={form.standardId} onValueChange={(v) => setForm({ ...form, standardId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select standard" /></SelectTrigger>
                <SelectContent>
                  {standards?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Centre</Label>
              <Select value={form.centreId} onValueChange={(v) => setForm({ ...form, centreId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select centre" /></SelectTrigger>
                <SelectContent>
                  {centres?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Exam Date</Label>
              <Input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Start Time</Label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
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
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="showProvisionalResult"
                checked={form.showProvisionalResult}
                onCheckedChange={(c) => setForm({ ...form, showProvisionalResult: !!c })}
              />
              <Label htmlFor="showProvisionalResult" className="font-normal">
                Show provisional result to students immediately after they submit
              </Label>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
              <Checkbox
                id="compensateLateLogin"
                className="mt-0.5"
                checked={form.compensateLateLogin}
                onCheckedChange={(c) => setForm({ ...form, compensateLateLogin: !!c })}
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
              <Checkbox
                id="negativeMarking"
                className="mt-0.5"
                checked={form.negativeMarking}
                onCheckedChange={(c) => setForm({ ...form, negativeMarking: !!c })}
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
            {settings?.seat_number_enabled && (
              <div className="flex items-start gap-2 sm:col-span-2">
                <Checkbox
                  id="seatNumberRequired"
                  className="mt-0.5"
                  checked={form.seatNumberRequired}
                  onCheckedChange={(c) => setForm({ ...form, seatNumberRequired: !!c })}
                />
                <Label htmlFor="seatNumberRequired" className="flex flex-col items-start gap-0.5 font-normal">
                  <span>Require lab seat number verification for this exam</span>
                  <span className="text-xs text-muted-foreground">
                    On the Verification page, admins will have to enter each student's seat number
                    individually before allowing them — bulk approval is disabled for this exam.
                  </span>
                </Label>
              </div>
            )}
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
            <div className="flex flex-col gap-1.5">
              <Label>Number of Subjects</Label>
              <Select value={String(sections.length)} onValueChange={setSubjectCount}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
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
              <Button type="submit" disabled={createMutation.isPending || sectionsIncomplete}>
                {createMutation.isPending ? "Scheduling..." : "Schedule Exam"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
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
