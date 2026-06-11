import confetti from 'canvas-confetti'

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
