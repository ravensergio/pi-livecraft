import { memo, useEffect, useState, type ReactNode } from 'react'
import type { JsonObject } from '../../../shared/types.ts'
import { isObject } from '../../../shared/is-object.ts'
import { CopyButton } from './CopyButton.tsx'
import { ForkButton } from './ForkButton.tsx'
import { Markdown } from './Markdown.tsx'
import { hasVisibleContent, reasoningTextForDisplay } from './message-display.ts'
import { formatSpeed, formatTokens, formatTurnCost, type MessageUsage } from './message-usage.ts'

/** How thinking blocks present themselves for the session. */
export type ReasoningMode = 'auto' | 'expanded' | 'collapsed'

/** Renders a visible protocol message with the default or custom presentation. */
export const MessageCard = memo(
  function MessageCard(
    { live = false, message, onError, onFork, reasoningMode = 'auto' }: {
      live?: boolean
      message: JsonObject
      onError: (cause: unknown) => void
      onFork: (entryId: string) => Promise<boolean>
      reasoningMode?: ReasoningMode
    },
  ) {
    if (message.role === 'custom' && typeof message.customType === 'string')
      return <DefaultCustomMessage message={message} />
    return (
      <DefaultMessageCard
        live={live}
        message={message}
        onError={onError}
        onFork={onFork}
        reasoningMode={reasoningMode}
      />
    )
  },
)

const DefaultMessageCard = memo(
  function DefaultMessageCard(
    { live, message, onError, onFork, reasoningMode }: {
      live: boolean
      message: JsonObject
      onError: (cause: unknown) => void
      onFork: (entryId: string) => Promise<boolean>
      reasoningMode: ReasoningMode
    },
  ) {
    const role = String(message.role)
    const timestamp = typeof message.timestamp === 'number' ? new Date(message.timestamp) : null
    const time = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null
    const text = visibleText(message.content ?? message.output)
    const forkEntryId = role === 'user' && typeof message.forkEntryId === 'string'
      ? message.forkEntryId
      : undefined
    return (
      <article className={`message ${role}`}>
        {(text || forkEntryId) && (
          <div className='conversation-actions message-actions'>
            {forkEntryId && <ForkButton entryId={forkEntryId} onError={onError} onFork={onFork} />}
            {text && <CopyButton label='Copy message' onError={onError} value={text} />}
          </div>
        )}
        <div className='content'>
          {renderContent(
            message.content ?? message.output,
            message.role,
            onError,
            live,
            reasoningMode,
          )}
        </div>
        {role === 'user' && time && (
          <time
            className='message-time'
            dateTime={time.toISOString()}
          >
            {time.toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' })}
          </time>
        )}
      </article>
    )
  },
)

/** Renders an unknown custom message without interpreting extension-specific details. */
function DefaultCustomMessage({ message }: { message: JsonObject & { customType?: unknown } }) {
  const content = hasVisibleContent(message.content)
    ? renderContent(message.content, message.role)
    : <p>Message has no displayable content.</p>
  return (
    <article className='message custom-message'>
      <code className='custom-message-type'>{String(message.customType)}</code>
      <div className='content'>{content}</div>
    </article>
  )
}

/** Displays counters billed by Pi for a completed assistant response. */
export function TurnUsage(
  { durationMs, turnNumber, usage }: {
    durationMs?: number
    turnNumber?: number
    usage: MessageUsage
  },
) {
  const speed = durationMs && durationMs > 0 ? usage.output / (durationMs / 1000) : null
  return (
    <dl className='turn-usage'>
      {turnNumber !== undefined && (
        <div>
          <dt>Turn</dt>
          <dd>{turnNumber}</dd>
        </div>
      )}
      <div>
        <dt>{speed !== null ? 'Speed' : 'Cost'}</dt>
        <dd>{speed !== null ? formatSpeed(speed) : formatTurnCost(usage.cost)}</dd>
      </div>
      <div>
        <dt>Cache read</dt>
        <dd>{formatTokens(usage.cacheRead)}</dd>
      </div>
      <div>
        <dt>Cache miss</dt>
        <dd>{formatTokens(usage.cacheMiss)}</dd>
      </div>
      <div>
        <dt>Output</dt>
        <dd>{formatTokens(usage.output)}</dd>
      </div>
    </dl>
  )
}

export function visibleText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((part) =>
      isObject(part) && part.type === 'text' && typeof part.text === 'string' ? [part.text] : []
    )
    .join('')
}

