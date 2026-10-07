import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Search, Eye } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { Student } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PhotoFallback, SignatureBox } from "@/components/ui/media-placeholder"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const emptyForm = {
  id: 0, fullName: "", email: "", phone: "", dob: "", gender: "", address: "",
  centreId: "",
}

const UNASSIGNED = "Unassigned"

export default function Students() {
  const queryClient = useQueryClient()
  const { data: students, isLoading } = useQuery({ queryKey: ["students"], queryFn: () => adminApi.students.list() })
  const { data: centres } = useQuery({ queryKey: ["centres"], queryFn: () => adminApi.centres.list() })

  const [search, setSearch] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [viewing, setViewing] = React.useState<Student | null>(null)
  const [form, setForm] = React.useState(emptyForm)
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [signature, setSignature] = React.useState<File | null>(null)
  const [createdInfo, setCreatedInfo] = React.useState<{ defaultPassword: string } | null>(null)
  const isEditing = form.id !== 0

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
      if (photo) fd.append("photo", photo)
      if (signature) fd.append("signature", signature)
      return isEditing ? adminApi.students.update(form.id, fd) : adminApi.students.create(fd)
    },
    onSuccess: (data: Student & { defaultPassword?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["students"] })
      if (!isEditing && data.defaultPassword) {
        setCreatedInfo({ defaultPassword: data.defaultPassword })
      }
      toast.success(isEditing ? "Student updated" : "Student registered")
      setOpen(false)
      setForm(emptyForm)
      setPhoto(null)
      setSignature(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.students.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] })
      toast.success("Student deleted")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function openCreate() {
    setForm(emptyForm)
    setPhoto(null)
    setSignature(null)
    setOpen(true)
  }

  function openEdit(s: Student) {
    setForm({
      id: s.id, fullName: s.full_name, email: s.email, phone: s.phone, dob: s.dob?.slice(0, 10) || "",
      gender: s.gender || "", address: s.address || "",
      centreId: String(s.centre_id || ""),
    })
    setPhoto(null)
    setSignature(null)
    setOpen(true)
  }

  const filtered = (students || []).filter(
    (s) =>
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.roll_number || "").toLowerCase().includes(search.toLowerCase())
  )

  // Grouped by standard so the roster reads as batches, not one long flat list.
  // Students without a standard yet (no hall ticket generated) fall under "Unassigned".
  const groups = React.useMemo(() => {
    const map = new Map<string, Student[]>()
    for (const s of filtered) {
      const key = s.standard_name || UNASSIGNED
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()].sort(([a], [b]) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)))
  }, [filtered])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="text-sm text-muted-foreground">Register and manage students</p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> Register Student
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">All Students ({filtered.length})</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name or roll no..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Roll No</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No students found.</TableCell></TableRow>
              )}
              {groups.map(([standardName, group]) => (
                <React.Fragment key={standardName}>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="bg-muted/40 py-1.5 text-xs font-semibold text-muted-foreground">
                      {standardName} ({group.length})
                    </TableCell>
                  </TableRow>
                  {group.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-8">
                            {s.photo_url && <AvatarImage src={s.photo_url} />}
                            <AvatarFallback className="p-0"><PhotoFallback /></AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium leading-tight">{s.full_name}</p>
                            <p className="text-xs text-muted-foreground leading-tight">{s.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.roll_number || <span className="text-muted-foreground">— pending hall ticket</span>}
                      </TableCell>
                      <TableCell>{s.centre_name || "—"}</TableCell>
                      <TableCell>{s.exam_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "allowed" ? "success" : "warning"}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setViewing(s)}><Eye className="size-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete student "${s.full_name}"?`)) deleteMutation.mutate(s.id) }}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Student" : "Register Student"}</DialogTitle>
          </DialogHeader>
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }}>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Full Name</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </div>
            {!isEditing && (
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            {!isEditing && (
              <div className="flex flex-col gap-1.5">
                <Label>Date of Birth</Label>
                <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
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
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Photo</Label>
              <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Signature</Label>
              <Input type="file" accept="image/*" onChange={(e) => setSignature(e.target.files?.[0] || null)} />
            </div>
            {!isEditing && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Standard and exam aren't collected here — assign them when you generate this
                student's hall ticket.
              </p>
            )}
            <DialogFooter className="sm:col-span-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdInfo} onOpenChange={() => setCreatedInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Student Registered</DialogTitle>
            <DialogDescription>Share this login detail with the student.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm">
            <p>Default Password: <span className="font-semibold">{createdInfo?.defaultPassword}</span></p>
          </div>
          <p className="text-xs text-muted-foreground">
            A roll number and hall ticket are issued from the Generate Hall Ticket page once a
            standard and exam are assigned. The student must also be Allowed under Verification
            before they can log in.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Student Details</DialogTitle></DialogHeader>
          {viewing && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="size-14">
                    {viewing.photo_url && <AvatarImage src={viewing.photo_url} />}
                    <AvatarFallback className="p-0"><PhotoFallback /></AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{viewing.full_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{viewing.roll_number || "— pending hall ticket"}</p>
                  </div>
                </div>
                <SignatureBox url={viewing.signature_url} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <p><span className="text-muted-foreground">Email:</span> {viewing.email}</p>
                <p><span className="text-muted-foreground">Phone:</span> {viewing.phone}</p>
                <p><span className="text-muted-foreground">DOB:</span> {viewing.dob?.slice(0, 10)}</p>
                <p><span className="text-muted-foreground">Gender:</span> {viewing.gender || "—"}</p>
                <p><span className="text-muted-foreground">Centre:</span> {viewing.centre_name}</p>
                <p><span className="text-muted-foreground">Student Code:</span> {viewing.student_code || "—"}</p>
                <p><span className="text-muted-foreground">Standard:</span> {viewing.standard_name || "—"}</p>
                <p><span className="text-muted-foreground">Exam:</span> {viewing.exam_name || "—"}</p>
                <p><span className="text-muted-foreground">Status:</span> {viewing.status}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
