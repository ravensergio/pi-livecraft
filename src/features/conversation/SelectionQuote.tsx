import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Floating "ask about this" button that appears when text is selected in an assistant message. */
export function SelectionQuote() {
  const [state, setState] = useState<{ x: number; y: number; text: string } | null>(null)
  const hideTimer = useRef<number | null>(null)

  const scheduleHide = useCallback((delayMs = 2000) => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setState(null), delayMs)
  }, [])

  useEffect(() => {
    const onSelectionChange = () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current)

      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        setState(null)
        return
      }

      const range = selection.getRangeAt(0)
      const anchor = range.startContainer
      const focus = range.endContainer

      // Only show for selections inside assistant message content
      const anchorEl = (anchor instanceof Text ? anchor.parentElement : anchor) as Element | null
      const focusEl = (focus instanceof Text ? focus.parentElement : focus) as Element | null
      if (!anchorEl || !focusEl) {
        setState(null)
        return
      }

      const inAssistant = (el: Element) => el.closest('.message.assistant') !== null

      if (!inAssistant(anchorEl) || !inAssistant(focusEl)) {
        setState(null)
        return
      }

      // Must be within the same message
      const anchorMsg = anchorEl.closest('.message')
      const focusMsg = focusEl.closest('.message')
      if (anchorMsg !== focusMsg) {
        setState(null)
        return
      }

      const text = selection.toString().trim()
      if (!text) {
        setState(null)
        return
      }

      const rect = range.getBoundingClientRect()
      setState({ x: rect.left + rect.width / 2, y: rect.top - 8, text })
      scheduleHide(5000)
    }

    const onScroll = () => {
      if (state) setState(null)
    }

    document.addEventListener('selectionchange', onSelectionChange)
    window.addEventListener('scroll', onScroll, true)

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      window.removeEventListener('scroll', onScroll, true)
      if (hideTimer.current !== null) clearTimeout(hideTimer.current)
    }
  }, [state, scheduleHide])

  const handleClick = useCallback((text: string) => {
    const event = new CustomEvent('livecraft:insert-quote', { detail: { text } })
    document.dispatchEvent(event)
    setState(null)
  }, [])

  if (!state) return null

  return createPortal(
    <button
      className='selection-quote-btn'
      onClick={() => handleClick(state.text)}
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        transform: 'translate(-50%, -100%)',
      }}
      title='Ask about this'
      type='button'
    >
      ❝ Ask about this
    </button>,
    document.body,
  )
}
