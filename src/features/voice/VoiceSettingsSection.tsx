import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getVoiceSettings,
  setVoiceSettings,
  speakSample,
  stopSpeaking,
  subscribeVoice,
} from './voice.ts'

/** Voice settings section for the Settings panel. Self-contained: state lives
 * in the voice module, persisted per device in localStorage. */
export function VoiceSettingsSection() {
  const settings = useSyncExternalStore(subscribeVoice, getVoiceSettings)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    const update = () => setVoices(speechSynthesis.getVoices())
    update()
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return (
    <section>
      <p>
        Voice plays on this device, through the browser. Settings are saved on this device only.
      </p>
      <label className='voice-row'>
        <input
          checked={settings.enabled}
          onChange={(event) => setVoiceSettings({ ...settings, enabled: event.target.checked })}
          type='checkbox'
        />
        <span>Speak assistant replies in this browser</span>
      </label>
      <label className='voice-row'>
        <span>Voice</span>
        <select
          aria-label='Voice'
          onChange={(event) => setVoiceSettings({ ...settings, voiceName: event.target.value })}
          value={settings.voiceName}
        >
          <option value=''>System default</option>
          {voices.map((voice) => (
            <option key={`${voice.name}|${voice.lang}`} value={voice.name}>
              {voice.name} ({voice.lang}){voice.localService ? '' : ' · network'}
            </option>
          ))}
        </select>
      </label>
      <label className='voice-row'>
        <span>Speed: {settings.rate > 0 ? `+${settings.rate}` : settings.rate}</span>
        <input
          aria-label='Speech speed'
          max={10}
          min={-10}
          onChange={(event) => setVoiceSettings({ ...settings, rate: Number(event.target.value) })}
          type='range'
          value={settings.rate}
        />
      </label>
      <label className='voice-row'>
        <span>Volume: {settings.volume}</span>
        <input
          aria-label='Speech volume'
          max={100}
          min={0}
          onChange={(event) =>
            setVoiceSettings({ ...settings, volume: Number(event.target.value) })}
          type='range'
          value={settings.volume}
        />
      </label>
      <label className='voice-row'>
        <input
          checked={settings.queue}
          onChange={(event) => setVoiceSettings({ ...settings, queue: event.target.checked })}
          type='checkbox'
        />
        <span>Queue mode (replies speak fully, in order)</span>
      </label>
      <div className='voice-row'>
        <button onClick={speakSample} type='button'>Say sample</button>
        <button onClick={stopSpeaking} type='button'>Stop now</button>
      </div>
    </section>
  )
}
