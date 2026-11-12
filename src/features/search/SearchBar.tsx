import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findMatches, searchTerms, stepMatch, type SearchableMessage } from './search-messages.ts'

/** Highlight names registered with CSS.highlights; styled in search.css via ::highlight(). */
const HIGHLIGHT_ALL = 'livecraft-search'
const HIGHLIGHT_ACTIVE = 'livecraft-search-active'
/** Range caps: Highlight spread arguments eat the stack, and thousands of painted
 *  hits are noise the eye cannot use. */
const MAX_RANGES = 2000
const MAX_RANGES_PER_MESSAGE = 500

const supportsHighlightApi = typeof CSS !== 'undefined' && 'highlights' in CSS

/** Clears both search highlights. */
function clearHighlights(): void {
  if (!supportsHighlightApi) return
  CSS.highlights.delete(HIGHLIGHT_ALL)
  CSS.highlights.delete(HIGHLIGHT_ACTIVE)
}

/** One message element's Ranges for every occurrence of every query word. Text nodes
 *  are concatenated for the search, and each Range spans the real nodes it covers;
 *  ranges come out sorted through the text, like the matcher's per-message matches. */
function messageRanges(element: HTMLElement, words: string[], ranges: Range[]): void {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (node.textContent) nodes.push(node as Text)
    node = walker.nextNode()
  }
  const starts: number[] = []
  let total = 0
  for (const textNode of nodes) {
    starts.push(total)
    total += textNode.textContent?.length ?? 0
  }
  // Lowercased like the query terms — highlighting capitalised matches such as
  // "Flash Next" would otherwise find nothing while the count says otherwise.
  const text = nodes.map((textNode) => textNode.textContent ?? '').join('').toLowerCase()
  const locate = (position: number): { node: Text; at: number } => {
    let i = 0
    while (i + 1 < starts.length && starts[i + 1] <= position) i++
    return { node: nodes[i], at: position - starts[i] }
  }
  const found: Array<Range & { at: number }> = []
  for (const word of words) {
    let at = text.indexOf(word)
    while (at !== -1 && found.length < MAX_RANGES_PER_MESSAGE) {
      const from = locate(at)
      const to = locate(at + word.length)
      const range = document.createRange() as Range & { at: number }
      range.setStart(from.node, from.at)
      range.setEnd(to.node, to.at)
      range.at = at
      found.push(range)
      at = text.indexOf(word, at + word.length)
    }
  }
  found.sort((a, b) => a.at - b.at)
  for (const range of found) {
    delete (range as { at?: number }).at
    ranges.push(range)
  }
}

/** Renders the conversation search bar: query, match count, next/previous, close.
 *  Matches come from the message data (so folded text counts), highlighting runs
 *  over the mounted DOM through the CSS Custom Highlight API. */
export function SearchBar(
  {
    messages,
    onJump,
    onClose,
  }: {
    messages: SearchableMessage[]
    onJump: (index: number) => void
    onClose: () => void
  },
) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [rescanTick, setRescanTick] = useState(0)
  const rescan = useCallback(() => setRescanTick((tick) => tick + 1), [])

  const matches = useMemo(() => findMatches(messages, query), [messages, query])

  // Every query change restarts at the first match.
  useEffect(() => setActive(matches.length > 0 ? 0 : -1), [matches])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  // Sits directly above the composer without rendering inside its subtree
  // (that coupling stacked duplicate bars). Pure measurement: pinned by
  // getBoundingClientRect, re-placed when the composer grows or the page moves.
  useEffect(() => {
    const bar = rootRef.current
    const composer = document.querySelector<HTMLElement>('.composer')
    if (!bar || !composer) return
    const place = () => {
      const box = composer.getBoundingClientRect()
      bar.style.left = `${box.left}px`
      bar.style.width = `${box.width}px`
      bar.style.transform = 'none'
      bar.style.top = `${Math.max(box.top - bar.offsetHeight - 8, 8)}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(composer)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [])

  const jump = useCallback((position: number) => {
    const match = matches[position]
    if (!match) return
    setActive(position)
    onJump(match.index)
    // Folds open and late history mounts after the scroll settles; rescan once they land.
    window.setTimeout(rescan, 400)
  }, [matches, onJump, rescan])

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      jump(stepMatch(active, event.shiftKey ? -1 : 1, matches.length))
    }
  }

  // Highlight pass over the mounted conversation DOM.
  useEffect(() => {
    clearHighlights()
    if (!supportsHighlightApi || !query || matches.length === 0) return
    const conversation = document.querySelector<HTMLElement>('.conversation')
    if (!conversation) return
    const terms = searchTerms(query)
    const activeMatch = matches[active]
    // One scan per mounted message, not per match (the old per-match loop pushed every
    // occurrence of every match: quadratic, and the Highlight spread overflowed the stack).
    const seen = new Set<number>()
    const all: Range[] = []
    const activeRanges: Range[] = []
    for (const match of matches) {
      if (seen.has(match.index)) continue
      seen.add(match.index)
      const element = conversation.querySelector<HTMLElement>(
        `[data-message-index="${match.index}"]`,
      )
      if (!element) continue
      const ranges: Range[] = []
      messageRanges(element, terms, ranges)
      if (activeMatch && activeMatch.index === match.index) {
        // Occurrences inside the message keep document order; the active match is the
        // one whose start offset ranks at the same position among them.
        const rank = matches
          .filter(
            (m) => m.index === match.index && m.start < activeMatch.start,
          )
          .length
        const activeRange = ranges[rank]
        if (activeRange) activeRanges.push(activeRange)
      }
      for (const range of ranges) {
        if (all.length >= MAX_RANGES) break
        all.push(range)
      }
    }
    CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...all))
    if (activeRanges.length > 0)
      CSS.highlights.set(HIGHLIGHT_ACTIVE, new Highlight(...activeRanges))
  }, [query, matches, active, rescanTick])

  // Highlight API ranges die when React replaces text nodes; re-scan on DOM changes.
  useEffect(() => {
    if (!supportsHighlightApi) return
    const conversation = document.querySelector<HTMLElement>('.conversation')
    if (!conversation) return
    let frame = 0
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(rescan)
    })
    observer.observe(conversation, { childList: true, characterData: true, subtree: true })
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [rescan])

  // Leaving search removes the highlights.
  useEffect(() => () => clearHighlights(), [])

  const count = matches.length
  return (
    <div className='search-bar' ref={rootRef} role='search'>
      <input
        aria-label='Search this conversation'
        className='search-bar-input'
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder='Search this conversation…'
        ref={inputRef}
        spellCheck={false}
        type='text'
        value={query}
      />
      <div className='search-bar-controls'>
        <span className='search-bar-count'>
          {query === '' ? '' : count === 0 ? 'no matches' : `${active + 1} of ${count}`}
        </span>
        <button
          aria-label='Previous match'
          className='search-bar-button'
          onClick={() => jump(stepMatch(active, -1, matches.length))}
          disabled={count === 0}
          type='button'
        >
          ↑
        </button>
        <button
          aria-label='Next match'
          className='search-bar-button'
          onClick={() => jump(stepMatch(active, 1, matches.length))}
          disabled={count === 0}
          type='button'
        >
          ↓
        </button>
        <button
          aria-label='Close search'
          className='search-bar-button'
          onClick={onClose}
          type='button'
        >
          ✕
        </button>
      </div>
    </div>
  )
}
