import * as React from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import { ArrowLeft, FileDown } from "lucide-react"
import { api, getErrorMessage } from "@/api/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LinkClosed, usePublicLinkStatus } from "@/components/student/LinkClosed"

interface PublicResult {
  studentName: string
  rollNumber: string
  examName: string
  marksObtained: number
  totalMarks: number
  percentage: number
  resultStatus: "passed" | "failed"
  pdfAvailable: boolean
}

// Reads the real message out of a blob-typed error response.
async function blobErrorMessage(err: unknown): Promise<string> {
  let msg = getErrorMessage(err)
  const data = (err as { response?: { data?: Blob } }).response?.data
  if (data instanceof Blob) {
    try { msg = JSON.parse(await data.text()).message || msg } catch { /* keep default */ }
  }
  return msg
}

export default function ResultView() {
  const linkStatus = usePublicLinkStatus()
  const { examId } = useParams()
  const location = useLocation()
  const [examName, setExamName] = React.useState<string>((location.state as { name?: string } | null)?.name || "")
  const [rollNumber, setRollNumber] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [downloading, setDownloading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [result, setResult] = React.useState<PublicResult | null>(null)

  React.useEffect(() => {
    if (examName) return
    api.get("/public/result-exams").then((r) => {
      const found = (r.data.data || []).find((x: { id: number; name: string }) => String(x.id) === examId)
      if (found) setExamName(found.name)
    }).catch(() => {})
  }, [examId, examName])

  // Step 1: only the marks, total marks and pass / fail come back - nothing is opened or downloaded.
  async function showResult(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setResult(null)
    setLoading(true)
    try {
      const res = await api.post("/public/result", { examId, rollNumber: rollNumber.trim() })
      setResult(res.data.data as PublicResult)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Step 2 (only when the admin enabled it, and only when the candidate asks): download the PDF.
  async function downloadPdf() {
    if (!result) return
    setError("")
    setDownloading(true)
    try {
      const res = await api.post("/public/result-pdf", { examId, rollNumber: result.rollNumber }, { responseType: "blob" })
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }))
      const link = document.createElement("a")
      link.href = url
      link.download = `Result-${result.rollNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(await blobErrorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  const passed = result?.resultStatus === "passed"
  if (linkStatus && !linkStatus.resultEnabled) {
    return <LinkClosed title="Results are not available" message={linkStatus.resultMessage} />
  }

  return (
    <div className="flex min-h-svh flex-col items-center bg-background p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <Link to="/results" className="mb-2 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All exams</Link>
          <CardTitle className="text-2xl">{examName || "Exam"}</CardTitle>
          <CardDescription>Enter your roll number to see your result.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={showResult} className="flex flex-col gap-3">
            <Label htmlFor="roll">Roll Number</Label>
            <Input id="roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} placeholder="e.g. A12345" autoComplete="off" />
            <Button type="submit" disabled={loading || !rollNumber.trim()}>{loading ? "Loading..." : "Show Result"}</Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {result && (
            <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
              <div>
                <p className="text-lg font-semibold leading-tight">{result.studentName}</p>
                <p className="text-sm text-muted-foreground">
                  Roll number <span className="font-mono font-medium text-foreground">{result.rollNumber}</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-2xl font-semibold">{result.marksObtained}</p>
                  <p className="text-xs text-muted-foreground">Marks Obtained</p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-2xl font-semibold">{result.totalMarks}</p>
                  <p className="text-xs text-muted-foreground">Total Marks</p>
                </div>
                <div className="flex flex-col items-center justify-center gap-1 rounded-lg border bg-background p-3">
                  <Badge variant={passed ? "success" : "destructive"} className="text-sm uppercase">{passed ? "Pass" : "Fail"}</Badge>
                  <p className="text-xs text-muted-foreground">Result</p>
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">Percentage: <span className="font-medium text-foreground">{result.percentage}%</span></p>

              {result.pdfAvailable && (
                <Button variant="outline" onClick={downloadPdf} disabled={downloading}>
                  <FileDown className="size-4" /> {downloading ? "Preparing PDF..." : "Download PDF"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
