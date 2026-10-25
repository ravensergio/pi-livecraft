import { memo, useState, type ReactNode } from 'react'
import type { JsonObject } from '../../../shared/types.ts'
import { isObject } from '../../../shared/is-object.ts'
import { CopyButton } from './CopyButton.tsx'
import { ForkButton } from './ForkButton.tsx'
import { TreeButton } from './TreeButton.tsx'
import { Markdown } from './Markdown.tsx'
import {
  formatMessageStamp,
  hasVisibleContent,
  reasoningTextForDisplay,
} from './message-display.ts'
import { formatSpeed, formatTokens, formatTurnCost, type MessageUsage } from './message-usage.ts'

/** How thinking blocks present themselves for the session. */
export type ReasoningMode = 'auto' | 'expanded' | 'collapsed'

/** Renders a visible protocol message with the default or custom presentation. */
export const MessageCard = memo(
  function MessageCard(
    {
      isLast = false,
      live = false,
      message,
      onError,
      onFork,
      onTree,
      reasoningMode = 'auto',
      openSince = 0,
    }: {
      isLast?: boolean
      openSince?: number
      live?: boolean
      message: JsonObject
      onError: (cause: unknown) => void
      onFork: (entryId: string) => Promise<boolean>
      onTree: (entryId: string) => Promise<boolean>
      reasoningMode?: ReasoningMode
    },
  ) {
    if (message.role === 'custom' && typeof message.customType === 'string')
      return <DefaultCustomMessage message={message} />
    return (
      <DefaultMessageCard
        isLast={isLast}
        live={live}
        message={message}
        onError={onError}
        onFork={onFork}
        onTree={onTree}
        reasoningMode={reasoningMode}
        openSince={openSince}
      />
    )
  },
)

const DefaultMessageCard = memo(
  function DefaultMessageCard(
    { isLast = false, live, message, onError, onFork, onTree, reasoningMode, openSince = 0 }: {
      isLast?: boolean
      live: boolean
      message: JsonObject
      onError: (cause: unknown) => void
      onFork: (entryId: string) => Promise<boolean>
      onTree: (entryId: string) => Promise<boolean>
      reasoningMode: ReasoningMode
      openSince?: number
    },
  ) {
    const role = String(message.role)
    const timestamp = typeof message.timestamp === 'number' ? new Date(message.timestamp) : null
    const time = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null
    const text = visibleText(message.content ?? message.output)
    const forkEntryId = role === 'user' && typeof message.forkEntryId === 'string'
      ? message.forkEntryId
      : undefined
    const entryId = typeof message.entryId === 'string' ? message.entryId : undefined
    // Branch button: user bubbles and final assistant replies (no tool calls).
    // Open mode: every turn that started after OPEN was hit stays open (timestamp rule).
    const lastTurn = openSince > 0
      && typeof message.timestamp === 'number'
      && message.timestamp >= openSince
    const hasToolCalls = Array.isArray(message.content)
      && message.content.some((part) => isObject(part) && part.type === 'toolCall')
    const showTreeButton = entryId !== undefined
      && !live
      && !isLast
      && (role === 'user' || (role === 'assistant' && !hasToolCalls))
    return (
      <article className={`message ${role}`}>
        {(text || forkEntryId || showTreeButton) && (
          <div className='conversation-actions message-actions'>
            {forkEntryId && <ForkButton entryId={forkEntryId} onError={onError} onFork={onFork} />}
            {showTreeButton && entryId && (
              <TreeButton entryId={entryId} onError={onError} onTree={onTree} />
            )}
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
            isLast,
            lastTurn,
          )}
        </div>
        {role === 'user' && time && (
          <time
            className='message-time'
            dateTime={time.toISOString()}
          >
            {formatMessageStamp(time)}
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
  { durationMs, extensionTps, turnNumber, usage }: {
    durationMs?: number
    extensionTps?: number
    turnNumber?: number
    usage: MessageUsage
  },
) {
  // Prefer the pi-token-speed extension's sliding-window measurement when present;
  // fall back to the turn's own output/duration calculation.
  const speed = extensionTps
    ?? (durationMs && durationMs > 0 ? usage.output / (durationMs / 1000) : null)
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
  isLast = false,
  lastTurn = false,
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
              currentTurn={live}
              lastTurn={isLast || lastTurn}
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
 *  open keeps a turn's blocks open from the moment it is hit (older turns stay closed);
 *  closed hides every one; a manual toggle wins over the mode. */
function ReasoningBlock(
  {
    children,
    copyablePre,
    currentTurn = false,
    lastTurn = false,
    live = false,
    mode = 'auto',
    onError,
  }: {
    children: string
    copyablePre: boolean
    live?: boolean
    currentTurn?: boolean
    lastTurn?: boolean
    mode?: ReasoningMode
    onError?: (cause: unknown) => void
  },
) {
  // Open/closed is computed from the props at render time: no mount seeding, no effects.
  // Open mode keeps the current and the last turn's blocks open (older turns stay
  // closed); auto follows the stream (open only while the segment is the last part);
  // closed hides all. Every block of a turn shares the message-level flags
  // (currentTurn / lastTurn), so blocks of one turn can never disagree.
  const [touched, setTouched] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const teaser = useTypewriterText(children)

  const open = touched
    ? userOpen
    : mode === 'expanded'
    ? currentTurn || lastTurn
    : mode === 'auto'
    ? live
    : false

  return (
    <div className={`reasoning-block${open ? ' open' : ''}`}>
      <button
        aria-expanded={open}
        className='reasoning-toggle'
        onClick={() => {
          setTouched(true)
          setUserOpen(!open)
        }}
        type='button'
      >
        <svg aria-hidden='true' className='reasoning-chevron' viewBox='0 0 16 16'>
          <path d='m5.5 3.5 5 4.5-5 4.5' />
        </svg>
        <span className='reasoning-label'>Thinking</span>
        {!open && <span className='reasoning-teaser'>{teaser}</span>}
      </button>
      {open && (
        <div className='reasoning'>
          <Markdown copyablePre={copyablePre} onError={onError}>{children}</Markdown>
        </div>
      )}
    </div>
  )
}

// Sized to fit two visual lines in the 762px conversation column at 14px.
// The teaser always shows the END of the thinking, clipped at a word boundary.
const TEASER_MAX_CHARS = 190

/** Tail teaser for collapsed thinking: last ~190 characters, cut at the first word
 *  boundary so it never starts mid-word. */
function reasoningTeaser(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (trimmed.length <= TEASER_MAX_CHARS) return trimmed
  const slice = trimmed.slice(-TEASER_MAX_CHARS)
  const space = slice.indexOf(' ')
  const tail = space > 0 ? slice.slice(space + 1) : slice
  return `…${tail.trim()}`
}

/** Typewriter disabled for testing — the teaser tracks the stream with no delay. */
function useTypewriterText(text: string): string {
  return reasoningTeaser(text)
}

function isImageContent(value: unknown): value is JsonObject & { data: string; mimeType: string } {
  return isObject(value) && value.type === 'image' && typeof value.data === 'string' && typeof value
        .mimeType === 'string'
    && /^image\/(?:gif|jpeg|png|webp)$/.test(value.mimeType)
}
