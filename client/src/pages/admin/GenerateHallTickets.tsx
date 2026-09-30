import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Ticket, Search, ArrowRight } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { Student } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PhotoFallback } from "@/components/ui/media-placeholder"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

export default function GenerateHallTickets() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: students, isLoading } = useQuery({ queryKey: ["students"], queryFn: () => adminApi.students.list() })
  const { data: standards } = useQuery({ queryKey: ["standards"], queryFn: adminApi.standards.list })
  const { data: exams } = useQuery({ queryKey: ["exams"], queryFn: adminApi.exams.list })

  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<number[]>([])
  const [standardId, setStandardId] = React.useState("")
  const [examId, setExamId] = React.useState("")
  // Codes assigned as students are checked, keyed by student id — merged over the
  // fetched list so the UI reflects the freshly assigned code without waiting on a refetch.
  const [assignedCodes, setAssignedCodes] = React.useState<Record<number, string>>({})
  const [lastResult, setLastResult] = React.useState<{ createdCount: number; skippedCount: number; examId: string } | null>(null)

  const assignCodeMutation = useMutation({
    mutationFn: (id: number) => adminApi.students.assignCode(id),
    onSuccess: (student) => {
      if (student.student_code) {
        setAssignedCodes((prev) => ({ ...prev, [student.id]: student.student_code! }))
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const generateMutation = useMutation({
    mutationFn: () => adminApi.hallTickets.generate({ studentIds: selected, standardId, examId }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["students"] })
      queryClient.invalidateQueries({ queryKey: ["hall-tickets"] })
      queryClient.invalidateQueries({ queryKey: ["exams"] })
      toast.success(`Generated ${result.created.length} hall ticket(s), skipped ${result.skipped.length}`)
      setLastResult({ createdCount: result.created.length, skippedCount: result.skipped.length, examId })
      setSelected([])
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function toggleStudent(student: Student, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, student.id] : prev.filter((id) => id !== student.id)))
    if (checked && !student.student_code && !assignedCodes[student.id]) {
      assignCodeMutation.mutate(student.id)
    }
  }

  // Bulk-select every currently visible (search-filtered) student in one go. Student codes for
  // any of them still missing one are assigned server-side by POST /generate itself, so this
  // deliberately skips the eager per-row assignCodeMutation call the checkbox path makes above
  // to avoid firing a burst of N requests when selecting a large roster at once.
  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? filtered.map((s) => s.id) : [])
  }

  const filtered = (students || []).filter(
    (s) =>
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  )

  const selectedStudents = (students || []).filter((s) => selected.includes(s.id))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generate Hall Tickets</h1>
        <p className="text-sm text-muted-foreground">
          Select registered students, pick a standard and exam, and issue hall tickets in bulk
        </p>
      </div>

      {selectedStudents.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Selected ({selectedStudents.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {selectedStudents.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                <Avatar className="size-8">
                  {s.photo_url && <AvatarImage src={s.photo_url} />}
                  <AvatarFallback className="p-0"><PhotoFallback /></AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium leading-tight">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{s.email} · {s.phone} · DOB {s.dob?.slice(0, 10)}</p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  Student Code: {assignedCodes[s.id] || s.student_code || "will be assigned"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Ticket className="size-4" /> Standard &amp; Exam</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Standard</Label>
            <Select value={standardId} onValueChange={setStandardId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select standard" /></SelectTrigger>
              <SelectContent>
                {standards?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select exam" /></SelectTrigger>
              <SelectContent>
                {exams?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name} ({e.standard_name})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={selected.length === 0 || !standardId || !examId || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? "Generating..." : `Generate Hall Tickets (${selected.length})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="text-sm">
              Created {lastResult.createdCount} hall ticket(s)
              {lastResult.skippedCount > 0 && `, skipped ${lastResult.skippedCount} (already ticketed)`}.
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate(`/admin/hall-tickets?examId=${lastResult.examId}`)}>
              Go to Hall Tickets to Email <ArrowRight className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Registered Students ({filtered.length})</CardTitle>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={filtered.length === 0}
              onClick={() => toggleSelectAll(!(filtered.length > 0 && filtered.every((s) => selected.includes(s.id))))}
            >
              {filtered.length > 0 && filtered.every((s) => selected.includes(s.id))
                ? "Deselect All"
                : `Bulk Select All (${filtered.length})`}
            </Button>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search name or email..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((s) => selected.includes(s.id))}
                    onCheckedChange={(c) => toggleSelectAll(!!c)}
                  />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Roll No.</TableHead>
                <TableHead>Current Standard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No registered students found.</TableCell></TableRow>
              )}
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Checkbox checked={selected.includes(s.id)} onCheckedChange={(c) => toggleStudent(s, !!c)} />
                  </TableCell>
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
                  <TableCell>{s.centre_name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{s.roll_number || "—"}</TableCell>
                  <TableCell>{s.standard_name || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
