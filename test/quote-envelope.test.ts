import assert from 'node:assert/strict'
import test from 'node:test'
import {
  markInsertedQuotes,
  QUOTE_END,
  QUOTE_START,
  stripQuoteMarkers,
  unwrapQuoteMarkers,
} from '../src/features/conversation/quote-envelope.ts'

const quote = '> run the migration first\n> then restart the container'

test('wraps a quoted reply so it cannot read as a new question', () => {
  const sent = markInsertedQuotes(`${quote}\n\nand after the restart?`, [quote])
  assert.equal(
    sent,
    `${QUOTE_START}\n${quote}\n${QUOTE_END}\n\nand after the restart?`,
  )
})

test('leaves text and pasted blockquotes you typed yourself untouched', () => {
  const typed = 'apply this diff:\n> old line\n> new line\n\nok?'
  assert.equal(markInsertedQuotes(typed, []), typed)
  assert.equal(markInsertedQuotes(typed, ['> something else entirely']), typed)
})

test('a quote you edited away is sent as plain text, never guessed at', () => {
  const typed = '> run the migration\n\nand then?'
  assert.equal(markInsertedQuotes(typed, [quote]), typed)
})

test('quoting the same reply twice marks both, and only once each', () => {
  const sent = markInsertedQuotes(`${quote}\n\nfirst\n\n${quote}\n\nsecond`, [quote, quote])
  assert.equal(sent.split(QUOTE_START).length - 1, 2)
  assert.equal(sent.includes(`${QUOTE_START}\n${QUOTE_START}`), false)
})

test('your own message shows the quote exactly as typed', () => {
  const typed = `${quote}\n\nand after the restart?`
  assert.equal(stripQuoteMarkers(markInsertedQuotes(typed, [quote])), typed)
  assert.equal(stripQuoteMarkers('no markers here'), 'no markers here')
})

test('older marker wording stays hidden too, so history never shows markers', () => {
  const older = '[QUOTED FROM AN EARLIER REPLY — reference only]\n> keep this\n'
    + '[END QUOTE] — answer only what I write below\nwhy?'
  assert.equal(stripQuoteMarkers(older), '> keep this\nwhy?')
})

test('unwrapping message content keeps images and other parts as they are', () => {
  const content = [
    { type: 'image', data: 'AAA', mimeType: 'image/png' },
    { type: 'text', text: `${QUOTE_START}\n${quote}\n${QUOTE_END}\n\nwhy?` },
  ]
  assert.deepEqual(unwrapQuoteMarkers(content), [
    { type: 'image', data: 'AAA', mimeType: 'image/png' },
    { type: 'text', text: `${quote}\n\nwhy?` },
  ])
  assert.equal(unwrapQuoteMarkers(`${QUOTE_START}\nplain\n${QUOTE_END}`), 'plain')
})
