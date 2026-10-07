import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { RotateCcw, Trash2, Link2 } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import { formatDateTime } from "@/lib/formatDate"
import type { Exam, ReappearEligibleCandidate, ReappearRequest } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

export default function Reappear() {
  const queryClient = useQueryClient()
  const { data: exams } = useQuery<Exam[]>({
    queryKey: ["exams"],
    queryFn: () => adminApi.exams.list(),
  })
  const [examId, setExamId] = React.useState<string>("")
  const [granting, setGranting] = React.useState<ReappearEligibleCandidate | null>(null)
  const [reason, setReason] = React.useState("")

  React.useEffect(() => {
    if (!examId && exams && exams.length > 0) setExamId(String(exams[0].id))
  }, [exams, examId])

  const { data: eligible, isLoading: eligibleLoading } = useQuery<ReappearEligibleCandidate[]>({
    queryKey: ["reappear-eligible", { examId }],
    queryFn: () => adminApi.reappear.eligible(examId),
    enabled: !!examId,
    refetchInterval: 15000,
  })

  const { data: requests, isLoading: requestsLoading } = useQuery<ReappearRequest[]>({
    queryKey: ["reappear", { examId }],
    queryFn: () => adminApi.reappear.list(examId ? { examId } : undefined),
    enabled: !!examId,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reappear"] })
    queryClient.invalidateQueries({ queryKey: ["reappear-eligible"] })
  }

  const grantMutation = useMutation({
    mutationFn: () =>
      adminApi.reappear.create({
        studentId: granting!.id,
        examId: Number(examId),
        reason: reason || undefined,
      }),
    onSuccess: (data) => {
      invalidate()
      toast.success(`Reappear granted for ${granting?.full_name} — ${data.remainingMinutes} min remaining`)
      setGranting(null)
      setReason("")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.reappear.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success("Reappear record deleted")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function copyLoginLink(rollNumber: string) {
    const link = `${window.location.origin}/student/login?examId=${examId}&roll=${encodeURIComponent(rollNumber)}`
    navigator.clipboard.writeText(link)
      .then(() => toast.success("Login link copied — send it to the candidate"))
      .catch(() => toast.error("Couldn't copy the link"))
  }

  const candidateList = eligible || []
  const requestList = requests || []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reappear</h1>
        <p className="text-sm text-muted-foreground">
          Only for a candidate whose exam was live and got stopped for any reason (power failure,
          PC issue, etc) before they submitted — not available once an exam has been submitted.
          The new attempt gets only the time that was left when it stopped, not a fresh full duration.
        </p>
      </div>

      <div className="max-w-xs">
        <Select value={examId} onValueChange={setExamId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select exam" /></SelectTrigger>
          <SelectContent>
            {exams?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Interrupted Candidates</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Roll No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Answered</TableHead>
                <TableHead>Detected Remaining</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eligibleLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!eligibleLoading && candidateList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No live-but-unsubmitted attempts for this exam right now.
                  </TableCell>
                </TableRow>
              )}
              {candidateList.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.roll_number}</TableCell>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(c.started_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.last_activity_at ? formatDateTime(c.last_activity_at) : "None yet"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.answered_count}</TableCell>
                  <TableCell>
                    <Badge variant={c.window_expired ? "destructive" : "warning"}>
                      {c.detected_remaining_minutes} min
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setGranting(c)}>
                      <RotateCcw className="size-3.5" /> Grant Reappear
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reappear Requests</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Roll No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Granted</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestsLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!requestsLoading && requestList.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No reappear requests for this exam.</TableCell></TableRow>
              )}
              {requestList.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.roll_number}</TableCell>
                  <TableCell className="font-medium">{r.student_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reason || "—"}</TableCell>
                  <TableCell className="text-sm">{r.remaining_minutes ? `${r.remaining_minutes} min` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "completed" ? "success" : "warning"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.completed_at ? formatDateTime(r.completed_at) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" && (
                      <Button variant="ghost" size="icon" title="Copy login link" onClick={() => copyLoginLink(r.roll_number)}>
                        <Link2 className="size-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this reappear record?")) deleteMutation.mutate(r.id) }}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!granting} onOpenChange={(open) => !open && setGranting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Reappear</DialogTitle>
            <DialogDescription>
              This clears {granting?.full_name}'s stuck attempt and lets them log in again,
              bypassing the normal login window.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>Detected Remaining Time</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
              {granting?.detected_remaining_minutes} minutes
            </div>
            <p className="text-xs text-muted-foreground">
              Computed from when the exam actually stopped — the exam's total duration minus the
              time already used up to {granting?.last_activity_at ? "their last saved answer" : "their start time (no answers were saved)"}.
              Not editable, so candidates only ever get back the time they had left, never extra.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reason (optional)</Label>
            <Textarea
              placeholder="e.g. Power failure at centre during the exam"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => grantMutation.mutate()} disabled={grantMutation.isPending}>
              {grantMutation.isPending ? "Granting..." : "Grant Reappear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
