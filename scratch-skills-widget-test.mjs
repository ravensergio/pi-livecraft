// Zero-model smoke test: /skills must emit a setWidget event (not notify).
// Extension command only — no model prompt, no ninfer traffic.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PI = [
  process.execPath,
  'C:/Users/Raven/.pi/agent/install/releases/1.1.0/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',
]

const dir = mkdtempSync(join(tmpdir(), 'lc-skills-'))
const sessionId = randomUUID()
const sessionFile = join(dir, `${sessionId}.jsonl`)
const now = new Date().toISOString()
writeFileSync(
  sessionFile,
  JSON.stringify({ type: 'session', version: 3, id: sessionId, timestamp: now, cwd: dir }) + '\n',
)

const child = spawn(PI[0], [
  PI[1],
  '--mode', 'rpc',
  '--extension', 'E:/z_Working_PI/00-web-pi-livecraft/pi-extensions/skills.ts',
  '--session', sessionFile,
], { cwd: dir })

let buffer = ''
const pending = new Map()
let widget = null
let notify = null
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
    } else if (message.type === 'extension_ui_request') {
      if (message.method === 'setWidget') widget = message
      if (message.method === 'notify') notify = message
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
    child.stdin.write(JSON.stringify({ id, ...command }) + '\n')
  })
}

try {
  const response = await request({ type: 'prompt', message: '/skills' })
  console.log('prompt:', JSON.stringify(response.data ?? response))
  // The RPC prompt responds at preflight; the extension handler runs after.
  await new Promise((resolve) => setTimeout(resolve, 3000))
  if (!widget) throw new Error('no setWidget event received')
  if (!Array.isArray(widget.widgetLines) || widget.widgetLines.length < 3)
    throw new Error('setWidget has no lines')
  const text = widget.widgetLines.join('\n')
  if (!text.includes('skills —')) throw new Error('missing header line')
  if (notify && String(notify.message ?? '').includes('skills:'))
    throw new Error('list still goes through notify')
  console.log(`setWidget: ${widget.widgetLines.length} lines (key=${widget.widgetKey})`)
  console.log(text.split('\n').slice(0, 5).join('\n'))
  console.log('PASS')
} finally {
  child.kill()
  await new Promise((resolve) => child.on('exit', resolve))
  rmSync(dir, { recursive: true, force: true })
}
