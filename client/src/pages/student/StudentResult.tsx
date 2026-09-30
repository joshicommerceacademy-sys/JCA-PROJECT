import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, Trophy, ChevronDown, ChevronUp } from "lucide-react"
import { studentApi } from "@/api/studentApi"
import { useStudentAuth } from "@/context/StudentAuthContext"
import { formatDateTime } from "@/lib/formatDate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function StudentResult() {
  const navigate = useNavigate()
  const { logout } = useStudentAuth()
  const { data, isLoading } = useQuery({ queryKey: ["student-result"], queryFn: studentApi.getResult })
  const [showSubjects, setShowSubjects] = React.useState(false)

  function handleBackToLogin() {
    logout()
    navigate("/student/login")
  }

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Skeleton className="h-80 w-full max-w-lg" />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-7" />
          </div>
          <CardTitle className="text-xl">Exam Submitted Successfully</CardTitle>
          <CardDescription>{data?.exam_name}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {data?.show_provisional_result ? (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-lg font-semibold">{data?.total_questions}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-lg font-semibold text-success">{data?.correct_count}</p>
                  <p className="text-xs text-muted-foreground">Attempted Correctly</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-lg font-semibold">{data?.unanswered_count}</p>
                  <p className="text-xs text-muted-foreground">Unattempted</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Trophy className="size-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Score</p>
                    <p className="font-semibold">{data?.marks_obtained} / {data?.total_marks} ({data?.percentage}%)</p>
                  </div>
                </div>
                <Badge variant={data?.result_status === "passed" ? "success" : "destructive"} className="text-sm">
                  {data?.result_status}
                </Badge>
              </div>

              {data && data.subjects.length > 1 && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSubjects((s) => !s)}
                    className="flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    {showSubjects ? "Hide Subjects" : "View More Subjects"}
                    {showSubjects ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                  {showSubjects && (
                    <div className="flex flex-col gap-2">
                      {data.subjects.map((subject) => (
                        <div key={subject.label} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                          <span className="font-medium">{subject.label}</span>
                          <span className="text-muted-foreground">
                            {subject.marksObtained} / {subject.totalMarks} ({subject.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Your result will be declared by the administrator.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Started</p>
              <p className="font-medium">{data && formatDateTime(data.started_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Submitted</p>
              <p className="font-medium">{data && formatDateTime(data.submitted_at)}</p>
            </div>
          </div>

          <Button onClick={handleBackToLogin}>Back to Login</Button>
        </CardContent>
      </Card>
    </div>
  )
}
