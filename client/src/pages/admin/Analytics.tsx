import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { BarChart3, Users, Trophy, TrendingDown, TrendingUp, Target } from "lucide-react"
import { adminApi } from "@/api/adminApi"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

function Bar({ value, className }: { value: number | null; className?: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full bg-primary", className)} style={{ width: `${pct}%` }} />
    </div>
  )
}

function difficultyVariant(d: string) {
  if (d === "easy") return "success" as const
  if (d === "medium") return "warning" as const
  if (d === "hard") return "destructive" as const
  return "outline" as const
}

export default function Analytics() {
  const { data: exams } = useQuery({ queryKey: ["exams"], queryFn: adminApi.exams.list })
  const [examId, setExamId] = React.useState<string>("")

  React.useEffect(() => {
    if (!examId && exams && exams.length > 0) setExamId(String(exams[0].id))
  }, [exams, examId])

  const { data: examAnalytics, isLoading: examLoading } = useQuery({
    queryKey: ["analytics-exam", examId],
    queryFn: () => adminApi.analytics.exam(examId),
    enabled: !!examId,
  })

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ["analytics-batches"],
    queryFn: adminApi.analytics.batches,
  })

  const summary = examAnalytics?.summary
  const questionDifficulty = examAnalytics?.questionDifficulty || []
  const weakSubjects = examAnalytics?.weakSubjects || []
  const batchList = (batches || []).filter((b) => b.attemptCount > 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 className="size-5" />
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Computed from actual submitted attempts — difficulty and weak areas are what really
          happened, not a prediction.
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

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></div>
          <div><p className="text-xl font-semibold">{summary?.participantCount ?? "—"}</p><p className="text-xs text-muted-foreground">Participants</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary"><Target className="size-5" /></div>
          <div><p className="text-xl font-semibold">{summary?.avgPercentage ?? "—"}{summary?.avgPercentage != null && "%"}</p><p className="text-xs text-muted-foreground">Average Score</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success"><Trophy className="size-5" /></div>
          <div><p className="text-xl font-semibold">{summary?.passRate ?? "—"}{summary?.passRate != null && "%"}</p><p className="text-xs text-muted-foreground">Pass Rate</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success"><TrendingUp className="size-5" /></div>
          <div><p className="text-xl font-semibold">{summary?.highestPercentage ?? "—"}{summary?.highestPercentage != null && "%"}</p><p className="text-xs text-muted-foreground">Highest</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><TrendingDown className="size-5" /></div>
          <div><p className="text-xl font-semibold">{summary?.lowestPercentage ?? "—"}{summary?.lowestPercentage != null && "%"}</p><p className="text-xs text-muted-foreground">Lowest</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Question Difficulty Report</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Attempted</TableHead>
                <TableHead>Correct Rate</TableHead>
                <TableHead>Difficulty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {examLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!examLoading && questionDifficulty.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No submitted attempts for this exam yet.</TableCell></TableRow>
              )}
              {questionDifficulty.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="max-w-md truncate text-sm" title={q.questionText}>{q.questionText}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{q.subject || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{q.attemptedCount}</TableCell>
                  <TableCell className="w-32">
                    <div className="flex items-center gap-2">
                      <Bar value={q.correctRate} />
                      <span className="w-10 shrink-0 text-xs text-muted-foreground">{q.correctRate ?? "—"}{q.correctRate != null && "%"}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={difficultyVariant(q.difficulty)}>{q.difficulty}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weak Subjects</CardTitle>
          <p className="text-xs text-muted-foreground">
            By question-bank subject (lowest correct rate first) — the areas candidates struggled with most in this exam.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Questions Attempted</TableHead>
                <TableHead>Correct Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!examLoading && weakSubjects.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data yet.</TableCell></TableRow>
              )}
              {weakSubjects.map((s) => (
                <TableRow key={s.subject}>
                  <TableCell className="font-medium">{s.subject}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.attempted}</TableCell>
                  <TableCell className="w-40">
                    <div className="flex items-center gap-2">
                      <Bar value={s.correctRate} className={s.correctRate !== null && s.correctRate < 40 ? "bg-destructive" : undefined} />
                      <span className="w-10 shrink-0 text-xs text-muted-foreground">{s.correctRate ?? "—"}{s.correctRate != null && "%"}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batch-wise Performance Comparison</CardTitle>
          <p className="text-xs text-muted-foreground">Across every submitted exam attempt for each standard.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch (Standard)</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Average Score</TableHead>
                <TableHead>Pass Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchesLoading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {!batchesLoading && batchList.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No submitted attempts yet.</TableCell></TableRow>
              )}
              {batchList.map((b) => (
                <TableRow key={b.standardId}>
                  <TableCell className="font-medium">{b.standardName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.attemptCount}</TableCell>
                  <TableCell className="w-40">
                    <div className="flex items-center gap-2">
                      <Bar value={b.avgPercentage} />
                      <span className="w-10 shrink-0 text-xs text-muted-foreground">{b.avgPercentage ?? "—"}{b.avgPercentage != null && "%"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.passRate ?? "—"}{b.passRate != null && "%"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
