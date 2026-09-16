import { memo } from 'react'
import type { SessionSummary } from '../../../../shared/types.ts'
import { SessionInfo } from './SessionInfo.tsx'
import { SessionStats } from './SessionStats.tsx'
import type { StatusTone } from './status-tone.ts'

/** Maps an extension status text to a tone class (telegram-plus colors its states). */
function extensionStatusTone(text: string): string {
  if (/error|fail/i.test(text)) return 'ext-status-chip danger'
  if (/awaiting|pending/i.test(text)) return 'ext-status-chip warning'
  // Negatives first: "disconnected" contains "connected" as a substring.
  if (/disconnect|not configured|offline/i.test(text)) return 'ext-status-chip'
  if (/\b(connected|active|paired)/i.test(text)) return 'ext-status-chip success'
  return 'ext-status-chip' // unknown → muted
}

/** Status bar shown below the composer: session name, directory, cost, and context usage. */
export const ComposerStatusBar = memo(function ComposerStatusBar(
  {
    session,
    running,
    compacting,
    contextClass,
    contextTokens,
    contextPercent,
    contextPercentValue,
    extensionStatuses = [],
  }: {
    session: SessionSummary
    running: boolean
    compacting: boolean
    contextClass: string
    contextTokens: string
    contextPercent: string
    contextPercentValue: number | null
    extensionStatuses?: Array<{ text: string; tone: StatusTone }>
  },
) {
  return (
    <div className='composer-info' aria-label='Session information'>
      {compacting
        ? (
          <div aria-label='Compaction in progress' className='composer-compacting' role='status'>
            <span aria-hidden='true' className='composer-compacting-spinner' /> Compaction en cours…
          </div>
        )
        : <SessionInfo name={session.name} cwd={session.cwd} active={running} />}
      {extensionStatuses.map(({ text, tone }, index) => (
        <span
          className={tone ? `ext-status-chip ${tone}` : extensionStatusTone(text)}
          key={`${index}-${text}`}
          title={text}
        >
          {text}
        </span>
      ))}
      <SessionStats
        contextClass={contextClass}
        contextTokens={contextTokens}
        contextPercent={contextPercent}
        contextPercentValue={contextPercentValue}
      />
    </div>
  )
})
