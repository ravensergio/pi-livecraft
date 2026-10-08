/**
 * Buffers events and delivers them in order at most once per scheduled tick,
 * so a burst of SSE frames costs one render instead of one per frame.
 */
export function createEventCoalescer<T>(
  deliver: (events: T[]) => void,
  schedule: (callback: () => void) => void,
): { push: (event: T) => void; dispose: () => void } {
  let buffer: T[] = []
  let scheduled = false
  return {
    push(event: T): void {
      buffer.push(event)
      if (scheduled) return
      scheduled = true
      schedule(() => {
        scheduled = false
        const batch = buffer
        buffer = []
        deliver(batch)
      })
    },
    dispose(): void {
      scheduled = false
      buffer = []
    },
  }
}
