import assert from 'node:assert/strict'
import test from 'node:test'
import { keyboardInset } from '../src/keyboard-inset.ts'

test('keyboardInset is zero when the visual viewport fills the layout', () => {
  assert.equal(keyboardInset(844, 0, 844), 0)
})

test('keyboardInset is the covered height when the keyboard opens', () => {
  assert.equal(keyboardInset(844, 0, 344), 500)
})

test('keyboardInset accounts for the visual viewport scroll offset', () => {
  assert.equal(keyboardInset(844, 100, 344), 400)
})

test('keyboardInset never goes negative', () => {
  assert.equal(keyboardInset(844, 0, 900), 0)
})
