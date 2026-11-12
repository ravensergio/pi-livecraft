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

/** Splits a query into terms: quoted "swift next" is one exact phrase, every other
 *  word is its own term. Exposed for the DOM highlighter, which must find the same
 *  terms the matcher found. */
export function searchTerms(query: string): string[] {
  return (
    query
      .toLowerCase()
      .match(/"[^"]*"|\S+/g)
      ?.map((term) => term.replace(/^"|"$/g, ''))
      .filter(Boolean) ?? []
  )
}

/** Case-insensitive search over the conversation's visible message text. Every term
 *  must appear as a substring, in any order — "swift next" finds "Swift 1.5 Flash
 *  Next" — while '"swift next"' demands that exact wording. Messages are ranked by
 *  how tightly their terms cluster (quoted phrase first, closest words first), ties
 *  keep thread order; within a message, occurrences stay in reading order. A
 *  single-word query therefore never reorders. Capped so a typo query stays
 *  responsive. */
export function findMatches(messages: SearchableMessage[], query: string): SearchMatch[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return []
  const ranked: Array<{ order: number; span: number; matches: SearchMatch[] }> = []
  for (const message of messages) {
    const haystack = message.text.toLowerCase()
    let spanEnd = 0
    let spanStart = Infinity
    let misses = false
    for (const term of terms) {
      const at = haystack.indexOf(term)
      if (at === -1) {
        misses = true
        break
      }
      spanStart = Math.min(spanStart, at)
      spanEnd = Math.max(spanEnd, at + term.length)
    }
    if (misses) continue
    const found: SearchMatch[] = []
    for (const term of terms) {
      let at = haystack.indexOf(term)
      while (at !== -1) {
        found.push({ index: message.index, start: at, end: at + term.length })
        at = haystack.indexOf(term, at + term.length)
      }
    }
    found.sort((a, b) => a.start - b.start)
    ranked.push({ order: ranked.length, span: spanEnd - spanStart, matches: found })
  }
  ranked.sort((a, b) => a.span - b.span || a.order - b.order)
  const matches: SearchMatch[] = []
  for (const entry of ranked) {
    matches.push(...entry.matches)
    if (matches.length >= MAX_MATCHES) return matches.slice(0, MAX_MATCHES)
  }
  return matches
}

/** Cyclic position for next/previous navigation: -1 means "no match is current". */
export function stepMatch(current: number, step: number, total: number): number {
  if (total <= 0) return -1
  return (((current + step) % total) + total) % total
}
