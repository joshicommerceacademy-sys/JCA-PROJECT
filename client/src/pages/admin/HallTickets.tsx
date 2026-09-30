import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Ticket, Mail, Send } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog"
import { formatDate } from "@/lib/formatDate"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PhotoFallback } from "@/components/ui/media-placeholder"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"

interface FailedSend {
  ticketId: number
  studentName: string
  email: string
  error: string
}

function SeatCell({ ticketId, seatNumber }: { ticketId: number; seatNumber: string | null }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState(seatNumber || "")

  const updateMutation = useMutation({
    mutationFn: () => adminApi.hallTickets.updateSeat(ticketId, value.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hall-tickets"] })
      setEditing(false)
      toast.success("Seat number updated")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && updateMutation.mutate()}
          className="h-7 w-20 text-xs"
          autoFocus
        />
        <Button size="sm" variant="ghost" className="h-7 px-2" disabled={!value.trim() || updateMutation.isPending} onClick={() => updateMutation.mutate()}>
          Save
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="font-mono text-xs underline decoration-dotted underline-offset-2 hover:text-primary"
    >
      {seatNumber || "Set seat"}
    </button>
  )
}

export default function HallTickets() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { data: exams } = useQuery({ queryKey: ["exams"], queryFn: adminApi.exams.list })
  const [examId, setExamId] = React.useState<string>(searchParams.get("examId") || "all")
  const [selected, setSelected] = React.useState<number[]>([])
  const [failedSends, setFailedSends] = React.useState<FailedSend[]>([])
  const [confirmTarget, setConfirmTarget] = React.useState<{ type: "single"; id: number } | { type: "bulk"; ids: number[] } | null>(null)

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["hall-tickets", { examId }],
    queryFn: () => adminApi.hallTickets.list(examId !== "all" ? { examId } : undefined),
  })

  const list = tickets || []

  function toggleAll(checked: boolean) {
    setSelected(checked ? list.map((t) => t.id) : [])
  }
  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((i) => i !== id)))
  }

  const sendMutation = useMutation({
    mutationFn: ({ id, confirmPassword }: { id: number; confirmPassword: string }) =>
      adminApi.hallTickets.send(id, confirmPassword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hall-tickets"] })
      toast.success("Hall ticket emailed")
      setConfirmTarget(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const bulkSendMutation = useMutation({
    mutationFn: ({ ids, confirmPassword }: { ids: number[]; confirmPassword: string }) =>
      adminApi.hallTickets.bulkSend(ids, confirmPassword),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["hall-tickets"] })
      setSelected([])
      toast.success(
        `Sent ${result.sentCount} email(s)${result.failedCount ? `, ${result.failedCount} failed` : ""}`
      )
      setFailedSends(result.failed)
      setConfirmTarget(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function handleConfirm(password: string) {
    if (!confirmTarget) return
    if (confirmTarget.type === "single") sendMutation.mutate({ id: confirmTarget.id, confirmPassword: password })
    else bulkSendMutation.mutate({ ids: confirmTarget.ids, confirmPassword: password })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hall Tickets</h1>
          <p className="text-sm text-muted-foreground">Generated from the Generate Hall Tickets page</p>
        </div>
        <Select value={examId} onValueChange={setExamId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Filter by exam" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Exams</SelectItem>
            {exams?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2"><Ticket className="size-4" /> Generated Hall Tickets</CardTitle>
          {selected.length > 0 && (
            <Button size="sm" onClick={() => setConfirmTarget({ type: "bulk", ids: selected })} disabled={bulkSendMutation.isPending}>
              <Mail /> Email Selected ({selected.length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={list.length > 0 && selected.length === list.length} onCheckedChange={(c) => toggleAll(!!c)} />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Hall Ticket No.</TableHead>
                <TableHead>Seat</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Date &amp; Time</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Email Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!isLoading && list.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No hall tickets generated yet.</TableCell></TableRow>
              )}
              {list.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Checkbox checked={selected.includes(t.id)} onCheckedChange={(c) => toggleOne(t.id, !!c)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-8">
                        {t.photo_url && <AvatarImage src={t.photo_url} />}
                        <AvatarFallback className="p-0"><PhotoFallback /></AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium leading-tight">{t.student_name}</p>
                        <p className="text-xs text-muted-foreground font-mono leading-tight">{t.roll_number}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.hall_ticket_number}</TableCell>
                  <TableCell><SeatCell ticketId={t.id} seatNumber={t.seat_number} /></TableCell>
                  <TableCell>{t.exam_name}</TableCell>
                  <TableCell>{formatDate(t.exam_date)} · {t.start_time}</TableCell>
                  <TableCell>{t.centre_name}</TableCell>
                  <TableCell>
                    <Badge variant={t.email_sent_at ? "success" : "outline"}>
                      {t.email_sent_at ? `Sent ${formatDate(t.email_sent_at)}` : "Not sent"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmTarget({ type: "single", id: t.id })}
                      disabled={sendMutation.isPending}
                    >
                      <Send className="size-3.5" /> Send
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={failedSends.length > 0} onOpenChange={(open) => !open && setFailedSends([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Some emails failed to send</DialogTitle>
            <DialogDescription>
              {failedSends.length} email(s) could not be delivered. Fix the issue (e.g. invalid address,
              SMTP limits) and retry.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {failedSends.map((f) => (
              <div key={f.ticketId} className="rounded-md border p-2 text-sm">
                <p className="font-medium">{f.studentName} <span className="text-muted-foreground font-normal">({f.email})</span></p>
                <p className="text-xs text-destructive">{f.error}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setConfirmTarget({ type: "bulk", ids: failedSends.map((f) => f.ticketId) })}
              disabled={bulkSendMutation.isPending}
            >
              Retry Failed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmPasswordDialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title="Confirm Hall Ticket Email"
        description="Enter the confirmation password to email the hall ticket(s)."
        pending={sendMutation.isPending || bulkSendMutation.isPending}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
