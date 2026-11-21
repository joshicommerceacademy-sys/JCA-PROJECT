import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { FileDown, MonitorCheck } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { getErrorMessage } from "@/api/client"
import { formatDate, formatDateTime } from "@/lib/formatDate"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type DeskStatus = "logged_in" | "active" | "inactive"

function StatusBadge({ status }: { status: DeskStatus }) {
  if (status === "active") return <Badge variant="success">Active</Badge>
  if (status === "logged_in") return <Badge variant="warning">Logged in</Badge>
  return <Badge variant="outline">Inactive</Badge>
}

// Per exam: is the Verification Desk signed in? Logged in = signed in but nobody verified yet,
// Active = signed in and verifying, Inactive = not signed in / not seen for 30 minutes.
// Click an exam name to download that exam's Verification Desk report (PDF).
export default function VerificationDeskReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["desk-report"],
    queryFn: () => adminApi.monitor.deskReport(),
    refetchInterval: 15000,
  })
  const exams = data?.exams || []

  async function download(examId: number) {
    try {
      const res = await adminApi.monitor.deskReportPdf(examId)
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `verification-desk-report-${examId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      let msg = getErrorMessage(error)
      const body = (error as { response?: { data?: Blob } }).response?.data
      if (body instanceof Blob) { try { msg = JSON.parse(await body.text()).message || msg } catch { /* keep */ } }
      toast.error(msg)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold"><MonitorCheck className="size-5" /> Verification Desk</h2>
        <p className="text-sm text-muted-foreground">
          Click an exam name to download its Verification Desk report. Status refreshes every 15 seconds.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Desk Login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>}
                {!isLoading && exams.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No exams scheduled.</TableCell></TableRow>}
                {exams.map((e) => (
                  <TableRow key={e.examId}>
                    <TableCell>
                      <button type="button" onClick={() => download(e.examId)} className="flex items-center gap-1.5 text-left font-medium text-primary hover:underline" title="Download Verification Desk report">
                        <FileDown className="size-4 shrink-0" /> {e.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(e.examDate)} · <span className="font-mono">{String(e.startTime).slice(0, 5)}</span></TableCell>
                    <TableCell className="text-xs">
                      {e.logins.map((l) => <div key={l.userId} className="font-mono">{l.userId}{l.centreName ? ` (${l.centreName})` : ""}</div>)}
                    </TableCell>
                    <TableCell>
                      {e.logins.map((l) => <div key={l.userId} className="mb-1 last:mb-0"><StatusBadge status={l.status} /></div>)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.logins.map((l) => <div key={l.userId}>{l.lastSeenAt ? formatDateTime(l.lastSeenAt) : "Never signed in"}</div>)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
