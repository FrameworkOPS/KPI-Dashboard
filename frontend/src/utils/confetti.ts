import confetti from 'canvas-confetti'

// Lightweight WebAudio beep — used by the meeting runner to cue 1-min-left
// and time's-up moments without bundling an audio file.
let _audioCtx: AudioContext | null = null
function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (_audioCtx) return _audioCtx
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!AC) return null
  try { _audioCtx = new AC() } catch { return null }
  return _audioCtx
}

export function beep(frequency = 660, durationMs = 180): void {
  const c = ctx()
  if (!c) return
  // Some browsers suspend the context until a user gesture — try to resume
  // (no-op if already running, throws are swallowed).
  try { c.resume() } catch { /* noop */ }
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000)
  osc.connect(gain).connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + durationMs / 1000 + 0.05)
}

// Short burst — fires when a single rock gets marked done.
export function fireRockDoneConfetti(): void {
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#22c55e', '#3b82f6', '#22d3ee', '#facc15'],
  })
}

// Bigger sustained burst — fires when a meeting completes.
export function fireMeetingCompleteConfetti(): void {
  const end = Date.now() + 1500
  const colors = ['#22c55e', '#3b82f6', '#f97316', '#22d3ee', '#facc15']
  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors,
    })
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}
