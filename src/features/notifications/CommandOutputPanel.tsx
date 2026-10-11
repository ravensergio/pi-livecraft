/** Shows multi-line command output (setWidget / multi-line notify) above the composer. */
export function CommandOutputPanel({ lines, onDismiss }: {
  lines: string[] | undefined
  onDismiss: () => void
}) {
  if (!lines || lines.length === 0) return null
  return (
    <div aria-label='Command output' className='command-output' role='region'>
      <div className='command-output-header'>
        <span className='command-output-title'>output</span>
        <button
          aria-label='Dismiss command output'
          className='command-output-dismiss'
          onClick={onDismiss}
          type='button'
        >
          ×
        </button>
      </div>
      <pre className='command-output-lines'>{lines.join('\n')}</pre>
    </div>
  )
}
