import * as React from "react"
import { serverNow } from "@/lib/serverClock"
import { getExamWindow } from "@/lib/examWindow"

// The exam's total duration is never shown to candidates. This cell shows only a live countdown:
// to the start time (shown the whole time before the exam begins), then "Started"; for a
// candidate resuming an attempt it shows their remaining time instead.
export function ExamStartTimer({
  examDate, startTime, resuming, remainingMinutes,
}: {
  examDate: string
  startTime: string
  resuming?: boolean
  remainingMinutes?: number | null
}) {
  const [now, setNow] = React.useState(() => serverNow())
  React.useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 1000)
    return () => clearInterval(id)
  }, [])

  if (resuming) {
    return (
      <div>
        <p className="text-muted-foreground">Time Remaining</p>
        <p className="font-medium">{remainingMinutes} min left</p>
      </div>
    )
  }

  const { start } = getExamWindow({ exam_date: examDate, start_time: startTime, duration_minutes: 0 })
  const diff = start.getTime() - now
  if (diff <= 0) {
    return (
      <div>
        <p className="text-muted-foreground">Exam</p>
        <p className="font-medium text-success">Started</p>
      </div>
    )
  }
  const total = Math.ceil(diff / 1000)
  const hh = Math.floor(total / 3600)
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const ss = String(total % 60).padStart(2, "0")
  return (
    <div>
      <p className="text-muted-foreground">Exam starts in</p>
      <p className="font-mono font-medium">{hh > 0 ? `${hh}:` : ""}{mm}:{ss}</p>
    </div>
  )
}
