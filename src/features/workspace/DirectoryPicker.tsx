import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { listDirectories, listWorkspaces, resolveDirectory } from '../../api.ts'
import type { DirectoryListing, SessionWorkspace } from '../../../shared/types.ts'
import { directoryCompletionTarget } from './directory-completion.ts'

/**
 * Completes and validates a local path before changing the workspace.
 *
 * Directory suggestions use a version counter: each keystroke increments
 * `completionVersionRef`, and only the latest request's result is applied.
 * This prevents a slow `listDirectories()` response from overwriting
 * newer suggestions for the path currently being typed.
 */
export function DirectoryPicker({ initialPath, onClose, onError, onSelect }: {
  initialPath: string
  onClose: () => void
  onError: (cause: unknown) => void
  onSelect: (path: string) => void
}) {
  const [path, setPath] = useState(initialPath)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [workspaces, setWorkspaces] = useState<SessionWorkspace[]>([])
  const [browseListing, setBrowseListing] = useState<DirectoryListing | null>(null)
  const [nativePick, setNativePick] = useState<{ name: string; matches: string[] } | null>(null)
  const completionVersionRef = useRef(0)

  // Stale requests must not replace suggestions for the path currently being entered.
  useEffect(() => {
    const version = ++completionVersionRef.current
    const target = directoryCompletionTarget(path)
    if (!target) {
      setSuggestions([])
      return
    }

    void listDirectories(target.parentPath)
      .then((parent) => {
        if (version !== completionVersionRef.current) return
        setSuggestions(
          parent
            .directories
            .filter((directory) => directory.name.startsWith(target.namePrefix))
            .map((directory) => `${target.pathPrefix}${directory.name}`)
            .filter((suggestion) => suggestion !== initialPath),
        )
        setActiveSuggestion(-1)
      })
      .catch(() => {
        if (version === completionVersionRef.current) setSuggestions([])
      })
  }, [path])

  // The workspace inventory comes from real session data, so deleted
  // directories never appear (the old localStorage recents went stale).
  useEffect(() => {
    void listWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]))
  }, [])

  /** Verifies that the path is still accessible before adopting it as the workspace. */
  function selectDirectory(nextPath: string): void {
    void listDirectories(nextPath).then((directory) => onSelect(directory.path)).catch(onError)
  }

  /** Opens the native OS folder picker (the normal Windows dialog). The picker
   *  only reports the folder name, so the backend resolves it to a full path,
   *  checking the current workspace and its siblings first. Browsers without
   *  the File System Access API fall back to the drill-down browser. */
  async function openBrowse(): Promise<void> {
    setNativePick(null)
    setBrowseListing(null)
    const picker = window.showDirectoryPicker?.bind(window)
    if (!picker) {
      void listDirectories(initialPath).then(setBrowseListing).catch(onError)
      return
    }
    try {
      // No startIn: this Chromium build's enum rejects 'recentlyUsed', and the
      // default dialog already reopens at the last used location.
      const handle = await picker()
      const { matches } = await resolveDirectory(handle.name, initialPath)
      if (matches.length === 1) {
        setPath(matches[0])
      } else {
        setNativePick({ name: handle.name, matches })
      }
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') onError(error)
    }
  }

  function browseInto(nextPath: string): void {
    void listDirectories(nextPath).then(setBrowseListing).catch(onError)
  }

  /** Applies standard completion-list shortcuts without intercepting normal input. */
  function handlePathKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      event.preventDefault()
      setActiveSuggestion((current) =>
        event.key === 'ArrowDown'
          ? Math.min(current + 1, suggestions.length - 1)
          : Math.max(current - 1, 0)
      )
      return
    }
    if (event.key === 'Tab') {
      const suggestion = suggestions[activeSuggestion >= 0 ? activeSuggestion : 0]
      if (!suggestion) return
      event.preventDefault()
      setPath(suggestion)
      setActiveSuggestion(-1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      selectDirectory(path)
    }
  }

  return (
    <div className='modal-backdrop' role='presentation'>
      <section
        aria-labelledby='directory-picker-title'
        aria-modal='true'
        className='modal directory-picker'
        role='dialog'
      >
        <h2 id='directory-picker-title'>Choose a directory</h2>
        <label className='directory-path-label' htmlFor='directory-path'>Directory path</label>
        <div className='directory-path-row'>
          <input
            aria-activedescendant={activeSuggestion >= 0
              ? `directory-suggestion-${activeSuggestion}`
              : undefined}
            autoComplete='off'
            autoFocus
            aria-autocomplete='list'
            aria-controls={suggestions.length > 0 ? 'directory-suggestions' : undefined}
            aria-expanded={suggestions.length > 0}
            className='directory-path-input'
            id='directory-path'
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={handlePathKeyDown}
            placeholder='~/projects or /absolute/path'
            role='combobox'
            value={path}
          />
          <button onClick={openBrowse} type='button'>Browse</button>
        </div>
        <p className='directory-path-hint'>
          Tab completes · ↑↓ navigate · Enter selects · Escape cancels
        </p>
        {suggestions.length > 0 && (
          <div
            aria-label='Directory suggestions'
            className='directory-suggestions'
            id='directory-suggestions'
            role='listbox'
          >
            {suggestions.map((suggestion, index) => (
              <div
                aria-selected={index === activeSuggestion}
                className={index === activeSuggestion ? 'active' : undefined}
                id={`directory-suggestion-${index}`}
                key={suggestion}
                onClick={() => {
                  setPath(suggestion)
                  setActiveSuggestion(-1)
                }}
                onMouseDown={(event) => event.preventDefault()}
                role='option'
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
        {browseListing && (
          <section aria-label='Browse folders' className='directory-browse'>
            <div className='directory-browse-bar'>
              <button
                disabled={browseListing.parentPath === null}
                onClick={() => {
                  if (browseListing.parentPath) browseInto(browseListing.parentPath)
                }}
                type='button'
              >
                Up
              </button>
              <span className='directory-browse-path' title={browseListing.path}>
                {browseListing.path}
              </span>
            </div>
            <div className='directory-browse-list'>
              {browseListing.directories.map((directory) => (
                <button
                  key={directory.path}
                  onClick={() => browseInto(directory.path)}
                  type='button'
                >
                  {directory.name}
                </button>
              ))}
            </div>
            <button
              className='primary'
              onClick={() => selectDirectory(browseListing.path)}
              type='button'
            >
              Open this folder
            </button>
          </section>
        )}
        {nativePick && (
          <section aria-label='Folders with this name' className='recent-workspaces'>
            <strong>
              {nativePick.matches.length === 0
                ? `No folder named “${nativePick.name}” was found on this PC`
                : `Folders named “${nativePick.name}” — pick one`}
            </strong>
            <div>
              {nativePick.matches.map((match) => (
                <button
                  key={match}
                  onClick={() => {
                    setNativePick(null)
                    setPath(match)
                  }}
                  type='button'
                >
                  {match}
                </button>
              ))}
            </div>
          </section>
        )}
        {workspaces.length > 0 && (
          <section aria-label='Workspaces with sessions' className='recent-workspaces'>
            <strong>Workspaces</strong>
            <div>
              {workspaces
                .map((workspace) => (
                  <button
                    key={workspace.path}
                    onClick={() =>
                      selectDirectory(
                        workspace
                          .path,
                      )}
                    title={`${workspace.sessionCount} session${
                      workspace.sessionCount === 1
                        ? ''
                        : 's'
                    }`}
                    type='button'
                  >
                    {workspace
                      .path}
                  </button>
                ))}
            </div>
          </section>
        )}
        <div className='modal-actions'>
          <button onClick={onClose} type='button'>Cancel</button>
          <button className='primary' onClick={() => selectDirectory(path)} type='button'>
            Open
          </button>
        </div>
      </section>
    </div>
  )
}
