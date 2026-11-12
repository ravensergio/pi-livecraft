export interface SearchableMessage {
  /** Index into the session's message array; the DOM anchor `data-message-index`. */
  index: number
  text: string
}

export interface SearchMatch {
  index: number
  /** Character offset of the match inside that message's text. */
  start: number
  end: number
}

/** Generous cap: a query matching tens of thousands of times is a typo, not a search. */
const MAX_MATCHES = 1000

/** Case-insensitive search over the conversation's visible message text, Hugging Face
 *  style: every word of the query must appear in the message, in any order, as a
 *  substring — "swift next" finds "Swift 1.5 Flash Next". A message's matches are the
 *  occurrences of its words, sorted through the text, so next/previous walks the thread
 *  top to bottom. Capped so a typo query stays responsive. */
export function findMatches(messages: SearchableMessage[], query: string): SearchMatch[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const matches: SearchMatch[] = []
  for (const message of messages) {
    const haystack = message.text.toLowerCase()
    if (!words.every((word) => haystack.includes(word))) continue
    const found: SearchMatch[] = []
    for (const word of words) {
      let at = haystack.indexOf(word)
      while (at !== -1) {
        found.push({ index: message.index, start: at, end: at + word.length })
        at = haystack.indexOf(word, at + word.length)
      }
    }
    found.sort((a, b) => a.start - b.start)
    matches.push(...found)
    if (matches.length >= MAX_MATCHES) return matches.slice(0, MAX_MATCHES)
  }
  return matches
}

/** Cyclic position for next/previous navigation: -1 means "no match is current". */
export function stepMatch(current: number, step: number, total: number): number {
  if (total <= 0) return -1
  return (((current + step) % total) + total) % total
}
