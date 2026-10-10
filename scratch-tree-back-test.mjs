// Smoke test: /tree-back extension over Pi RPC.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const PI = [
  process.execPath,
  'C:/Users/Raven/.pi/agent/install/releases/1.1.0/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',
]
const args = [
  ...PI,
  '--mode', 'rpc',
  '--extension', 'E:/z_Working_PI/00-web-pi-livecraft/pi-extensions/tree.ts',
  '--session-id', `tree-back-test-${Date.now()}`,
]

const child = spawn(args[0], args.slice(1), { cwd: 'E:/z_Working_PI/00-web-pi-livecraft' })
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
    } else {
      console.log('[event]', message.type,
        message.type === 'extension_ui_request' && message.method === 'setStatus' ? `status ${message.statusKey}="${message.statusText}"` : '')
      if (message.type === 'extension_ui_request' && message.statusKey === 'pi-livecraft.tree' && message.statusText === 'moved')
        treeStatusPing = true
    }
  }
})
child.stderr.on('data', (chunk) => process.stderr.write(`[pi] ${chunk}`))

function request(command, timeoutMs = 60_000) {
  const id = randomUUID()
  const payload = JSON.stringify({ ...command, id }) + '\n'
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${command.type}`)), timeoutMs)
    pending.set(id, (message) => {
      clearTimeout(timer)
      resolve(message)
    })
    child.stdin.write(payload)
  })
}

const settled = () =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, 90_000)
    const onData = (chunk) => {
      if (chunk.toString().includes('"agent_settled"')) {
        clearTimeout(timer)
        child.stdout.off('data', onData)
        resolve()
      }
    }
    child.stdout.on('data', onData)
  })

try {
  const state = await request({ type: 'get_state' })
  console.log('spawn ok, model:', state.data?.model?.id ?? state.data?.model)
  await request({ type: 'prompt', message: 'Reply with exactly: one' })
  await settled()
  await request({ type: 'prompt', message: 'Reply with exactly: two' })
  await settled()

  const before = await request({ type: 'get_tree' })
  console.log('leaf before:', before.data.leafId)

  // Target: the assistant reply to "one" = parent of the user "two" entry.
  const entries = await request({ type: 'get_entries' })
  const all = entries.data?.entries ?? []
  const twoEntry = all.find((e) =>
    e.type === 'message' && e.message?.role === 'user'
    && JSON.stringify(e.message.content ?? '').includes('two'))
  const targetId = twoEntry?.parentId
  console.log('target (assistant "one" reply):', targetId)

  const nav = await request({ type: 'prompt', message: `/lc-tree ${targetId}` })
  console.log('nav result:', JSON.stringify(nav).slice(0, 300))
  await new Promise((r) => setTimeout(r, 2000))

  const after = await request({ type: 'get_tree' })
  console.log('leaf after:', after.data.leafId, '(changed:', after.data.leafId !== before.data.leafId, ')')

  // The active path should end at the assistant "one" reply.
  const msgs = await request({ type: 'get_messages' })
  const texts = (msgs.data?.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role}: ${JSON.stringify(m.content ?? m).slice(0, 60)}`)
  console.log('active path messages:')
  for (const t of texts) console.log('  ', t)
  const lastRole = texts.at(-1)?.slice(0, 11)
  if (lastRole !== 'assistant: ') {
    console.error('FAIL: active path should end at the assistant "one" reply')
    process.exitCode = 1
  }
  if (!treeStatusPing) {
    console.error('FAIL: pi-livecraft.tree status ping missing')
    process.exitCode = 1
  }
} catch (error) {
  console.error('FAIL:', error.message)
  process.exitCode = 1
} finally {
  child.kill()
}
