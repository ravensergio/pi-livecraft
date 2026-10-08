import { useEffect } from 'react'

export interface SessionPickerRow {
  key: string
  name: string
  detail?: string
  selected: boolean
  onPick: () => void
}

export interface SessionPickerGroup {
  key: string
  title: string
  rows: SessionPickerRow[]
}

/**
 * Full session list for small screens, where the horizontal session strip
 * only shows a few sessions. Opens from the "All" button in the top bar.
 */
export function SessionPickerDialog({ directory, groups, onClose, onChooseDirectory }: {
  directory?: string
  groups: SessionPickerGroup[]
  onClose: () => void
  onChooseDirectory?: () => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className='modal-backdrop session-picker-backdrop'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role='presentation'
    >
      <section
        aria-label='All sessions'
        aria-modal='true'
        className='modal session-picker'
        onMouseDown={(event) => event.stopPropagation()}
        role='dialog'
      >
        <h2>Sessions</h2>
        {directory && (
          <section className='session-picker-directory'>
            <h3>Current directory</h3>
            <button
              className='session-picker-directory-path'
              onClick={onChooseDirectory}
              title='Change directory'
              type='button'
            >
              {directory}
            </button>
          </section>
        )}
        {groups.map((group) => (
          <section key={group.key}>
            <h3>{group.title}</h3>
            {group.rows.map((row) => (
              <button
                className={`session-picker-item${row.selected ? ' selected' : ''}`}
                key={row.key}
                onClick={() => {
                  row.onPick()
                  onClose()
                }}
                type='button'
              >
                <strong>{row.name}</strong>
                {row.detail && <small>{row.detail}</small>}
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 && <p className='session-picker-empty'>No sessions yet.</p>}
      </section>
    </div>
  )
}
