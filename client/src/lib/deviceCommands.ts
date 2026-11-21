import { api } from "@/api/client"

// Wipes everything the app keeps on this device for an exam: saved answers, a held-back submit,
// the sign-in. The login-session id is kept (it only identifies the browser, not exam data).
export function wipeExamData() {
  try {
    const drop: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith("jca_exam_local_") || k === "jca_pending_submit" || k === "jca_student_token" || k === "jca_student_user")) drop.push(k)
    }
    drop.forEach((k) => localStorage.removeItem(k))
    sessionStorage.clear()
  } catch { /* storage unavailable */ }
}

let running = false

// While a candidate is signed in the app asks the server every few seconds whether the admin sent a
// command to this device:
//   restart         (Live Monitor > Restart Exam)  - the exam was stopped on the spot
//   device_restart  (Settings > Device Restart)    - restart the device and delete its exam data
// Either way the device is cleaned and reloaded onto the roll-number login page of that exam.
export async function checkDeviceCommand(): Promise<void> {
  if (running || !localStorage.getItem("jca_student_token")) return
  running = true
  try {
    const res = await api.get("/student/heartbeat")
    const { command, examId } = res.data?.data || {}
    if (command === "restart" || command === "device_restart") {
      wipeExamData()
      window.location.replace(examId ? `/student/login/roll?examId=${examId}` : "/student/login")
    }
  } catch {
    // offline or server busy - the exam carries on, try again next time
  } finally {
    running = false
  }
}
