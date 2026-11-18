import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ShieldCheck, UserPlus, Trash2, Pencil } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import { formatDate } from "@/lib/formatDate"
import type { Student } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PhotoFallback } from "@/components/ui/media-placeholder"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const emptyForm = { id: 0, fullName: "", email: "", phone: "", dob: "", gender: "", address: "", centreId: "" }

// Reports > Registrations: pick a registered exam to see only its registrations, split into
// verified / not verified. Verifying issues the hall ticket and emails the PDF when the exam is
// already scheduled (otherwise both happen when it is scheduled).
export default function RegistrationsByExam() {
  const queryClient = useQueryClient()
  const { data: registered } = useQuery({ queryKey: ["registered-exams"], queryFn: () => adminApi.registeredExams.list() })
  const { data: centres } = useQuery({ queryKey: ["centres"], queryFn: () => adminApi.centres.list() })
  const { data: allExams } = useQuery({ queryKey: ["exams"], queryFn: () => adminApi.exams.list() })
  const [selectedExam, setSelectedExam] = React.useState<number | null>(null)
  const [selected, setSelected] = React.useState<number[]>([])
  const [manageOpen, setManageOpen] = React.useState(false)
  const [form, setForm] = React.useState(emptyForm)
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [signature, setSignature] = React.useState<File | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const isEditing = form.id !== 0

  const { data: students, isLoading } = useQuery({
    queryKey: ["students", { registeredExamId: selectedExam }],
    queryFn: () => adminApi.students.list({ registeredExamId: String(selectedExam) }),
    enabled: selectedExam !== null,
  })

  const reg = registered?.find((r) => r.id === selectedExam)
  const slots = (allExams || []).filter((e) => reg && e.registered_exam_id === reg.id).sort((a, b) => String(a.exam_date).localeCompare(String(b.exam_date)) || String(a.start_time).localeCompare(String(b.start_time)))
  const multiSlot = slots.length > 1
  const slotMutation = useMutation({
    mutationFn: ({ id, examId }: { id: number; examId: number }) => adminApi.students.assignSlot(id, examId),
    onSuccess: (r) => { refresh(); toast.success(r.emailed ? "Slot assigned and hall ticket emailed" : "Slot assigned") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  function slotSelect(s: Student) {
    return (
      <Select value={s.exam_id ? String(s.exam_id) : ""} onValueChange={(v) => slotMutation.mutate({ id: s.id, examId: Number(v) })}>
        <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Change batch" /></SelectTrigger>
        <SelectContent>
          {slots.map((e) => <SelectItem key={e.id} value={String(e.id)}>{formatDate(e.exam_date)} · {String(e.start_time).slice(0, 5)}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
  const list: Student[] = students || []
  const pending = list.filter((s) => s.status === "pending")
  const verified = list.filter((s) => s.status === "allowed")
  const selectedPending = selected.filter((id) => pending.some((s) => s.id === id))

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["students"] })
    queryClient.invalidateQueries({ queryKey: ["registered-exams"] })
    queryClient.invalidateQueries({ queryKey: ["hall-tickets"] })
  }

  const verifyMutation = useMutation({
    mutationFn: (ids: number[]) => adminApi.students.verify(ids),
    onSuccess: (r) => {
      refresh()
      setSelected([])
      const mail = r.emailed ? ` ${r.emailed} email(s) sent.` : ""
      const failed = r.emailFailed.length ? ` ${r.emailFailed.length} email(s) failed.` : ""
      toast.success(`Verified ${r.verified}.${r.ticketsIssued ? ` ${r.ticketsIssued} hall ticket(s) issued.` : ""}${mail}${failed}`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append("fullName", form.fullName)
      if (!isEditing) fd.append("email", form.email)
      fd.append("phone", form.phone)
      if (!isEditing) fd.append("dob", form.dob)
      fd.append("gender", form.gender)
      fd.append("address", form.address)
      fd.append("centreId", form.centreId)
      if (!isEditing && selectedExam) fd.append("registeredExamId", String(selectedExam))
      if (photo) fd.append("photo", photo)
      if (signature) fd.append("signature", signature)
      return isEditing ? adminApi.students.update(form.id, fd) : adminApi.students.create(fd)
    },
    onSuccess: () => {
      refresh()
      toast.success(isEditing ? "Student updated" : "Student added")
      setFormOpen(false)
      setForm(emptyForm)
      setPhoto(null)
      setSignature(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.students.remove(id),
    onSuccess: () => { refresh(); toast.success("Student deleted") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function openAdd() {
    setForm(emptyForm); setPhoto(null); setSignature(null); setFormOpen(true)
  }
  function openEdit(s: Student) {
    setForm({
      id: s.id, fullName: s.full_name, email: s.email, phone: s.phone || "", dob: s.dob?.slice(0, 10) || "",
      gender: s.gender || "", address: s.address || "", centreId: String(s.centre_id || ""),
    })
    setPhoto(null); setSignature(null); setFormOpen(true)
  }

  function toggle(id: number, on: boolean) {
    setSelected((prev) => (on ? [...prev, id] : prev.filter((i) => i !== id)))
  }

  function studentCell(s: Student) {
    return (
      <div className="flex items-center gap-2">
        <Avatar className="size-8">
          {s.photo_url && <AvatarImage src={s.photo_url} />}
          <AvatarFallback className="p-0"><PhotoFallback /></AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium leading-tight">{s.full_name}</p>
          <p className="text-xs leading-tight text-muted-foreground">{s.email}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Select Exam</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(registered || []).length === 0 && <p className="text-sm text-muted-foreground">No exams registered yet. Register one on the Exam Schedule page.</p>}
          {registered?.map((r) => (
            <Button key={r.id} size="sm" variant={selectedExam === r.id ? "default" : "outline"} onClick={() => { setSelectedExam(r.id); setSelected([]) }}>
              {r.name} <span className="opacity-70">({r.student_count})</span>
            </Button>
          ))}
        </CardContent>
      </Card>

      {reg && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{reg.name}</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!selectedPending.length || verifyMutation.isPending} onClick={() => verifyMutation.mutate(selectedPending)}>
                <ShieldCheck /> Verify ({selectedPending.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}>
                <UserPlus /> Add / Manage Students
              </Button>
            </div>
          </div>

          <Card className="border-warning/50">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">Not verified <Badge variant="warning">{pending.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={pending.length > 0 && selectedPending.length === pending.length}
                        onCheckedChange={(c) => setSelected(c ? pending.map((s) => s.id) : [])}
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Application ID</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Centre</TableHead>
                    {multiSlot && <TableHead>Slot</TableHead>}
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>}
                  {!isLoading && pending.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No unverified registrations.</TableCell></TableRow>}
                  {pending.map((s) => (
                    <TableRow key={s.id} className="bg-warning/5">
                      <TableCell><Checkbox checked={selected.includes(s.id)} onCheckedChange={(c) => toggle(s.id, !!c)} /></TableCell>
                      <TableCell>{studentCell(s)}</TableCell>
                      <TableCell className="font-mono text-xs">{s.application_id || "—"}</TableCell>
                      <TableCell>{s.phone}</TableCell>
                      <TableCell>{s.centre_name}</TableCell>
                      {multiSlot && <TableCell>{slotSelect(s)}</TableCell>}
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" disabled={verifyMutation.isPending} onClick={() => verifyMutation.mutate([s.id])}>Verify</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-success/50">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">Verified <Badge variant="success">{verified.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Application ID</TableHead>
                    <TableHead>Roll No.</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Centre</TableHead>
                    {multiSlot && <TableHead>Slot</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && verified.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No verified registrations yet.</TableCell></TableRow>}
                  {verified.map((s) => (
                    <TableRow key={s.id} className="bg-success/5">
                      <TableCell>{studentCell(s)}</TableCell>
                      <TableCell className="font-mono text-xs">{s.application_id || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{s.roll_number || "—"}</TableCell>
                      <TableCell>{s.phone}</TableCell>
                      <TableCell>{s.centre_name}</TableCell>
                      {multiSlot && <TableCell>{slotSelect(s)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={manageOpen} onOpenChange={setManageOpen}>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Students — {reg.name}</DialogTitle>
                <DialogDescription>Only students registered for this exam are listed.</DialogDescription>
              </DialogHeader>
              <div className="flex justify-end">
                <Button size="sm" onClick={openAdd}><UserPlus /> Add Student</Button>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No students yet.</TableCell></TableRow>}
                    {list.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{studentCell(s)}</TableCell>
                        <TableCell><Badge variant={s.status === "allowed" ? "success" : "warning"}>{s.status === "allowed" ? "Verified" : "Not verified"}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete student "${s.full_name}"?`)) deleteMutation.mutate(s.id) }}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={formOpen} onOpenChange={setFormOpen}>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader><DialogTitle>{isEditing ? "Edit Student" : `Add Student — ${reg.name}`}</DialogTitle></DialogHeader>
              <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }}>
                <div className="flex flex-col gap-1.5 sm:col-span-2"><Label>Full Name</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
                {!isEditing && <div className="flex flex-col gap-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>}
                <div className="flex flex-col gap-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
                {!isEditing && <div className="flex flex-col gap-1.5"><Label>Date of Birth</Label><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required /></div>}
                <div className="flex flex-col gap-1.5">
                  <Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Centre</Label>
                  <Select value={form.centreId} onValueChange={(v) => setForm({ ...form, centreId: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select centre" /></SelectTrigger>
                    <SelectContent>{centres?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div className="flex flex-col gap-1.5"><Label>Photo</Label><Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></div>
                <div className="flex flex-col gap-1.5"><Label>Signature</Label><Input type="file" accept="image/*" onChange={(e) => setSignature(e.target.files?.[0] || null)} /></div>
                <DialogFooter className="sm:col-span-2">
                  <Button type="submit" disabled={saveMutation.isPending || !form.centreId}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
