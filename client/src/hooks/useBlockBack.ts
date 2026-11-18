import * as React from "react"

// Once the exam flow has begun, the browser Back button must not return to earlier screens.
export function useBlockBack() {
  React.useEffect(() => {
    history.pushState(null, "", location.href)
    const onPop = () => history.pushState(null, "", location.href)
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
}
