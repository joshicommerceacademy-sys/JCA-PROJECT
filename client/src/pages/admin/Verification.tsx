import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ShieldCheck, ShieldX, Users, CheckCircle2, XCircle, Lock, LogOut, PartyPopper } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { Exam } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"

function PasswordGate({ onResolved }: { onResolved: (exam: Exam) => void }) {
  const [password, setPassword] = React.useState("")

  const resolveMutation = useMutation({
    mutationFn: () => adminApi.exams.list({ accessPassword: password }),
    onSuccess: (exams) => {
      if (exams.length !== 1) {
        toast.error("No started exam matches this password.")
        return
      }
      onResolved(exams[0])
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <Lock className="size-6" />
          </div>
          <CardTitle>Exam Password Required</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit password revealed on the Exam Schedule page to open the roster
            for that exam.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); resolveMutation.mutate() }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="verification-password">Exam Password</Label>
              <Input
                id="verification-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
            <Button type="submit" disabled={!password || resolveMutation.isPending}>
              {resolveMutation.isPending ? "Checking..." : "Open Roster"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function Verification() {
  const queryClient = useQueryClient()
  const [resolvedExam, setResolvedExam] = React.useState<Exam | null>(null)
  const [selected, setSelected] = React.useState<number[]>([])
  const [seatInputs, setSeatInputs] = React.useState<Record<number, string>>({})
  const [allowedPopup, setAllowedPopup] = React.useState<{ rollNumber: string; seatNumber: string | null } | null>(null)
  const seatNumberRequired = !!resolvedExam?.seat_number_required

  const { data: students, isLoading } = useQuery({
    queryKey: ["students", { examId: resolvedExam?.id }],
    queryFn: () => adminApi.students.list({ examId: String(resolvedExam!.id) }),
    enabled: !!resolvedExam,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["students"] })
    setSelected([])
  }

  const allowMutation = useMutation({
    mutationFn: (id: number) => adminApi.students.allow(id, seatNumberRequired ? seatInputs[id] : undefined),
    onSuccess: (data) => {
      invalidate()
      toast.success("Student allowed")
      if (seatNumberRequired) setAllowedPopup({ rollNumber: data.rollNumber, seatNumber: data.seatNumber })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const disallowMutation = useMutation({
    mutationFn: (id: number) => adminApi.students.disallow(id),
    onSuccess: () => { invalidate(); toast.success("Student disallowed") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const bulkAllowMutation = useMutation({
    mutationFn: () => adminApi.students.bulkAllow(selected),
    onSuccess: () => { invalidate(); toast.success("Selected students allowed") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const bulkDisallowMutation = useMutation({
    mutationFn: () => adminApi.students.bulkDisallow(selected),
    onSuccess: () => { invalidate(); toast.success("Selected students disallowed") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const list = students || []
  const pending = list.filter((s) => s.status === "pending")
  const allowed = list.filter((s) => s.status === "allowed")
  const selectedPending = selected.filter((id) => pending.some((s) => s.id === id))
  const selectedAllowed = selected.filter((id) => allowed.some((s) => s.id === id))

  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((i) => i !== id)))
  }
  function togglePendingAll(checked: boolean) {
    setSelected((prev) => {
      const withoutPending = prev.filter((id) => !pending.some((s) => s.id === id))
      return checked ? [...withoutPending, ...pending.map((s) => s.id)] : withoutPending
    })
  }
  function toggleAllowedAll(checked: boolean) {
    setSelected((prev) => {
      const withoutAllowed = prev.filter((id) => !allowed.some((s) => s.id === id))
      return checked ? [...withoutAllowed, ...allowed.map((s) => s.id)] : withoutAllowed
    })
  }

  if (!resolvedExam) {
    return <PasswordGate onResolved={setResolvedExam} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Student Verification</h1>
          <p className="text-sm text-muted-foreground">
            {resolvedExam.name} — approve registrations. Once Allowed, a student can log in and
            take this exam.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setResolvedExam(null); setSelected([]) }}>
          <LogOut className="size-4" /> Change Exam
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></div>
          <div><p className="text-xl font-semibold">{list.length}</p><p className="text-xs text-muted-foreground">Registered</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success"><CheckCircle2 className="size-5" /></div>
          <div><p className="text-xl font-semibold">{allowed.length}</p><p className="text-xs text-muted-foreground">Allowed</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground"><XCircle className="size-5" /></div>
          <div><p className="text-xl font-semibold">{pending.length}</p><p className="text-xs text-muted-foreground">Pending</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Pending Approval</CardTitle>
          {seatNumberRequired ? (
            <p className="text-xs text-muted-foreground">
              This exam requires a seat number — allow candidates one at a time below.
            </p>
          ) : (
            selectedPending.length > 0 && (
              <Button size="sm" onClick={() => bulkAllowMutation.mutate()}>
                <ShieldCheck /> Allow ({selectedPending.length})
              </Button>
            )
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={pending.length > 0 && selectedPending.length === pending.length}
                    onCheckedChange={(c) => togglePendingAll(!!c)}
                    disabled={seatNumberRequired}
                  />
                </TableHead>
                <TableHead>Roll No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Centre</TableHead>
                {seatNumberRequired && <TableHead>Seat No.</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && pending.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No pending registrations.</TableCell></TableRow>
              )}
              {pending.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Checkbox checked={selected.includes(s.id)} onCheckedChange={(c) => toggleOne(s.id, !!c)} disabled={seatNumberRequired} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.roll_number || "—"}</TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell>{s.centre_name || "—"}</TableCell>
                  {seatNumberRequired && (
                    <TableCell>
                      <Input
                        value={seatInputs[s.id] || ""}
                        onChange={(e) => setSeatInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="Seat no."
                        className="h-8 w-24 text-xs"
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      disabled={seatNumberRequired && !seatInputs[s.id]?.trim()}
                      onClick={() => allowMutation.mutate(s.id)}
                    >
                      Allow
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Allowed Students</CardTitle>
          {selectedAllowed.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => bulkDisallowMutation.mutate()}>
              <ShieldX /> Disallow ({selectedAllowed.length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allowed.length > 0 && selectedAllowed.length === allowed.length} onCheckedChange={(c) => toggleAllowedAll(!!c)} />
                </TableHead>
                <TableHead>Roll No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && allowed.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No students allowed yet.</TableCell></TableRow>
              )}
              {allowed.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Checkbox checked={selected.includes(s.id)} onCheckedChange={(c) => toggleOne(s.id, !!c)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.roll_number || "—"}</TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell>{s.centre_name || "—"}</TableCell>
                  <TableCell><Badge variant="success">allowed</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => disallowMutation.mutate(s.id)}>Disallow</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!allowedPopup} onOpenChange={(open) => !open && setAllowedPopup(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-success/10 text-success">
              <PartyPopper className="size-6" />
            </div>
            <DialogTitle>Successfully Allowed</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-1 pt-2 text-sm">
                <p><span className="text-muted-foreground">Roll Number:</span> <span className="font-mono font-semibold text-foreground">{allowedPopup?.rollNumber}</span></p>
                <p><span className="text-muted-foreground">Seat Number:</span> <span className="font-mono font-semibold text-foreground">{allowedPopup?.seatNumber || "—"}</span></p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}
