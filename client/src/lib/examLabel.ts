import { formatDate } from "@/lib/formatDate"

// An exam can run in several date/time slots that share its name; add the slot when names repeat.
export function examLabel(
  e: { id: number; name: string; exam_date: string; start_time: string },
  all: { id: number; name: string }[] | undefined
): string {
  const dupes = (all || []).filter((x) => x.name === e.name).length > 1
  return dupes ? `${e.name} - ${formatDate(e.exam_date)} ${String(e.start_time).slice(0, 5)}` : e.name
}
