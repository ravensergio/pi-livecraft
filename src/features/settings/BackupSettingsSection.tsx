import { useCallback, useEffect, useState } from 'react'

interface BackupStatus {
  destination: string
  lastSyncAt: number | null
  files: number
  trashFiles: number
  error: string | null
}

/** Session backup: mirrors the pi session folder to a local folder of your choice
 *  while Livecraft runs. Deleted sessions land in sessions-trash, renamed by date
 *  and session name. Stored in the pi agent settings.json — like web search. */
export function BackupSettingsSection() {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/session-backup')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const next: BackupStatus = await res.json()
      setStatus(next)
      setDraft((current) => (current ? current : next.destination))
      setError('')
    } catch (cause) {
      setError(String(cause))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(async (destination: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/session-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus(await res.json())
      setError('')
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  const runNow = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/session-backup/run', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus(await res.json())
      setError('')
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  if (error && !status)
    return (
      <section>
        <p>Backup settings unavailable: {error}</p>
      </section>
    )
  if (!status)
    return (
      <section>
        <p>Loading backup settings…</p>
      </section>
    )

  return (
    <section>
      <p>
        Copies every session file to a folder you choose, automatically, while Livecraft runs.
        Nothing is ever deleted from the backup: sessions you remove here move to a
        <code>sessions-trash</code> subfolder, renamed like <code>2026-11-25_my-chat.jsonl</code>
        {' '}
        so you can still recognize them. Empty = backup off.
      </p>
      <label className='voice-row'>
        <span>Backup folder</span>
        <input
          onChange={(event) => setDraft(event.target.value)}
          placeholder='For example F:\pi-backup'
          spellCheck={false}
          value={draft}
        />
      </label>
      <div className='voice-row'>
        <button disabled={busy} onClick={() => void save(draft.trim())} type='button'>
          {busy ? 'Working…' : status.destination ? 'Update folder' : 'Start backup'}
        </button>
        {status.destination && (
          <>
            <button disabled={busy} onClick={() => void runNow()} type='button'>
              Back up now
            </button>
            <button disabled={busy} onClick={() => void save('')} type='button'>
              Stop
            </button>
          </>
        )}
      </div>
      {error && <small className='terminal-command-error'>{error}</small>}
      {status.destination && (
        <small>
          {status.lastSyncAt
            ? `Synced ${new Date(status.lastSyncAt).toLocaleString()} — ${status.files} files`
            : 'Waiting for the first sync…'}
          {status.trashFiles > 0 ? ` · trash: ${status.trashFiles}` : ''}
          {status.error ? ` · last error: ${status.error} (retrying each minute)` : ''}
        </small>
      )}
    </section>
  )
}
