import { memo } from 'react'
import type { SessionSummary } from '../../../../shared/types.ts'
import type { ReasoningMode } from '../conversation/MessageCard.tsx'
import { SessionInfo } from './SessionInfo.tsx'
import { SessionStats } from './SessionStats.tsx'

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
    reasoningMode = 'auto',
    onReasoningModeChange,
  }: {
    session: SessionSummary
    running: boolean
    compacting: boolean
    contextClass: string
    contextTokens: string
    contextPercent: string
    contextPercentValue: number | null
    reasoningMode?: ReasoningMode
    onReasoningModeChange?: () => void
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
      {onReasoningModeChange && (
        <button
          aria-label={`Thinking blocks: ${reasoningMode}. Click to change.`}
          className={`reasoning-mode ${reasoningMode}`}
          onClick={onReasoningModeChange}
          title='Thinking blocks: auto (open while streaming) / expanded / collapsed'
          type='button'
        >
          {reasoningMode === 'auto'
            ? 'thinking · auto'
            : reasoningMode === 'expanded'
            ? 'thinking · open'
            : 'thinking · hidden'}
        </button>
      )}
      <SessionStats
        contextClass={contextClass}
        contextTokens={contextTokens}
        contextPercent={contextPercent}
        contextPercentValue={contextPercentValue}
      />
    </div>
  )
})
