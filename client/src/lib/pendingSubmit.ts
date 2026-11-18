import axios from "axios"

// A finished exam whose submit could not reach the server (no internet). It is stored on the device
// together with the candidate's login token, so it is delivered automatically as soon as the
// computer is online again - even if the exam window was closed or reloaded in the meantime.
const KEY = "jca_pending_submit"

export interface PendingSubmit {
  token: string
  reason: string
  answers: Record<number, string>
  attemptId: number
}

export function savePendingSubmit(p: PendingSubmit) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* ignore */ }
}
export function readPendingSubmit(): PendingSubmit | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PendingSubmit) : null
  } catch { return null }
}
export function clearPendingSubmit() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

let busy = false
// Returns true once nothing is left to deliver.
export async function deliverPendingSubmit(): Promise<boolean> {
  const p = readPendingSubmit()
  if (!p) return true
  if (busy) return false
  busy = true
  try {
    await axios.post("/api/student/attempt/submit", { reason: p.reason, answers: p.answers }, {
      headers: { Authorization: `Bearer ${p.token}` },
    })
    clearPendingSubmit()
    try { localStorage.removeItem(`jca_exam_local_${p.attemptId}`) } catch { /* ignore */ }
    return true
  } catch (error) {
    // Still offline / server busy -> keep it. A definite server answer (e.g. expired token) -> drop it;
    // the server then finalises the attempt itself from the answers it already holds.
    if (axios.isAxiosError(error) && error.response && error.response.status < 500 && error.response.status !== 429) {
      clearPendingSubmit()
      return true
    }
    return false
  } finally {
    busy = false
  }
}
