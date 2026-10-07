import assert from 'node:assert/strict'
import test from 'node:test'
import type { ServerResponse } from 'node:http'
import { broadcastFrame } from '../server/sse-broadcast.ts'

interface FakeClient {
  destroyed: boolean
  writable: boolean
  write: (chunk: string) => boolean
}

function fakeClient(overrides: Partial<FakeClient> = {}): {
  client: ServerResponse
  fake: FakeClient
  writes: string[]
} {
  const writes: string[] = []
  const fake: FakeClient = {
    destroyed: false,
    writable: true,
    write: (chunk) => {
      writes.push(chunk)
      return true
    },
    ...overrides,
  }
  return { client: fake as unknown as ServerResponse, fake, writes }
}

test('broadcastFrame writes to live clients and lazily drops dead ones', () => {
  const alive = fakeClient()
  const destroyed = fakeClient({
    destroyed: true,
    writable: false,
    write: () => {
      assert.fail('must not write to destroyed client')
      return true
    },
  })
  const notWritable = fakeClient({
    writable: false,
    write: () => {
      assert.fail('must not write to non-writable client')
      return true
    },
  })
  const throws = fakeClient({
    write: () => {
      throw new Error('ERR_STREAM_WRITE_AFTER_END')
    },
  })
  const clients = new Set<ServerResponse>([
    alive.client,
    destroyed.client,
    notWritable.client,
    throws.client,
  ])

  broadcastFrame(clients, 'data: {"event":"x"}\n\n')

  assert.deepEqual(alive.writes, ['data: {"event":"x"}\n\n'])
  assert.equal(clients.has(alive.client), true)
  assert.equal(clients.has(destroyed.client), false)
  assert.equal(clients.has(notWritable.client), false)
  assert.equal(clients.has(throws.client), false)
})

test('broadcastFrame survives a client dying mid-iteration', () => {
  const first = fakeClient()
  const second = fakeClient()
  // The first write kills the second client, as a real AFK socket death would.
  first.fake.write = (chunk) => {
    first.writes.push(chunk)
    second.fake.destroyed = true
    second.fake.writable = false
    return true
  }
  const clients = new Set<ServerResponse>([first.client, second.client])

  broadcastFrame(clients, 'data: a\n\n')

  assert.deepEqual(first.writes, ['data: a\n\n'])
  assert.equal(second.writes.length, 0)
  assert.equal(clients.has(second.client), false)
})
