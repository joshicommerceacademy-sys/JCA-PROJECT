import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Users, ShieldCheck, Clock, BookOpen, CalendarClock, Trophy, CalendarDays } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { formatDate } from "@/lib/formatDate"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const statCards = [
  { key: "totalStudents", label: "Total Students", icon: Users, color: "text-primary bg-primary/10" },
  { key: "allowedStudents", label: "Allowed", icon: ShieldCheck, color: "text-success bg-success/10" },
  { key: "pendingStudents", label: "Pending", icon: Clock, color: "text-warning-foreground bg-warning/15" },
  { key: "totalQuestions", label: "Published Questions", icon: BookOpen, color: "text-primary bg-primary/10" },
  { key: "totalExams", label: "Exams Scheduled", icon: CalendarClock, color: "text-primary bg-primary/10" },
  { key: "totalResults", label: "Results Submitted", icon: Trophy, color: "text-success bg-success/10" },
] as const

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => adminApi.dashboardStats() })
  const [now, setNow] = React.useState(new Date())

  React.useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of the exam portal</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="font-medium">{now.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono font-semibold tabular-nums">{now.toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.key}>
            <CardContent className="flex items-center gap-4 pt-2">
              <div className={`flex size-11 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon className="size-5" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-7 w-14" />
                ) : (
                  <p className="text-2xl font-semibold leading-tight">
                    {card.key === "totalStudents" ? data?.totalStudents
                      : card.key === "allowedStudents" ? data?.allowedStudents
                      : card.key === "pendingStudents" ? data?.pendingStudents
                      : card.key === "totalQuestions" ? data?.totalQuestions
                      : card.key === "totalExams" ? data?.totalExams
                      : data?.totalResults}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently Registered Students</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {isLoading && <Skeleton className="h-24 w-full" />}
            {data?.recentStudents.length === 0 && (
              <p className="text-sm text-muted-foreground">No students registered yet.</p>
            )}
            {data?.recentStudents.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground">{s.roll_number}</p>
                </div>
                <Badge variant={s.status === "allowed" ? "success" : "warning"}>{s.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming / Ongoing Exams</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {isLoading && <Skeleton className="h-24 w-full" />}
            {data?.upcomingExams.length === 0 && (
              <p className="text-sm text-muted-foreground">No upcoming exams scheduled.</p>
            )}
            {data?.upcomingExams.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(e.exam_date)} · {e.start_time}
                  </p>
                </div>
                <Badge variant={e.status === "ongoing" ? "success" : "outline"}>{e.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
