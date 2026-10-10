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
          <path
            d='M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
          <path d='M6.5 6.5v4.5M9.5 6.5v4.5' strokeLinecap='round' />
        </svg>
      </button>
    </Tooltip>
  )
}
