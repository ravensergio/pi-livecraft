import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { isObject } from '../shared/is-object.ts'
import type { JsonObject } from '../shared/types.ts'

/** Mirrors the Pi session directory into a user-chosen folder while Livecraft runs.
 *  Deleted sessions are never erased: they move to a trash subfolder, renamed to
 *  `date_session-name.jsonl` so a retired session is still recognizable later. */

const SYNC_INTERVAL_MS = 60_000

export interface BackupStatus {
  destination: string
  lastSyncAt: number | null
  files: number
  trashFiles: number
  error: string | null
}

export class SessionBackup {
  private timer: ReturnType<typeof setInterval> | null = null
  private syncing: Promise<BackupStatus> | null = null
  private lastSyncAt: number | null = null
  private lastError: string | null = null

  private readonly settingsFile: string
  private readonly sourceDir: string
  private readonly temporaryPaths: () => Promise<string[]>

  constructor(
    settingsFile: string,
    sourceDir: string,
    temporaryPaths: () => Promise<string[]> = async () => [],
  ) {
    this.settingsFile = settingsFile
    this.sourceDir = sourceDir
    this.temporaryPaths = temporaryPaths
    this.start()
  }

  async status(): Promise<BackupStatus> {
    const destination = await this.readDestination()
    let files = 0
    let trashFiles = 0
    if (destination) {
      files = (await this.list(join(destination, 'sessions'))).length
      trashFiles = (await this.list(join(destination, 'sessions-trash'))).length
    }
    return { destination, lastSyncAt: this.lastSyncAt, files, trashFiles, error: this.lastError }
  }

  async setDestination(destination: string): Promise<BackupStatus> {
    const raw = await this.readSettings()
    if (destination) raw.sessionBackup = { destination }
    else delete raw.sessionBackup
    const temporary = `${this.settingsFile}.tmp.${process.pid}`
    await writeFile(temporary, `${JSON.stringify(raw, null, 2)}\n`)
    await rename(temporary, this.settingsFile)
    return this.syncNow()
  }

  async syncNow(): Promise<BackupStatus> {
    if (this.syncing) return this.syncing
    this.syncing = this.sync().finally(() => {
      this.syncing = null
    })
    return this.syncing
  }

  private start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.syncNow().catch(() => {}), SYNC_INTERVAL_MS)
    this.timer.unref()
    void this.syncNow().catch(() => {})
  }

  private async sync(): Promise<BackupStatus> {
    const destination = await this.readDestination()
    if (!destination) return this.status()
    try {
      const sessionsDir = join(destination, 'sessions')
      const trashDir = join(destination, 'sessions-trash')
      await mkdir(sessionsDir, { recursive: true })
      await mkdir(trashDir, { recursive: true })
      // Temporary sessions are disposable: never mirrored, never trashed.
      const excluded = new Set((await this.temporaryPaths()).map(pathKey))

      const sourceFiles = await this.list(this.sourceDir)
      const sourceSet = new Set(sourceFiles)
      for (const name of sourceFiles) {
        const source = join(this.sourceDir, name)
        if (excluded.has(pathKey(source))) continue
        const target = join(sessionsDir, name)
        const [src, dst] = await Promise.all([
          stat(source),
          stat(target).catch(() => null),
        ])
        // Copy when new, resized, or newer than the copy (mtime re-stamped below).
        if (dst && dst.size === src.size && src.mtimeMs <= dst.mtimeMs + 1000) continue
        await mkdir(dirname(target), { recursive: true })
        const temporary = `${target}.tmp.${process.pid}`
        await copyFile(source, temporary)
        await rename(temporary, target)
        await utimes(target, src.atime, src.mtime)
      }

      const mirror = await this.list(sessionsDir)
      const gone = mirror.filter(
        (name) => !sourceSet.has(name) && !excluded.has(pathKey(join(this.sourceDir, name))),
      )
      // The UI deletes one session at a time, so mass disappearance is always an
      // accident: refuse to trash half the backup and let the status line shout.
      if (gone.length > 5 && gone.length * 2 > mirror.length) {
        this.lastError =
          `Mass deletion detected: ${gone.length} sessions vanished from the source — `
          + 'nothing was trashed. Restore them, or clear the mirror folder if this was intended.'
        return this.status()
      }
      for (const name of mirror) {
        if (sourceSet.has(name) || !excluded.has(pathKey(join(this.sourceDir, name)))) continue
        await rm(join(sessionsDir, name), { force: true })
      }
      for (const name of gone) {
        const retired = join(sessionsDir, name)
        const label = await this.sessionLabel(retired, basename(name))
        await rename(retired, join(trashDir, await this.uniqueName(trashDir, label)))
      }

      this.lastSyncAt = Date.now()
      this.lastError = null
    } catch (cause) {
      // Missing drive (F: unplugged) is expected: report it, retry on the next tick.
      this.lastError = cause instanceof Error ? cause.message : String(cause)
    }
    return this.status()
  }

  private async list(dir: string): Promise<string[]> {
    try {
      // Pi keeps sessions in per-project subfolders: mirror the whole tree.
      const entries = await readdir(dir, { recursive: true })
      return entries.filter((name) => name.endsWith('.jsonl'))
    } catch {
      return []
    }
  }

  /** Reads a session file's name (last rename wins) or first user prompt, for trash naming. */
  private async sessionLabel(path: string, fallback: string): Promise<string> {
    try {
      const head = (await readFile(path, 'utf8')).slice(0, 512 * 1024)
      let name: string | null = null
      let prompt: string | null = null
      for (const line of head.split('\n')) {
        if (!line.trim()) continue
        let value: unknown
        try {
          value = JSON.parse(line)
        } catch {
          continue
        }
        if (!isObject(value)) continue
        if (value.type === 'session_info' && typeof value.name === 'string' && value.name.trim())
          name = value.name.trim()
        if (
          prompt === null
          && value.type === 'message'
          && isObject(value.message)
          && value.message.role === 'user'
          && Array.isArray(value.message.content)
        ) {
          const text = value
            .message
            .content
            .map((part) =>
              isObject(part) && part.type === 'text' && typeof part.text === 'string'
                ? part.text
                : ''
            )
            .join('')
            .trim()
          if (text && !text.startsWith('/')) prompt = text.slice(0, 60)
        }
      }
      return sanitize(name ?? prompt ?? fallback)
    } catch {
      return sanitize(fallback)
    }
  }

  private async uniqueName(trashDir: string, label: string): Promise<string> {
    const day = new Date().toISOString().slice(0, 10)
    const taken = new Set(await this.list(trashDir))
    for (let attempt = 1;; attempt += 1) {
      const candidate = `${day}_${attempt === 1 ? label : `${label}_${attempt}`}.jsonl`
      if (!taken.has(candidate)) return candidate
    }
  }

  private async readDestination(): Promise<string> {
    const section = (await this.readSettings()).sessionBackup
    return isObject(section) && typeof section.destination === 'string' ? section.destination : ''
  }

  private async readSettings(): Promise<JsonObject> {
    try {
      const data: unknown = JSON.parse(await readFile(this.settingsFile, 'utf8'))
      return isObject(data) ? data : {}
    } catch {
      return {}
    }
  }
}

/** Compares paths forgiving separators and (on Windows) case. */
function pathKey(path: string): string {
  const resolved = resolve(path)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** Filesystem-safe label for trashed session files (Windows rules: no <>:"/\|?*). */
export function sanitize(label: string): string {
  const cleaned = label
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 60)
  return cleaned || 'session'
}
