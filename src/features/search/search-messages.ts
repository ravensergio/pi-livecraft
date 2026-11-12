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

/** Case-insensitive substring search over the conversation's visible message text.
 *  Matches keep message order, so "next" walks the thread top to bottom. */
export function findMatches(messages: SearchableMessage[], query: string): SearchMatch[] {
  const needle = query.toLowerCase()
  if (!needle) return []
  const matches: SearchMatch[] = []
  for (const message of messages) {
    const haystack = message.text.toLowerCase()
    let at = haystack.indexOf(needle)
    while (at !== -1) {
      matches.push({ index: message.index, start: at, end: at + needle.length })
      if (matches.length >= MAX_MATCHES) return matches
      at = haystack.indexOf(needle, at + needle.length)
    }
  }
  return matches
}

/** Cyclic position for next/previous navigation: -1 means "no match is current". */
export function stepMatch(current: number, step: number, total: number): number {
  if (total <= 0) return -1
  return (((current + step) % total) + total) % total
}
