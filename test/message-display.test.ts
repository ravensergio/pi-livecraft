import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatMessageStamp,
  hiddenLineCount,
  reasoningTextForDisplay,
} from '../src/features/conversation/message-display.ts'

test('removes standard CSI SGR truecolor styling and resets', () => {
  assert.equal(
    reasoningTextForDisplay(
      'assistant',
      '\x1b[38;2;56;189;248mThinking:\x1b[39m details\x1b[0m',
    ),
    'Thinking: details',
  )
})

test('removes C1 CSI SGR sequences', () => {
  assert.equal(
    reasoningTextForDisplay('assistant', '\x9b1;38;2;56;189;248mThinking\x9b0m'),
    'Thinking',
  )
})

test('preserves Markdown, bracketed text, and non-SGR controls', () => {
  const text = '[38;2;56;189;248m **Markdown** \x1b[2J'

  assert.equal(reasoningTextForDisplay('assistant', text), text)

  const styledCustomContent = '\x1b[31mextension-owned\x1b[0m'
  assert.equal(reasoningTextForDisplay('custom', styledCustomContent), styledCustomContent)
})

test('formats a message stamp as dd-mm-yyyy HH:mm', () => {
  assert.equal(formatMessageStamp(new Date(2026, 9, 3, 9, 7)), '03-10-2026 09:07')
  assert.equal(formatMessageStamp(new Date(2026, 10, 25, 22, 5)), '25-11-2026 22:05')
})

test('counts the lines a folded message hides', () => {
  // 20 lines of 20px shown through a 10-line window: 10 lines are hidden.
  assert.equal(hiddenLineCount(400, 200, 20), 10)
  assert.equal(hiddenLineCount(218, 200, 20), 1)
})

test('leaves a message that fits unfolded', () => {
  assert.equal(hiddenLineCount(200, 200, 20), 0)
  assert.equal(hiddenLineCount(140, 200, 20), 0)
  // A trailing margin must not invent a "show more" control for nothing.
  assert.equal(hiddenLineCount(208, 200, 20), 0)
  assert.equal(hiddenLineCount(400, 200, 0), 0)
})