/** Renders message content in protocol order, including visible thinking. */
function renderContent(
  content: unknown,
  role: unknown,
  onError?: (cause: unknown) => void,
  live = false,
  reasoningMode: ReasoningMode = 'auto',
): ReactNode {
  if (typeof content === 'string') {
    const markdown = (
      <Markdown breaks={role !== 'assistant'} copyablePre={role === 'assistant'} onError={onError}>
        {content}
      </Markdown>
    )
    return role === 'assistant' ? <div className='reply-block'>{markdown}</div> : markdown
  }
  if (!Array.isArray(content)) return null
  return (
    <>
      {content.map((part, contentIndex) => {
        if (isImageContent(part))
          return (
            <img
              alt={`Attached image ${contentIndex + 1}`}
              className='message-image'
              key={`image-${contentIndex}`}
              src={`data:${part.mimeType};base64,${part.data}`}
            />
          )
        if (!isObject(part)) return null
        if (part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim())
          return (
            <ReasoningBlock
              copyablePre={role === 'assistant'}
              key={`reasoning-${contentIndex}`}
              // A thinking segment is active only while it is the message's last part:
              // it opens when streaming starts and collapses as soon as text, a tool call,
              // or the next thinking segment begins.
              live={live && contentIndex === content.length - 1}
              mode={reasoningMode}
              onError={onError}
            >
              {reasoningTextForDisplay(role, part.thinking)}
            </ReasoningBlock>
          )
        if (part.type === 'text' && typeof part.text === 'string') {
          const markdown = (
            <Markdown
              breaks={role !== 'assistant'}
              copyablePre={role === 'assistant'}
              key={`text-${contentIndex}`}
              onError={onError}
            >
              {part.text}
            </Markdown>
          )
          return role === 'assistant'
            ? <div className='reply-block' key={`text-${contentIndex}`}>{markdown}</div>
            : markdown
        }
        return null
      })}
    </>
  )
}

/** Collapsible thinking: a "Thinking" toggle with a one-line teaser when closed.
 *  In auto mode it follows streaming (open while live, closed once the message ends);
 *  expanded/collapsed modes keep their default until the user toggles a block. */
function ReasoningBlock(
  { children, copyablePre, live = false, mode = 'auto', onError }: {
    children: string
    copyablePre: boolean
    live?: boolean
    mode?: ReasoningMode
    onError?: (cause: unknown) => void
  },
) {
  // History blocks always mount closed; "expanded" only opens blocks that are
  // already streaming when they appear (a reload must not re-open the past).
  const [open, setOpen] = useState((mode === 'auto' || mode === 'expanded') && live)
  const [touched, setTouched] = useState(false)

  // Mode switches apply to past blocks only for hidden/auto (cheap: closing or
  // following the stream). "Expanded" never re-opens history — it only affects
  // blocks created from that moment on. Manually toggled blocks keep their state.
  useEffect(() => {
    if (touched || mode === 'expanded') return
    setOpen(mode === 'auto' && live)
  }, [live, mode, touched])

  return (
    <div className={`reasoning-block${open ? ' open' : ''}`}>
      <button
        aria-expanded={open}
        className='reasoning-toggle'
        onClick={() => {
          setTouched(true)
          setOpen((current) => !current)
        }}
        type='button'
      >
        <svg aria-hidden='true' className='reasoning-chevron' viewBox='0 0 16 16'>
          <path d='m5.5 3.5 5 4.5-5 4.5' />
        </svg>
        <span className='reasoning-label'>Thinking</span>
        {!open && <span className='reasoning-teaser'>{reasoningTeaser(children)}</span>}
      </button>
      {open && (
        <div className='reasoning'>
          <Markdown copyablePre={copyablePre} onError={onError}>{children}</Markdown>
        </div>
      )}
    </div>
  )
}

// Sized to fit two visual lines in the 762px conversation column at 13px:
// ~98 chars/line. The teaser must always show the END of the thinking.
const TEASER_MAX_CHARS = 190
const TEASER_MIN_TAIL_CHARS = 90

/** Tail teaser for collapsed thinking: the last ~240 characters, snapped back to a
 *  clean break (newline or sentence end) when that still leaves a substantial tail. */
function reasoningTeaser(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (trimmed.length <= TEASER_MAX_CHARS) return trimmed
  const slice = trimmed.slice(-TEASER_MAX_CHARS)
  const newline = slice.lastIndexOf('\n')
  const sentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  )
  const cut = Math.max(newline, sentence)
  if (cut > TEASER_MAX_CHARS / 2 && slice.length - cut - 1 >= TEASER_MIN_TAIL_CHARS)
    return `…${slice.slice(cut + 1).trim()}`
  return `…${slice.trim()}`
}

function isImageContent(value: unknown): value is JsonObject & { data: string; mimeType: string } {
  return isObject(value) && value.type === 'image' && typeof value.data === 'string' && typeof value
        .mimeType === 'string'
    && /^image\/(?:gif|jpeg|png|webp)$/.test(value.mimeType)
}
