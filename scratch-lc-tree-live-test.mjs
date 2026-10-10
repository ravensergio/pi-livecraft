// Live end-to-end test of the branch button pipeline:
// backend -> manager -> Pi -> /lc-tree extension -> snapshot refresh.
const BASE = 'http://127.0.0.1:43121'

async function api(path, init) {
  const response = await fetch(BASE + path, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${path} -> ${response.status}: ${JSON.stringify(body).slice(0, 200)}`)
  return body
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function settle(sessionId, timeoutMs = 90_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const snapshot = await api(`/api/sessions/${sessionId}/snapshot`)
    const state = snapshot.state ?? {}
    if (state.isStreaming !== true && state.status !== 'running') return
    await sleep(1500)
  }
  throw new Error('session did not settle')
}

try {
  // Fresh temp session in the repo cwd.
  const created = await api('/api/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cwd: 'E:/z_Working_PI/00-web-pi-livecraft', temporary: true }),
  })
  const id = created.id ?? created.sessionId
  console.log('session:', id)

  await api(`/api/sessions/${id}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'prompt', message: 'Reply with exactly: one' }),
  })
  await settle(id)
  await api(`/api/sessions/${id}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'prompt', message: 'Reply with exactly: two' }),
  })
  await settle(id)

  const before = await api(`/api/sessions/${id}/snapshot`)
  const withIds = before.messages.filter((m) => typeof m.entryId === 'string')
  console.log('messages with entryId:', withIds.length, '/', before.messages.length)
  if (withIds.length === 0) throw new Error('entryId missing from snapshot messages')

  // Target: the assistant reply to "one" = the message just before user "two".
  const idx = before.messages.findIndex((m) => JSON.stringify(m.content ?? '').includes('two'))
  const target = before.messages[idx - 1]
  console.log('target:', target.role, target.entryId)

  await api(`/api/sessions/${id}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'prompt', message: `/lc-tree ${target.entryId}` }),
  })
  await sleep(3000)

  const after = await api(`/api/sessions/${id}/snapshot`)
  console.log('messages before:', before.messages.length, '-> after:', after.messages.length)
  const last = after.messages.at(-1)
  console.log('last message after nav:', last?.role, String(JSON.stringify(last?.content ?? '').slice(0, 50)))
  if (after.messages.length >= before.messages.length) {
    console.error('FAIL: snapshot did not shrink after navigation')
    process.exitCode = 1
  } else {
    console.log('OK: tail hidden, snapshot reflects the active branch')
  }

  await api(`/api/sessions/${id}/close`, { method: 'POST' }).catch(() => undefined)
} catch (error) {
  console.error('FAIL:', error.message)
  process.exitCode = 1
}
