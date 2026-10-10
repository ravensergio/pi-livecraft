import { useEffect, useState } from 'react'
import { Tooltip } from '../../components/Tooltip.tsx'

interface TreeButtonProps {
  entryId: string
  onError: (cause: unknown) => void
  onTree: (entryId: string) => Promise<boolean>
}

/** Moves the session's leaf to this message; later messages are hidden (restorable). */
export function TreeButton({ entryId, onError, onTree }: TreeButtonProps) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'done' | 'cancelled'>('idle')

  useEffect(() => {
    if (status === 'idle') return
    const timeout = window.setTimeout(() => setStatus('idle'), 1500)
    return () => window.clearTimeout(timeout)
  }, [status])

  async function continueFromHere(): Promise<void> {
    setBusy(true)
    try {
      setStatus(await onTree(entryId) ? 'done' : 'cancelled')
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  const label = busy
    ? 'Moving conversation…'
    : status === 'done'
    ? 'Continuing from here'
    : status === 'cancelled'
    ? 'Cancelled'
    : 'Continue from here — later messages are hidden'

  return (
    <Tooltip label={label}>
      <button
        aria-label={label}
        className='conversation-action-button'
        disabled={busy}
        onClick={() => void continueFromHere()}
        type='button'
      >
        <svg aria-hidden='true' fill='none' stroke='currentColor' viewBox='0 0 16 16'>
          <circle cx='4' cy='3' r='1.5' />
          <circle cx='4' cy='13' r='1.5' />
          <path d='M4 4.5v7' strokeLinecap='round' />
          <path
            d='M6.5 10.5 12 5.5M12 5.5H8M12 5.5V9'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      </button>
    </Tooltip>
  )
}
