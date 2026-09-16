import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

interface SessionDeleteDialogProps {
  cwd: string
  name: string
  onClose: () => void
  onConfirm: () => Promise<void>
  sessionPath?: string
}

/** Confirms permanent deletion of a stored session file before removing it. */
export function SessionDeleteDialog(
  { cwd, name, onClose, onConfirm, sessionPath }: SessionDeleteDialogProps,
) {
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const dialogRef = useRef<HTMLFormElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialogRef.current?.querySelector<HTMLButtonElement>('.primary')?.focus()
    return () => previousFocusRef.current?.focus()
  }, [])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLFormElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (!deleting) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function submit(): Promise<void> {
    setError('')
    setDeleting(true)
    try {
      await onConfirm()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete the session.')
      setDeleting(false)
    }
  }

  return (
    <div
      className='modal-backdrop session-rename-backdrop'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onClose()
      }}
    >
      <form
        aria-describedby={error ? 'session-delete-error' : undefined}
        aria-labelledby='session-delete-title'
        aria-modal='true'
        className='modal session-rename-modal'
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        ref={dialogRef}
        role='dialog'
      >
        <h2 id='session-delete-title'>Delete session</h2>
        <p>
          This permanently removes the session file for{' '}
          <strong className='session-delete-name'>{name}</strong> {cwd && (
            <>
              in <code>{cwd}</code>
              {' '}
            </>
          )}
          . It cannot be recovered.
        </p>
        {sessionPath && <p className='session-delete-path'>{sessionPath}</p>}
        {error && (
          <p className='session-rename-error' id='session-delete-error' role='alert'>{error}</p>
        )}
        <div className='modal-actions'>
          <button disabled={deleting} onClick={onClose} type='button'>
            Cancel
          </button>
          <button
            className='primary danger'
            disabled={deleting}
            type='submit'
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </form>
    </div>
  )
}
