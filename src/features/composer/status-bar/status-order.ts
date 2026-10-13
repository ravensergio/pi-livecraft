import { useCallback, useState } from 'react'

const STORAGE_KEY = 'pi-livecraft.status-chip-order.v1'

function readStoredOrder(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((key): key is string => typeof key === 'string')
  } catch {
    return []
  }
}

function writeStoredOrder(order: string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    // Storage unavailable (private mode) — the order stays in memory for the session.
  }
}

/** User-defined status chip order (drag & drop). Keys the user never dragged
 * sort alphabetically after the stored ones. */
export function useStatusChipOrder() {
  const [order, setOrder] = useState<string[]>(readStoredOrder)

  /** Moves `fromKey` to `toKey`'s position and persists the full visible order. */
  const move = useCallback((fromKey: string, toKey: string, visibleKeys: string[]): void => {
    setOrder(() => {
      const next = visibleKeys.filter((key) => key !== fromKey)
      next.splice(next.indexOf(toKey), 0, fromKey)
      writeStoredOrder(next)
      return next
    })
  }, [])

  return { order, move }
}
