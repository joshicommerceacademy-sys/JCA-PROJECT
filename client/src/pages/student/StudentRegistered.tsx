import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { ArrowLeft, Search, Download, CheckCircle2, Clock, Copy } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/api/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Tracked = { applicationId: string; fullName: string; examName: string | null; verified: boolean; hallTicketReady: boolean }

// Shown right after a registration is submitted: the success message with the application ID,
// then "Track Your Application" (left empty - the candidate types the ID in themselves).
export default function StudentRegistered() {
  const location = useLocation()
  const submittedId = (location.state as { applicationId?: string } | null)?.applicationId ?? null

  const [trackId, setTrackId] = React.useState("")
  const [tracking, setTracking] = React.useState(false)
  const [tracked, setTracked] = React.useState<Tracked | null>(null)
  const [downloading, setDownloading] = React.useState(false)

  async function track(e?: React.FormEvent) {
    e?.preventDefault()
    if (!trackId.trim()) return
    setTracking(true)
    setTracked(null)
    try {
      const r = await api.get(`/public/track/${encodeURIComponent(trackId.trim())}`)
      setTracked(r.data.data)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setTracking(false)
    }
  }

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

  function copyId() {
    if (!submittedId) return
    navigator.clipboard?.writeText(submittedId)
    toast.success("Application ID copied")
  }

  return (
    <div className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <Button asChild variant="ghost" className="self-start"><Link to="/"><ArrowLeft className="size-4" /> Back to Home</Link></Button>

        {submittedId && (
          <Card className="border-success/40 bg-success/5 shadow-md">
            <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="size-8 text-success" />
              <p className="text-lg font-semibold">Registered Successfully</p>
              <p className="text-sm text-muted-foreground">Your application ID - keep it to track your application:</p>
              <button type="button" onClick={copyId} className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 font-mono text-xl font-semibold tracking-wider">
                {submittedId} <Copy className="size-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl"><Search className="size-5 text-primary" /> Track Your Application</CardTitle>
            <CardDescription>Enter your application ID to see whether it has been verified.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form className="flex flex-wrap gap-2" onSubmit={track}>
              <Input className="max-w-xs font-mono uppercase" placeholder="JCA-XXXXXX" value={trackId} onChange={(e) => setTrackId(e.target.value)} />
              <Button type="submit" disabled={!trackId.trim() || tracking}>{tracking ? "Checking..." : "Track"}</Button>
            </form>
            {tracked && (
              <div className="flex flex-col gap-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{tracked.fullName}</p>
                  <p className="text-sm text-muted-foreground">{tracked.examName || "-"} · {tracked.applicationId}</p>
                </div>
                {tracked.verified ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 className="size-4" /> Verified</p>
                ) : (
                  <p className="flex items-center gap-2 text-sm font-medium text-warning-foreground"><Clock className="size-4" /> Not verified yet</p>
                )}
                {tracked.verified && (
                  tracked.hallTicketReady ? (
                    <div className="flex flex-col gap-1">
                      <Button className="self-start" onClick={downloadTicket} disabled={downloading}>
                        <Download /> {downloading ? "Preparing..." : "Download Hall Ticket"}
                      </Button>
                      <p className="text-xs text-muted-foreground">The PDF opens with your date of birth in DDMMYYYY format.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Your hall ticket will be available once the exam is scheduled.</p>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
