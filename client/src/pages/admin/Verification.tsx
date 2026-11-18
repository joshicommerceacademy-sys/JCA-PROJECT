import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"
import { formatDate } from "@/lib/formatDate"
import { LogOut, Menu, Search, PartyPopper, UserCheck, RotateCcw, Users, Ban, CheckCheck, UserMinus } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import type { Exam, Student } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { CameraCapture } from "@/components/CameraCapture"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"

type View = "desk" | "reappear" | "data"

const VIEW_TITLES: Record<View, string> = {
  desk: "Verification Desk",
  reappear: "Reappear",
  data: "Candidate Data",
}

// Verification Desk for one exam. The three-line menu (top left) switches between:
//  - Verification Desk: every candidate of this exam; Allow / Disallow only.
//  - Reappear: mark an interrupted candidate to reappear (shows just the word "Reappear").
//  - Candidate Data: this exam's candidates and their details.
// Everything shown here belongs to this exam only.
export default function Verification({ exam, onExit, operator, slotId, onSelectSlot }: { exam: Exam; onExit: () => void; operator?: string; slotId?: string | null; onSelectSlot?: (id: string) => void }) {
  const queryClient = useQueryClient()
  // A desk session starts on a blank page showing only the menu button; the admin page starts on the desk list.
  const [viewState, setView] = React.useState<View | null>(operator ? null : "desk")
  const [pendingView, setPendingView] = React.useState<View | null>(null)
  const view: View = viewState ?? "desk"
  const blank = viewState === null
  const [searchText, setSearchText] = React.useState("")
  const [cameraFor, setCameraFor] = React.useState<Student | null>(null)
  const [closedPopup, setClosedPopup] = React.useState(false)
  const [notOpenMessage, setNotOpenMessage] = React.useState<string | null>(null)
  const navigate = useNavigate()
  const [disallowFor, setDisallowFor] = React.useState<Student | null>(null)
  const [reason, setReason] = React.useState("")
  const [allowedPopup, setAllowedPopup] = React.useState<{ name: string; seatNumber: string | null; labName: string | null } | null>(null)

  const seating = !!exam.seat_number_required
  const livePhoto = !!exam.live_photo_capture
  const needle = searchText.trim().toLowerCase()

  const { data: roster, isLoading } = useQuery({
    queryKey: ["desk-roster", exam.id, slotId ?? null],
    queryFn: () => adminApi.students.list(slotId ? { slotId } : undefined),
    refetchInterval: 15000,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["desk-roster"] })
  }

  const allowMutation = useMutation({
    mutationFn: async ({ student, photo }: { student: Student; photo?: Blob }) => {
      if (photo) await adminApi.students.uploadLivePhoto(student.id, photo)
      return { student, result: await adminApi.students.deskAllow(student.id) }
    },
    onSuccess: ({ student, result }) => {
      refresh()
      setCameraFor(null)
      if (seating) setAllowedPopup({ name: student.full_name, seatNumber: result.seatNumber, labName: result.labName })
      else toast.success(`${student.full_name} allowed`)
    },
    onError: (error) => {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === "DESK_NOT_OPEN") {
        setCameraFor(null)
        setNotOpenMessage(getErrorMessage(error))
      } else if (code === "DESK_CLOSED") {
        setCameraFor(null)
        setClosedPopup(true)
        refresh()
      } else toast.error(getErrorMessage(error))
    },
  })
  const disallowMutation = useMutation({
    mutationFn: ({ id, why }: { id: number; why: string }) => adminApi.students.deskDisallow(id, why),
    onSuccess: () => { refresh(); setDisallowFor(null); setReason(""); toast.success("Disallowed") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  // Verify All / Revoke All act on the whole batch that is open on this desk.
  const [bulkAction, setBulkAction] = React.useState<"verify" | "revoke" | null>(null)
  const bulkMutation = useMutation({
    mutationFn: async (action: "verify" | "revoke") => {
      const target = slotId ? Number(slotId) : exam.id
      return action === "verify"
        ? { action, ...(await adminApi.students.deskVerifyAll(target)) }
        : { action, ...(await adminApi.students.deskRevokeAll(target)) }
    },
    onSuccess: (r) => {
      refresh()
      setBulkAction(null)
      if (r.action === "verify") {
        const failed = "failed" in r ? r.failed : []
        toast.success(`${"allowed" in r ? r.allowed : 0} candidate(s) verified${failed.length ? `, ${failed.length} could not be allowed (${failed[0].error})` : ""}`)
      } else toast.success(`${"revoked" in r ? r.revoked : 0} candidate(s) revoked and marked Absent`)
    },
    onError: (error) => {
      setBulkAction(null)
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === "DESK_NOT_OPEN") setNotOpenMessage(getErrorMessage(error))
      else if (code === "DESK_CLOSED") setClosedPopup(true)
      else toast.error(getErrorMessage(error))
    },
  })
  function askBulk(action: "verify" | "revoke") {
    if (needsBatch) { toast.error("Select a batch first (open Candidate Verification)."); return }
    setBulkAction(action)
  }

  const reappearMutation = useMutation({
    mutationFn: (id: number) => adminApi.students.deskReappear(id),
    onSuccess: () => refresh(),
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function handleAllow(student: Student) {
    if (activeSlot?.desk_state === "not_open") {
      const t = activeSlot.desk_opens_at ? new Date(activeSlot.desk_opens_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""
      setNotOpenMessage(`Verification desk is not open yet. It opens at ${t}.`)
      return
    }
    if (exam.desk_closed || activeSlot?.desk_state === "closed") { setClosedPopup(true); return }
    if (livePhoto) setCameraFor(student)
    else allowMutation.mutate({ student })
  }

  const all = roster || []
  const matches = (c: Student) =>
    !needle ||
    c.full_name.toLowerCase().includes(needle) ||
    (c.roll_number || "").toLowerCase().includes(needle) ||
    (c.application_id || "").toLowerCase().includes(needle)
  const list = all.filter(matches)
  // The desk list only holds candidates still waiting for a decision; once Allowed or Disallowed they leave it.
  const waiting = list.filter((c) => !c.exam_access_allowed && !c.disallow_reason)
  const allowedCount = all.filter((c) => c.exam_access_allowed).length
  const genderCounts = all.reduce(
    (acc, c) => {
      const g = String(c.gender || "").toLowerCase()
      if (g === "male") acc.male += 1
      else if (g === "female") acc.female += 1
      else acc.other += 1
      return acc
    },
    { male: 0, female: 0, other: 0 }
  )

  const menuItems: { id: View; label: string; icon: React.ReactNode }[] = operator
    ? [
        { id: "desk", label: "Candidate Verification", icon: <UserCheck className="size-4" /> },
        { id: "data", label: "Candidate Data", icon: <Users className="size-4" /> },
        { id: "reappear", label: "Reappear", icon: <RotateCcw className="size-4" /> },
      ]
    : [
        { id: "desk", label: "Verification Desk", icon: <UserCheck className="size-4" /> },
        { id: "reappear", label: "Reappear", icon: <RotateCcw className="size-4" /> },
        { id: "data", label: "Candidate Data", icon: <Users className="size-4" /> },
      ]
  // The batch is asked for once per sign-in: the first menu choice opens the batch list, after
  // that the chosen batch is shown and never asked again.
  const needsBatch = !!operator && !slotId && !!exam.slots?.length
  function choose(id: View) {
    setSearchText("")
    if (needsBatch) setPendingView(id)
    else setView(id)
  }
  function pickBatch(id: number) {
    localStorage.setItem("jca_desk_slot", String(id))
    onSelectSlot?.(String(id))
    setView(pendingView ?? "desk")
    setPendingView(null)
  }
  const activeSlot = exam.slots?.find((s) => String(s.id) === String(slotId))
  const deskClosed = activeSlot ? activeSlot.desk_state === "closed" : !!exam.desk_closed
  const deskNotOpen = activeSlot?.desk_state === "not_open"

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Menu"><Menu className="size-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {menuItems.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => choose(m.id)}>
                  {m.icon} {m.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => askBulk("verify")}><CheckCheck className="size-4" /> Verify All</DropdownMenuItem>
              <DropdownMenuItem onClick={() => askBulk("revoke")}><UserMinus className="size-4" /> Revoke All</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onExit}>
                <LogOut className="size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {blank ? (
            <p className="text-sm text-muted-foreground">
              {exam.name}{exam.desk_centre ? ` · ${exam.desk_centre.name} (${exam.desk_centre.code})` : ""}{operator ? ` · Operator: ${operator}` : ""}
            </p>
          ) : (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{VIEW_TITLES[view]}</h1>
            <p className="text-sm text-muted-foreground">
              {exam.name}{exam.desk_centre ? ` · ${exam.desk_centre.name} (${exam.desk_centre.code})` : ""}{activeSlot ? ` · ${formatDate(activeSlot.exam_date)} ${String(activeSlot.start_time).slice(0, 5)}` : ""} · {allowedCount} of {all.length} allowed{deskClosed ? " · Desk closed" : deskNotOpen ? " · Desk not open yet" : ""}
              {operator ? ` · Operator: ${operator}` : ""}
            </p>
          </div>
          )}
        </div>
      </div>

      {!blank && <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search by name, roll number or application ID…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
      </div>}

      {!blank && view === "desk" && (
        <Card>
          <CardContent className="flex flex-col divide-y p-0">
            {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && waiting.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {needle ? "No matching candidate waiting to be allowed." : all.length ? "Everyone has been dealt with. See Reappear and Candidate Data." : "No candidates for this exam yet."}
              </p>
            )}
            {waiting.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-20 font-mono text-xs text-muted-foreground">{s.roll_number || "—"}</span>
                  <span className="font-medium">{s.full_name}</span>
                  {(deskClosed || s.marked_absent) && <Badge variant="destructive">Absent</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={allowMutation.isPending} onClick={() => handleAllow(s)}>Allow</Button>
                  <Button size="sm" variant="outline" onClick={() => { setReason(""); setDisallowFor(s) }}>Disallow</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!blank && view === "reappear" && (
        <Card>
          <CardContent className="flex flex-col divide-y p-0">
            {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && list.filter((c) => c.exam_access_allowed).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No allowed candidates{needle ? " match your search" : " yet"}.</p>
            )}
            {list.filter((c) => c.exam_access_allowed).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-20 font-mono text-xs text-muted-foreground">{s.roll_number || "—"}</span>
                  <span className="font-medium">{s.full_name}</span>
                  {s.has_reappear && <Badge variant="warning">Reappear</Badge>}
                </div>
                {!s.has_reappear && (
                  <Button size="sm" variant="outline" disabled={reappearMutation.isPending} onClick={() => reappearMutation.mutate(s.id)}>Reappear</Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!blank && view === "data" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Male", value: genderCounts.male },
              { label: "Female", value: genderCounts.female },
              { label: "Others", value: genderCounts.other },
              { label: "Total scheduled", value: all.length },
            ].map((c) => (
              <Card key={c.label}><CardContent className="pt-2">
                <p className="text-2xl font-semibold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </CardContent></Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
            <div>
              <p className="font-medium">{exam.name}</p>
              <p className="text-sm text-muted-foreground">{exam.exam_date ? formatDate(exam.exam_date) : ""}</p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {(exam.slots && exam.slots.length ? exam.slots : [{ id: exam.id, exam_date: exam.exam_date, start_time: exam.start_time }]).map((slot) => (
                <Button key={slot.id} className="flex-col font-mono text-base leading-tight" title="Open candidate data" onClick={() => navigate(`/desk/candidates?slot=${slot.id}`)}>
                  <span>{String(slot.start_time || "").slice(0, 5) || "—"}</span>
                  {exam.slots && exam.slots.length > 1 && <span className="text-[10px] font-normal opacity-80">{slot.exam_date ? formatDate(slot.exam_date) : ""}</span>}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Tap the highlighted time to open the candidates of this exam.</p>
        </div>
      )}

      <CameraCapture
        open={!!cameraFor}
        title={cameraFor ? `Live photo — ${cameraFor.full_name}` : "Live photo"}
        busy={allowMutation.isPending}
        onCancel={() => setCameraFor(null)}
        onCaptured={(blob) => cameraFor && allowMutation.mutate({ student: cameraFor, photo: blob })}
        onSkip={() => cameraFor && allowMutation.mutate({ student: cameraFor })}
      />

      <Dialog open={!!disallowFor} onOpenChange={(o) => !o && setDisallowFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disallow {disallowFor?.full_name}?</DialogTitle>
            <DialogDescription>Give the reason. The candidate will not be allowed for this exam.</DialogDescription>
          </DialogHeader>
          <Input autoFocus placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDisallowFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason.trim() || disallowMutation.isPending} onClick={() => disallowFor && disallowMutation.mutate({ id: disallowFor.id, why: reason.trim() })}>
              Disallow
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{bulkAction === "verify" ? "Verify all candidates?" : "Revoke all candidates?"}</DialogTitle>
            <DialogDescription>
              {bulkAction === "verify"
                ? "Every candidate of this batch still waiting at the desk is allowed for the exam (seats are assigned if Seating Arrangement is on). Candidates you disallowed are skipped."
                : "Every allowed candidate of this batch who has not logged in is revoked and marked Absent. Candidates who have selected a roll number, logged in or started are left as they are."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkAction(null)}>Cancel</Button>
            <Button
              variant={bulkAction === "revoke" ? "destructive" : "default"}
              disabled={bulkMutation.isPending}
              onClick={() => bulkAction && bulkMutation.mutate(bulkAction)}
            >
              {bulkMutation.isPending ? "Please wait..." : bulkAction === "verify" ? "Verify All" : "Revoke All"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!notOpenMessage} onOpenChange={(o) => !o && setNotOpenMessage(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-warning/15 text-warning-foreground">
              <Ban className="size-6" />
            </div>
            <DialogTitle>Verification desk is not open yet</DialogTitle>
            <DialogDescription>{notOpenMessage}</DialogDescription>
          </DialogHeader>
          <Button onClick={() => setNotOpenMessage(null)}>OK</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={closedPopup} onOpenChange={setClosedPopup}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Ban className="size-6" />
            </div>
            <DialogTitle>Verification desk is closed</DialogTitle>
            <DialogDescription>This candidate cannot be allowed for the exam and is marked Absent.</DialogDescription>
          </DialogHeader>
          <Button onClick={() => setClosedPopup(false)}>OK</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingView} onOpenChange={(o) => !o && setPendingView(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Batch</DialogTitle>
            <DialogDescription>Choose the batch whose verification is starting. This is asked only once.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {(exam.slots || []).map((slot) => (
              <Button key={slot.id} variant="outline" className="justify-between" onClick={() => pickBatch(slot.id)}>
                <span>{formatDate(slot.exam_date)}</span><span className="font-mono">{String(slot.start_time).slice(0, 5)}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!allowedPopup} onOpenChange={(o) => !o && setAllowedPopup(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-success/10 text-success">
              <PartyPopper className="size-6" />
            </div>
            <DialogTitle>Successfully Allowed</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-1 pt-2 text-sm">
                <p className="font-medium text-foreground">{allowedPopup?.name}</p>
                <p><span className="text-muted-foreground">Seat Number:</span> <span className="font-mono text-lg font-semibold text-foreground">{allowedPopup?.seatNumber || "—"}</span></p>
                {allowedPopup?.labName && <p className="text-xs text-muted-foreground">{allowedPopup.labName}</p>}
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}
