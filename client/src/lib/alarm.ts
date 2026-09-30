export function playAlarmSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    if (ctx.state === "suspended") ctx.resume()

    const beepCount = 6
    const beepDuration = 0.3
    const gapDuration = 0.2

    for (let i = 0; i < beepCount; i++) {
      const start = ctx.currentTime + i * (beepDuration + gapDuration)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + beepDuration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + beepDuration)
    }

    setTimeout(() => ctx.close(), (beepCount * (beepDuration + gapDuration) + 0.5) * 1000)
  } catch {
    // Audio not supported or blocked by the browser's autoplay policy — fail silently.
  }
}
