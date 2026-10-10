// Zero-model test of the /lc-tree extension: pre-write a session file,
// navigate the tree, verify the leaf moved. No prompts -> no ninfer traffic.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PI = [
  process.execPath,
  'C:/Users/Raven/.pi/agent/install/releases/1.1.0/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',
]

const dir = mkdtempSync(join(tmpdir(), 'lc-tree-'))
const sessionId = randomUUID()
const sessionFile = join(dir, `${sessionId}.jsonl`)
const now = new Date().toISOString()
const entries = [
  { type: 'session', version: 3, id: sessionId, timestamp: now, cwd: dir },
  { type: 'message', id: 'u1', parentId: null, timestamp: now, message: { role: 'user', content: [{ type: 'text', text: 'one' }] } },
  { type: 'message', id: 'a1', parentId: 'u1', timestamp: now, message: { role: 'assistant', content: [{ type: 'text', text: 'one-reply' }] } },
  { type: 'message', id: 'u2', parentId: 'a1', timestamp: now, message: { role: 'user', content: [{ type: 'text', text: 'two' }] } },
  { type: 'message', id: 'a2', parentId: 'u2', timestamp: now, message: { role: 'assistant', content: [{ type: 'text', text: 'two-reply' }] } },
]
writeFileSync(sessionFile, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')

const child = spawn(PI[0], [
  PI[1],
  '--mode', 'rpc',
  '--extension', 'E:/z_Working_PI/00-web-pi-livecraft/pi-extensions/tree.ts',
  '--session', sessionFile,
], { cwd: dir })

let buffer = ''
const pending = new Map()
let treeStatusPing = false
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  let index
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index)
    buffer = buffer.slice(index + 1)
    if (!line.trim()) continue
    const message = JSON.parse(line)
    if (typeof message.id === 'string' && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    } else if (message.type === 'extension_ui_request' && message.statusKey === 'pi-livecraft.tree') {
      if (message.statusText === 'moved') treeStatusPing = true
    }
  }
})
child.stderr.on('data', (chunk) => process.stderr.write(`[pi] ${chunk}`))

function request(command, timeoutMs = 30_000) {
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${command.type}`)), timeoutMs)
    pending.set(id, (message) => {
      clearTimeout(timer)
      resolve(message)
    })
    child.stdin.write(JSON.stringify({ ...command, id }) + '\n')
  })
}

try {
  await request({ type: 'get_state' })
  const before = await request({ type: 'get_tree' })
  console.log('leaf before:', before.data.leafId)

  const nav = await request({ type: 'prompt', message: '/lc-tree a1' })
  console.log('nav:', nav.success, JSON.stringify(nav.data))
  await new Promise((r) => setTimeout(r, 2500))

  const after = await request({ type: 'get_tree' })
  console.log('leaf after:', after.data.leafId)

  // Pi may auto-append entries on load (e.g. model_change), so only assert the move.
  const ok = after.data.leafId === 'a1' && before.data.leafId !== 'a1' && treeStatusPing
  if (!ok) {
    console.error('FAIL', { ping: treeStatusPing })
    process.exitCode = 1
  } else {
    console.log('OK: leaf a2 -> a1, status ping received, zero model calls')
  }
} catch (error) {
  console.error('FAIL:', error.message)
  process.exitCode = 1
} finally {
  child.kill()
  await new Promise((r) => setTimeout(r, 500))
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Windows file locks right after kill — the temp dir is harmless.
  }
}
