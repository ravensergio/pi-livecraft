import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findMatches, stepMatch, type SearchableMessage } from './search-messages.ts'

/** Highlight names registered with CSS.highlights; styled in search.css via ::highlight(). */
const HIGHLIGHT_ALL = 'livecraft-search'
const HIGHLIGHT_ACTIVE = 'livecraft-search-active'

const supportsHighlightApi = typeof CSS !== 'undefined' && 'highlights' in CSS

/** Clears both search highlights. */
function clearHighlights(): void {
  if (!supportsHighlightApi) return
  CSS.highlights.delete(HIGHLIGHT_ALL)
  CSS.highlights.delete(HIGHLIGHT_ACTIVE)
}

/** One message element's Ranges for every occurrence of the query. Text nodes are
 *  concatenated for the search, and each Range spans the real nodes it covers. */
function messageRanges(element: HTMLElement, query: string, ranges: Range[]): void {
  const needle = query.toLowerCase()
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
  const text = nodes.map((textNode) => textNode.textContent ?? '').join('')
  const locate = (position: number): { node: Text; at: number } => {
    let i = 0
    while (i + 1 < starts.length && starts[i + 1] <= position) i++
    return { node: nodes[i], at: position - starts[i] }
  }
  let at = text.indexOf(needle)
  while (at !== -1) {
    const from = locate(at)
    const to = locate(at + needle.length)
    const range = document.createRange()
    range.setStart(from.node, from.at)
    range.setEnd(to.node, to.at)
    ranges.push(range)
    at = text.indexOf(needle, at + needle.length)
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
  const [rescanTick, setRescanTick] = useState(0)
  const rescan = useCallback(() => setRescanTick((tick) => tick + 1), [])

  const matches = useMemo(() => findMatches(messages, query), [messages, query])

  // Every query change restarts at the first match.
  useEffect(() => setActive(matches.length > 0 ? 0 : -1), [matches])

  useEffect(() => {
    inputRef.current?.focus()
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
    const all: Range[] = []
    const activeRanges: Range[] = []
    const activeMatch = matches[active]
    for (const match of matches) {
      const element = conversation.querySelector<HTMLElement>(
        `[data-message-index="${match.index}"]`,
      )
      if (!element) continue
      const ranges: Range[] = []
      messageRanges(element, query, ranges)
      if (activeMatch && activeMatch.index === match.index) {
        // Occurrences inside the message keep document order; the active match is the
        // one whose start offset ranks at the same position among them.
        const rank = matches
          .filter(
            (m) => m.index === match.index && m.start < (activeMatch?.start ?? -1),
          )
          .length
        const activeRange = ranges[rank]
        if (activeRange) activeRanges.push(activeRange)
      }
      all.push(...ranges)
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
    <div className='search-bar' role='search'>
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
  )
}
