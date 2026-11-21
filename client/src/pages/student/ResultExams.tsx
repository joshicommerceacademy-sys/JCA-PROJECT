import * as React from "react"
import { LinkClosed, usePublicLinkStatus } from "@/components/student/LinkClosed"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, ClipboardList } from "lucide-react"
import { api } from "@/api/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

type ResultExam = { id: number; name: string }

export default function ResultExams() {
  const linkStatus = usePublicLinkStatus()
  const navigate = useNavigate()
  const [exams, setExams] = React.useState<ResultExam[] | null>(null)

  React.useEffect(() => {
    api.get("/public/result-exams").then((r) => setExams(r.data.data || [])).catch(() => setExams([]))
  }, [])

  if (linkStatus && !linkStatus.resultEnabled) {
    return <LinkClosed title="Results are not available" message={linkStatus.resultMessage} />
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <Link to="/" className="mb-2 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Home</Link>
          <CardTitle className="flex items-center gap-2 text-2xl">📊 Results</CardTitle>
          <CardDescription>Only exams whose results have been approved by the academy are shown.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {exams === null && <Skeleton className="h-24 w-full" />}
          {exams?.length === 0 && <p className="text-sm text-muted-foreground">No results have been opened yet.</p>}
          {exams?.map((x) => (
            <Button
              key={x.id}
              variant="outline"
              className="h-auto justify-between gap-3 py-3 text-left"
              onClick={() => navigate(`/results/${x.id}`, { state: { name: x.name } })}
            >
              <span className="flex items-center gap-2 font-semibold whitespace-normal"><ClipboardList className="size-4 text-primary" /> {x.name}</span>
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
