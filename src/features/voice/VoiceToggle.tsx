import { useSyncExternalStore } from 'react'
import { getVoiceSettings, setVoiceSettings, skipCurrent, subscribeVoice } from './voice.ts'

/** Voice on/off button for the composer toolbar, plus a skip button when on. */
export function VoiceToggle() {
  const settings = useSyncExternalStore(subscribeVoice, getVoiceSettings)
  return (
    <>
      <button
        aria-label={`Speak replies: ${settings.enabled ? 'on' : 'off'}. Click to change.`}
        className={settings.enabled ? 'composer-select voice on' : 'composer-select voice'}
        onClick={() => setVoiceSettings({ ...settings, enabled: !settings.enabled })}
        title='Speak assistant replies in this browser (voices and volume come from this device)'
        type='button'
      >
        {settings.enabled ? 'voice · on' : 'voice · off'}
      </button>
      {settings.enabled && (
        <button
          aria-label='Skip the reply playing now'
          className='composer-select voice'
          onClick={skipCurrent}
          title='Skip the reply playing now (stops the voice if it was the last)'
          type='button'
        >
          skip
        </button>
      )}
    </>
  )
}
