import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { listWorkspaces } from '../../api.ts'
import type { SessionWorkspace } from '../../../shared/types.ts'

interface SessionMoveDialogProps {
  cwd: string
  name: string
  onClose: () => void
  onConfirm: (targetCwd: string) => Promise<void>
}

/** Moves a closed session to another workspace; the list contains only workspaces
 *  that have sessions (and therefore exist on disk). */
export function SessionMoveDialog(
  { cwd, name, onClose, onConfirm }: SessionMoveDialogProps,
) {
  const [workspaces, setWorkspaces] = useState<SessionWorkspace[]>([])
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  const [moving, setMoving] = useState(false)
  const dialogRef = useRef<HTMLFormElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    void listWorkspaces()
      .then((all) => setWorkspaces(all.filter((workspace) => workspace.path !== cwd)))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Unable to list workspaces.')
      )
    return () => previousFocusRef.current?.focus()
  }, [cwd])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLFormElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (!moving) onClose()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), '
        + 'textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    )
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

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!target) {
      setError('Choose a workspace to move the session to.')
      return
    }
    setError('')
    setMoving(true)
    try {
      await onConfirm(target)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to move the session.')
    } finally {
      setMoving(false)
    }
  }

  return (
    <div
      className='modal-backdrop session-rename-backdrop'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !moving) onClose()
      }}
    >
      <form
        aria-labelledby='session-move-title'
        aria-modal='true'
        className='modal session-rename-modal'
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
        ref={dialogRef}
        role='dialog'
      >
        <h2 id='session-move-title'>Move session</h2>
        <p>Move “{name}” to another workspace. Its history moves with it.</p>
        {workspaces.length === 0 && !error && <p>No other workspaces with sessions were found.</p>}
        <div className='session-move-list'>
          {workspaces.map((workspace) => (
            <label
              className='session-move-option'
              key={workspace.path}
            >
              <input
                checked={target === workspace.path}
                disabled={moving}
                name='session-move-target'
                type='radio'
                value={workspace.path}
                onChange={() => {
                  setTarget(workspace.path)
                  if (error) setError('')
                }}
              />
              <span>
                <strong>{workspace.path}</strong>
                <small>
                  {workspace.sessionCount} session{workspace.sessionCount === 1 ? '' : 's'}
                </small>
              </span>
            </label>
          ))}
        </div>
        {error && <p className='session-rename-error' role='alert'>{error}</p>}
        <div className='modal-actions'>
          <button disabled={moving} onClick={onClose} type='button'>
            Cancel
          </button>
          <button className='primary' disabled={moving || !target} type='submit'>
            {moving ? 'Moving…' : 'Move'}
          </button>
        </div>
      </form>
    </div>
  )
}
