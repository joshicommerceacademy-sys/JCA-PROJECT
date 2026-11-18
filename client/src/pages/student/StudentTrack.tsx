import * as React from "react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Search, Download, CheckCircle2, Clock, Copy, Circle } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/api/client"
import { formatDateTimeWithSeconds } from "@/lib/formatDate"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type Tracked = {
  applicationId: string
  fullName: string
  examName: string | null
  verified: boolean
  hallTicketReady: boolean
  submittedAt: string
  approvedAt: string | null
  hallTicketGeneratedAt: string | null
}

type StepState = "done" | "pending" | "waiting"

function Step({ state, title, detail, last }: { state: StepState; title: string; detail: string; last?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn(
          "flex size-8 items-center justify-center rounded-full border-2",
          state === "done" && "border-success bg-success/10 text-success",
          state === "pending" && "border-warning bg-warning/10 text-warning-foreground",
          state === "waiting" && "border-muted-foreground/30 text-muted-foreground/50"
        )}>
          {state === "done" ? <CheckCircle2 className="size-4" /> : state === "pending" ? <Clock className="size-4" /> : <Circle className="size-3" />}
        </div>
        {!last && <div className={cn("my-1 w-0.5 flex-1 min-h-8", state === "done" ? "bg-success/50" : "bg-border")} />}
      </div>
      <div className="pb-6">
        <p className={cn("font-medium", state === "waiting" && "text-muted-foreground")}>{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

// /student/track           -> the application ID box (also where registration lands)
// /student/track/:id       -> the full result, opened as a new page when Track is pressed
export default function StudentTrack() {
  const { applicationId } = useParams()
  return applicationId ? <TrackResult applicationId={applicationId} /> : <TrackEntry />
}

function TrackEntry() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const state = location.state as { applicationId?: string; justRegistered?: boolean } | null
  const [trackId, setTrackId] = React.useState(state?.applicationId || params.get("id") || "")

  return (
    <div className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <Button asChild variant="ghost" className="self-start"><Link to="/"><ArrowLeft className="size-4" /> Back to Home</Link></Button>

        {state?.justRegistered && state.applicationId && (
          <Card className="border-success/40 bg-success/5 shadow-md">
            <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="size-8 text-success" />
              <p className="text-lg font-semibold">Registered Successfully</p>
              <p className="text-sm text-muted-foreground">Your application ID - keep it to track your application:</p>
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(state.applicationId!); toast.success("Application ID copied") }}
                className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 font-mono text-xl font-semibold tracking-wider"
              >
                {state.applicationId} <Copy className="size-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl"><Search className="size-5 text-primary" /> Track Your Application</CardTitle>
            <CardDescription>Enter your application ID and press Track to see every stage with its date and time.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (trackId.trim()) navigate(`/student/track/${encodeURIComponent(trackId.trim().toUpperCase())}`)
              }}
            >
              <Input className="max-w-xs font-mono uppercase" placeholder="JCA-XXXXXX" value={trackId} onChange={(e) => setTrackId(e.target.value)} />
              <Button type="submit" disabled={!trackId.trim()}>Track</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function TrackResult({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = React.useState(true)
  const [tracked, setTracked] = React.useState<Tracked | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [downloading, setDownloading] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.get(`/public/track/${encodeURIComponent(applicationId)}`)
      .then((r) => { if (!cancelled) setTracked(r.data.data) })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [applicationId])

  async function downloadTicket() {
    if (!tracked) return
    setDownloading(true)
    try {
      const r = await api.get(`/public/hall-ticket/${encodeURIComponent(tracked.applicationId)}`, { responseType: "blob" })
      const url = URL.createObjectURL(r.data as Blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `hall-ticket-${tracked.applicationId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Hall ticket is not available yet.")
    } finally {
      setDownloading(false)
    }
  }

  const approved = !!tracked?.verified
  const hallDone = !!tracked?.hallTicketGeneratedAt

  return (
    <div className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Button asChild variant="ghost" className="self-start"><Link to="/student/track"><ArrowLeft className="size-4" /> Track another application</Link></Button>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl"><Search className="size-5 text-primary" /> Your Application</CardTitle>
            <CardDescription>Every stage of your application with its date and time.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {loading && <p className="text-sm text-muted-foreground">Checking...</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            {tracked && (
              <>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="font-medium">{tracked.fullName}</p>
                  <p className="text-sm text-muted-foreground">{tracked.examName || "-"} · <span className="font-mono">{tracked.applicationId}</span></p>
                </div>

                <div>
                  <Step
                    state="done"
                    title="Application submitted to the administrator"
                    detail={formatDateTimeWithSeconds(tracked.submittedAt)}
                  />
                  <Step
                    state={approved ? "done" : "pending"}
                    title={approved ? "Approved by the administrator" : "Approval pending"}
                    detail={approved && tracked.approvedAt ? formatDateTimeWithSeconds(tracked.approvedAt) : approved ? "Approved" : "Waiting for the administrator to review your application"}
                  />
                  <Step
                    last
                    state={hallDone ? "done" : approved ? "pending" : "waiting"}
                    title={hallDone ? "Hall ticket generated" : "Hall ticket not generated yet"}
                    detail={hallDone && tracked.hallTicketGeneratedAt ? formatDateTimeWithSeconds(tracked.hallTicketGeneratedAt) : approved ? "Your hall ticket will be generated once the exam is scheduled" : "Available after your application is approved"}
                  />
                </div>

                {tracked.hallTicketReady && (
                  <div className="flex flex-col gap-1">
                    <Button className="self-start" onClick={downloadTicket} disabled={downloading}>
                      <Download /> {downloading ? "Preparing..." : "Download Hall Ticket"}
                    </Button>
                    <p className="text-xs text-muted-foreground">The PDF opens with your date of birth in DDMMYYYY format.</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
