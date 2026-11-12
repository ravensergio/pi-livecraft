import assert from 'node:assert/strict'
import test from 'node:test'
import { findMatches, stepMatch } from '../src/features/search/search-messages.ts'

const entries = [
  { index: 2, text: 'Restart the Basalt engine and check engine.log' },
  { index: 5, text: 'engine.log shows RAM low twice' },
]

test('finds matches case-insensitively in thread order with offsets', () => {
  assert.deepEqual(findMatches(entries, 'ENGINE.LOG'), [
    { index: 2, start: 36, end: 46 },
    { index: 5, start: 0, end: 10 },
  ])
})

test('finds every occurrence inside one message, non-overlapping', () => {
  assert.deepEqual(findMatches([{ index: 0, text: 'ababab' }], 'ab'), [
    { index: 0, start: 0, end: 2 },
    { index: 0, start: 2, end: 4 },
    { index: 0, start: 4, end: 6 },
  ])
})

test('an empty query matches nothing', () => {
  assert.deepEqual(findMatches(entries, ''), [])
})

test('the match list is capped so a typo query stays responsive', () => {
  const huge = [{ index: 0, text: 'a'.repeat(5000) }]
  assert.equal(findMatches(huge, 'a').length, 1000)
})

test('every query word must appear, in any order — swift next finds Swift 1.5 Flash Next', () => {
  const corpus = [
    { index: 0, text: 'Swift 1.5 Flash Next decodes fast' },
    { index: 1, text: 'only next time' },
  ]
  assert.deepEqual(findMatches(corpus, 'swift next'), [
    { index: 0, start: 0, end: 5 },
    { index: 0, start: 16, end: 20 },
  ])
})

test('multiple query words interleave in text order and extra spaces are ignored', () => {
  assert.deepEqual(
    findMatches([{ index: 3, text: 'next then swift then next' }], '  next   swift '),
    [
      { index: 3, start: 0, end: 4 },
      { index: 3, start: 10, end: 15 },
      { index: 3, start: 21, end: 25 },
    ],
  )
})

test('next and previous cycle through the matches', () => {
  assert.equal(stepMatch(0, 1, 3), 1)
  assert.equal(stepMatch(2, 1, 3), 0)
  assert.equal(stepMatch(0, -1, 3), 2)
  assert.equal(stepMatch(-1, 1, 0), -1)
})
