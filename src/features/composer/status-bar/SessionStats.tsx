/** Displays context window usage with a progress bar. */
export function SessionStats(
  { contextClass, contextTokens, contextPercent, contextPercentValue }: {
    contextClass: string
    contextTokens: string
    contextPercent: string
    contextPercentValue: number | null
  },
) {
  return (
    <div className='composer-stats'>
      <span className={contextClass}>
        <b>Context</b>
        <small>{contextTokens}</small>
        {contextPercentValue !== null && (
          <>
            {contextPercent}
            <progress
              aria-label={`Context usage: ${contextTokens} (${contextPercent})`}
              max={100}
              value={contextPercentValue}
            />
          </>
        )}
      </span>
    </div>
  )
}
