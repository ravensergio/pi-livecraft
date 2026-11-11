import { isObject } from '../../../shared/is-object.ts'

/**
 * The quote envelope.
 *
 * Quoting a reply inserts Markdown blockquote lines in the composer, which is
 * what you see and edit. A blockquote is only a rendering convention, so a small
 * local model can read the quoted question as new input and answer it again.
 * Only the text that leaves the composer gets these markers around the quoted
 * part; the chat strips them again, so your own message shows the quote as typed.
 */

// The wording is what the model reads; the start prefix is what the chat recognises,
// so the sentence can be reworded later without older messages showing markers.
const QUOTE_START_PREFIX = '[QUOTED FROM AN EARLIER REPLY'

// Labelling the quote as context keeps it usable while blocking a second answer to
// it; "answer only what I write" would invite the model to drop the context you
// quoted it for. The end marker only has to close the block, so it says nothing else.
export const QUOTE_START = `${QUOTE_START_PREFIX} — context, not a new question]`
export const QUOTE_END = '[END QUOTE]'

/** Wraps the quotes this composer inserted, leaving anything you typed or pasted
 *  yourself exactly as written — the blockquote character is never a trigger.
 *  A quote you edited beyond recognition is sent unmarked rather than guessed at. */
export function markInsertedQuotes(message: string, quotes: readonly string[]): string {
  let result = message
  for (const quote of new Set(quotes)) {
    if (!quote) continue
    let index = result.indexOf(quote)
    while (index >= 0) {
      const end = index + quote.length
      const wrapped = `${QUOTE_START}\n${quote}\n${QUOTE_END}`
      result = result.slice(0, index) + wrapped + result.slice(end)
      index = result.indexOf(quote, index + wrapped.length)
    }
  }
  return result
}

/** Removes the marker lines so your own message reads as you typed it. */
export function stripQuoteMarkers(text: string): string {
  if (!text.includes(QUOTE_START_PREFIX) && !text.includes(QUOTE_END)) return text
  return text
    .split('\n')
    .filter((line) => !line.startsWith(QUOTE_START_PREFIX) && !line.startsWith(QUOTE_END))
    .join('\n')
}

/** Same message content with the marker lines removed, so the chat shows the quote
 *  exactly as it was typed. */
export function unwrapQuoteMarkers(content: unknown): unknown {
  if (typeof content === 'string') return stripQuoteMarkers(content)
  if (!Array.isArray(content)) return content
  // Untouched parts keep their identity, so rendered children do not re-render for
  // a message that never had markers.
  if (
    !content.some((part) =>
      isObject(part) && typeof part.text === 'string' && part.text.includes(QUOTE_START_PREFIX)
    )
  ) {
    return content
  }
  return content.map((part) =>
    isObject(part) && part.type === 'text' && typeof part.text === 'string'
      ? { ...part, text: stripQuoteMarkers(part.text) }
      : part
  )
}
