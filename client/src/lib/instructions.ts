export interface InstructionOptions {
  durationMinutes: number
  /** Minutes after the candidate's start before the Done Exam button appears (0 = from the start). */
  submitButtonAfterMinutes: number
  /** true: the full duration counts from when the candidate begins, even if they join late. */
  compensateLateLogin: boolean
}

// Built from the exam's own settings so the rules shown to the candidate are the rules that are
// actually enforced (duration, when Done Exam appears, how late joiners are timed).
export function buildInstructions(o: InstructionOptions): string[] {
  const list: string[] = []

  list.push(`This exam is ${o.durationMinutes} minutes long. The timer starts when you begin the exam and runs continuously until it reaches zero.`)
  list.push(
    o.compensateLateLogin
      ? "If you are allowed in after the scheduled start time, you still get the full duration from the moment you begin."
      : "If you are allowed in after the scheduled start time, you only get the time left until the common end time of the exam."
  )

  if (o.submitButtonAfterMinutes > 0) {
    list.push(
      `The "Done Exam" button appears on the last question only after ${o.submitButtonAfterMinutes} minute${o.submitButtonAfterMinutes === 1 ? "" : "s"} from the start of your exam (for this ${o.durationMinutes}-minute exam). Until then you cannot submit manually. When the timer ends, your exam is submitted automatically.`
    )
  } else {
    list.push('The "Done Exam" button is available on the last question. When the timer ends, your exam is submitted automatically.')
  }

  list.push(
    "You can move between questions freely using the question palette or the Next / Previous buttons, and you may change an answer at any time before submitting.",
    "Do not switch tabs or minimize the browser — this will be flagged and may auto-submit your exam.",
    "This exam must be taken in fullscreen mode. Exiting fullscreen or switching tabs more than once will auto-submit your exam.",
    "Do not refresh or close the browser window during the exam.",
    "If your internet connection drops during the exam, keep the exam window open. Your answers are kept on this computer and are sent automatically when the connection returns; you can carry on and finish the exam.",
    "Your roll number can be used to start the exam only once. If the exam window is closed or you are disconnected, ask the invigilator to re-enable your roll number.",
    "Once submitted, answers cannot be changed under any circumstances.",
    "The exam will not open before its scheduled start time, even if you are logged in earlier.",
  )
  return list
}
