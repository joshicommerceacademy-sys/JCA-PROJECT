import * as React from "react"

// Blocks the easy in-browser ways to lift exam content out: copy/cut (Ctrl+C, right-click
// Copy), the mobile long-press context menu (Save Image/Copy), and dragging an image out to
// save it. None of this is mentioned in the exam instructions — deliberately silent.
// Controlled by the Settings page's "Block copy, right-click and drag-out" toggle — defaults
// to on (true) so a caller that hasn't loaded that setting yet still gets the original,
// always-on behavior.
export function useDisableCopy(enabled = true) {
  React.useEffect(() => {
    if (!enabled) return
    function block(e: Event) {
      e.preventDefault()
    }
    document.addEventListener("copy", block)
    document.addEventListener("cut", block)
    document.addEventListener("contextmenu", block)
    document.addEventListener("dragstart", block)
    return () => {
      document.removeEventListener("copy", block)
      document.removeEventListener("cut", block)
      document.removeEventListener("contextmenu", block)
      document.removeEventListener("dragstart", block)
    }
  }, [enabled])
}
