import assert from 'node:assert/strict'
import test from 'node:test'
import { createEventCoalescer } from '../src/event-coalescer.ts'

test('delivers a single event on the next tick', () => {
  const delivered: number[] = []
  const ticks: Array<() => void> = []
  const coalescer = createEventCoalescer<number>(
    (events) => delivered.push(...events),
    (callback) => {
      ticks.push(callback)
    },
  )
  coalescer.push(1)
  assert.equal(delivered.length, 0)
  assert.equal(ticks.length, 1)
  ticks[0]()
  assert.deepEqual(delivered, [1])
})

test('coalesces a burst into one in-order delivery', () => {
  const delivered: number[][] = []
  const ticks: Array<() => void> = []
  const coalescer = createEventCoalescer<number>(
    (events) => delivered.push([...events]),
    (callback) => {
      ticks.push(callback)
    },
  )
  coalescer.push(1)
  coalescer.push(2)
  coalescer.push(3)
  assert.equal(delivered.length, 0)
  assert.equal(ticks.length, 1)
  ticks[0]()
  assert.equal(delivered.length, 1)
  assert.deepEqual(delivered[0], [1, 2, 3])
})

test('schedules one tick per burst, not one per event', () => {
  let scheduled = 0
  const coalescer = createEventCoalescer<number>(() => undefined, () => {
    scheduled += 1
  })
  coalescer.push(1)
  coalescer.push(2)
  assert.equal(scheduled, 1)
})

test('dispose drops pending events and a late tick is a no-op', () => {
  const delivered: number[] = []
  const ticks: Array<() => void> = []
  const coalescer = createEventCoalescer<number>(
    (events) => delivered.push(...events),
    (callback) => {
      ticks.push(callback)
    },
  )
  coalescer.push(1)
  coalescer.dispose()
  assert.equal(ticks.length, 1)
  ticks[0]()
  assert.deepEqual(delivered, [])
})
