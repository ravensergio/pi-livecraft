// Browser TTS: speaks assistant replies with the device's own voices via
// speechSynthesis. Settings persist per device in localStorage, so every PC
// you use keeps its own voice, speed, and volume.

const LS_KEY = 'pi-livecraft.voice'

export interface VoiceSettings {
  enabled: boolean
  voiceName: string
  rate: number // -10..10, 0 = normal (SAPI-style scale)
  volume: number // 0..100
  queue: boolean // true = replies speak fully in order; false = newest cuts in
}

const defaults: VoiceSettings = {
  enabled: false,
  voiceName: '',
  rate: 0,
  volume: 100,
  queue: true,
}

function load(): VoiceSettings {
  try {
    return { ...defaults, ...JSON.parse(window.localStorage.getItem(LS_KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

let settings = load()
let waiting: string[] = []
let speakingNow = false
let token = 0 // guards onend/onerror of cancelled utterances
let keepAlive: number | undefined
const listeners = new Set<() => void>()

export function getVoiceSettings(): VoiceSettings {
  return settings
}

export function subscribeVoice(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setVoiceSettings(next: VoiceSettings): void {
  settings = { ...next }
  window.localStorage.setItem(LS_KEY, JSON.stringify(settings))
  if (!settings.enabled) stopSpeaking()
  for (const listener of listeners) listener()
}

/** Strip markdown so TTS does not read symbols aloud. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> label
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s*[-*+]\s+/gm, '') // bullet markers
    .replace(/<[^>]+>/g, ' ') // html tags
    .replace(/\|/g, ', ') // table pipes
    .replace(/\*{1,3}/g, '') // bold/italic markers
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function rateFor(rate: number): number {
  return Math.min(2, Math.max(0.4, 1 + rate * 0.06))
}

function applyVoice(utterance: SpeechSynthesisUtterance, s: VoiceSettings): void {
  const chosen = s.voiceName
    ? speechSynthesis.getVoices().find((v) => v.name === s.voiceName)
    : undefined
  if (chosen) utterance.voice = chosen
  utterance.rate = rateFor(s.rate)
  utterance.volume = s.volume / 100
}

const MAX_WAITING = 12 // chunks, not replies

/** Split text into sentence-sized chunks — Chromium browsers go silent on
 * single utterances longer than ~15 s, so long replies must be spoken piece by piece. */
function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]+\s+|[^.!?…]+$/g) ?? [text]
  const chunks: string[] = []
  for (const sentence of sentences) {
    let rest = sentence.trim()
    while (rest.length > 200) {
      const cut = rest.lastIndexOf(' ', 200)
      chunks.push(rest.slice(0, cut < 60 ? 200 : cut))
      rest = rest.slice(cut + 1)
    }
    if (rest) chunks.push(rest)
  }
  return chunks.filter(Boolean)
}

function pump(): void {
  if (speakingNow) return
  const text = waiting.shift()
  if (!text) return
  const current = ++token
  const utterance = new SpeechSynthesisUtterance(text)
  applyVoice(utterance, settings)
  speakingNow = true
  utterance.onend = () => {
    if (current !== token) return
    speakingNow = false
    pump()
  }
  utterance.onerror = () => {
    if (current !== token) return
    speakingNow = false
    pump()
  }
  speechSynthesis.speak(utterance)
  // Chrome pauses long utterances after ~15 s — keep it alive.
  window.clearInterval(keepAlive)
  keepAlive = window.setInterval(() => {
    if (speechSynthesis.speaking) {
      speechSynthesis.pause()
      speechSynthesis.resume()
    }
  }, 10000)
}

export function speakReply(text: string): void {
  if (!settings.enabled) return
  const clean = cleanForSpeech(text)
  if (!clean) return
  const chunks = chunkText(clean)
  if (settings.queue) {
    while (waiting.length + chunks.length > MAX_WAITING) waiting.shift()
  } else {
    stopSpeaking()
    chunks.length = Math.min(chunks.length, MAX_WAITING)
  }
  waiting.push(...chunks)
  pump()
}

/** Skip the item playing now; stops the voice if it was the last. */
export function skipCurrent(): void {
  token++
  speakingNow = false
  window.clearInterval(keepAlive)
  speechSynthesis.cancel()
  pump()
}

export function stopSpeaking(): void {
  token++
  waiting = []
  speakingNow = false
  window.clearInterval(keepAlive)
  speechSynthesis.cancel()
}

export function speakSample(): void {
  const utterance = new SpeechSynthesisUtterance('This is the voice in your browser.')
  applyVoice(utterance, settings)
  speechSynthesis.cancel()
  speechSynthesis.speak(utterance)
}
