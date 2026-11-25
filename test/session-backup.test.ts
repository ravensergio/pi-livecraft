import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sanitize, SessionBackup } from '../server/session-backup.ts'

const header = JSON.stringify({
  type: 'session',
  id: 'abc',
  timestamp: new Date().toISOString(),
  cwd: 'C:\\',
})
const named = JSON.stringify({ type: 'session_info', name: 'My Retired Chat' })
const userMessage = JSON.stringify({
  type: 'message',
  timestamp: new Date().toISOString(),
  message: { role: 'user', content: [{ type: 'text', text: 'hello there' }] },
})

test('backup mirrors, re-copies changed, and trashes deleted with a human name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'livecraft-backup-'))
  try {
    const source = join(root, 'sessions')
    const destination = join(root, 'backup')
    const settingsFile = join(root, 'settings.json')
    await mkdir(join(source, 'proj'), { recursive: true })
    await writeFile(join(source, 'proj', 'a.jsonl'), `${header}\n${named}\n${userMessage}\n`)

    const backup = new SessionBackup(settingsFile, source)
    let status = await backup.setDestination(destination)
    assert.equal(status.files, 1)
    assert.equal(
      await readFile(join(destination, 'sessions', 'proj', 'a.jsonl'), 'utf8'),
      `${header}\n${named}\n${userMessage}\n`,
    )
    assert.match(await readFile(settingsFile, 'utf8'), /sessionBackup/)

    // Changed file: size differs, so it must be re-copied.
    await writeFile(
      join(source, 'proj', 'a.jsonl'),
      `${header}\n${named}\n${userMessage}\n${userMessage}\n`,
    )
    status = await backup.syncNow()
    assert.equal(status.error, null)
    assert.equal(
      await readFile(join(destination, 'sessions', 'proj', 'a.jsonl'), 'utf8'),
      `${header}\n${named}\n${userMessage}\n${userMessage}\n`,
    )

    // Deleted session: leaves the mirror, lands in trash named by date + session name.
    await rm(join(source, 'proj', 'a.jsonl'))
    status = await backup.syncNow()
    const trash = await readdir(join(destination, 'sessions-trash'))
    assert.equal(trash.length, 1)
    assert.match(trash[0], /^\d{4}-\d{2}-\d{2}_My Retired Chat\.jsonl$/)
    assert.equal(status.trashFiles, 1)
    assert.equal(status.files, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('sanitize produces filesystem-safe labels', () => {
  assert.equal(sanitize('a<>:"/\\|?*b'), 'a b')
  assert.equal(sanitize('  ..  '), 'session')
  assert.equal(sanitize('keep spaces and dots.in.the.middle'), 'keep spaces and dots.in.the.middle')
})
