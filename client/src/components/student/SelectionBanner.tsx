import * as React from "react"
import jcaBadge from "@/assets/jca-badge.png"

// The student's picked exam (name + logo) and roll number are kept in sessionStorage so every
// student page — from the first "Select Exam" screen to the last page — shows the same header.
const KEY = "jca_student_selection"
const EVENT = "jca-selection-changed"

export interface Selection {
  examId?: string
  examName?: string
  rollNumber?: string
  logoUrl?: string | null
}

export function readSelection(): Selection {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}")
  } catch {
    return {}
  }
}

export function saveSelection(patch: Selection) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...readSelection(), ...patch }))
    window.dispatchEvent(new Event(EVENT))
  } catch {
    // storage unavailable — header simply stays empty
  }
}

export function clearSelection() {
  try {
    sessionStorage.removeItem(KEY)
    window.dispatchEvent(new Event(EVENT))
  } catch {
    // ignore
  }
}

// Clean header: exam logo + exam name, nothing else.
export function SelectionBanner({ examName, logoUrl }: Selection) {
  const [sel, setSel] = React.useState<Selection>(readSelection)
  React.useEffect(() => {
    const update = () => setSel(readSelection())
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [])
  const exam = examName || sel.examName
  if (!exam) return null
  return (
    <div className="sticky top-0 z-40 flex w-full items-center justify-center gap-3 border-b bg-background px-4 py-2">
      <img src={logoUrl || sel.logoUrl || jcaBadge} alt="" className="size-[50px] shrink-0 rounded object-contain" />
      <span className="-ml-2 self-start text-xs text-muted-foreground" aria-label="Copyright">&copy;</span>
      <span className="text-[20px] leading-tight font-bold tracking-wide text-primary">{exam}</span>
    </div>
  )
}
