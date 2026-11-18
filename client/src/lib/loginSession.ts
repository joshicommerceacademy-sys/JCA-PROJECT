// A random id for this browser, created once and kept in localStorage. It identifies "who" selected a
// roll number on the login page, so the same candidate can carry on after a refresh while a different
// PC / browser trying the same roll number is told it is already selected.
const KEY = "jca_login_session"

export function getLoginSessionId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, "")
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    // storage blocked: fall back to a per-page-load id
    return (window as unknown as { __jcaSession?: string }).__jcaSession ??= `tmp-${Math.random().toString(36).slice(2)}`
  }
}
