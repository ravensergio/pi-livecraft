// Browser TTS: speaks assistant replies with the device's own voices via
// speechSynthesis. Settings persist per device in localStorage, so every PC
// you use keeps its own voice, speed, and volume.
//
// Queue design: each reply is split into sentence chunks; every chunk's
// speak() is scheduled upfront with a timer. The browser plays queued
// speak() calls in order — no end-event is needed to advance the queue.

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

/** Split text into sentence-sized chunks — browsers go silent on single
 * utterances longer than ~15 s, so long replies must be spoken piece by piece. */
function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]+\s+|[^.!?…]+[.!?…]*$/g) ?? [text]
  const chunks: string[] = []
  for (const sentence of sentences) {
    let rest = sentence.trim()
    while (rest.length > 120) {
      const cut = rest.lastIndexOf(' ', 120)
      const end = cut < 60 ? 120 : cut
      chunks.push(rest.slice(0, end))
      rest = rest.slice(end + 1)
    }
    if (rest) chunks.push(rest)
  }
  return chunks.filter(Boolean)
}

function rateFor(rate: number): number {
  return Math.min(2, Math.max(0.7, 1 + rate * 0.06))
}

function makeUtterance(text: string): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text)
  const chosen = settings.voiceName
    ? speechSynthesis.getVoices().find((v) => v.name === settings.voiceName)
    : undefined
  if (chosen) utterance.voice = chosen
  utterance.rate = rateFor(settings.rate)
  utterance.volume = settings.volume / 100
  return utterance
}

const MAX_WAITING = 12 // chunks
const GAP_MS = 0 // chunks queue back to back

/** Estimated speaking time of a chunk at the current rate. */
function estMs(text: string): number {
  return Math.ceil((text.length / (22 * rateFor(settings.rate))) * 1000)
}

let scheduled: { chunk: string; start: number }[] = []
let timers: number[] = []
let scheduleEnd = 0

function clearTimers(): void {
  for (const id of timers) window.clearTimeout(id)
  timers = []
}

function scheduleFrom(items: string[], fromNow: boolean): void {
  const now = Date.now()
  let t = fromNow ? 0 : Math.max(0, scheduleEnd - now)
  for (const chunk of items) {
    scheduled.push({ chunk, start: now + t })
    console.log('[voice] chunk scheduled:', JSON.stringify(chunk), 'in', t, 'ms')
    timers.push(window.setTimeout(() => speechSynthesis.speak(makeUtterance(chunk)), t))
    t += estMs(chunk) + GAP_MS
  }
  scheduleEnd = now + t
}

export function speakReply(text: string): void {
  if (!settings.enabled) return
  const clean = cleanForSpeech(text)
  if (!clean) return
  const chunks = chunkText(clean)
  if (!settings.queue) {
    stopSpeaking()
    chunks.length = Math.min(chunks.length, MAX_WAITING)
    scheduleFrom(chunks, true)
    return
  }
  const overflow = scheduled.length + chunks.length - MAX_WAITING
  if (overflow > 0) {
    clearTimers()
    scheduled = scheduled.slice(overflow)
    scheduleFrom(scheduled.map((s) => s.chunk), true)
  }
  scheduleFrom(chunks, false)
}

/** Skip the item playing now; stops the voice if it was the last. */
export function skipCurrent(): void {
  const now = Date.now()
  clearTimers()
  speechSynthesis.cancel()
  const remaining = scheduled.filter((s) => s.start > now + 300).map((s) => s.chunk)
  scheduled = []
  scheduleEnd = 0
  scheduleFrom(remaining, true)
}

export function stopSpeaking(): void {
  clearTimers()
  scheduled = []
  scheduleEnd = 0
  speechSynthesis.cancel()
}

export function speakSample(): void {
  const utterance = new SpeechSynthesisUtterance('This is the voice in your browser.')
  const chosen = settings.voiceName
    ? speechSynthesis.getVoices().find((v) => v.name === settings.voiceName)
    : undefined
  if (chosen) utterance.voice = chosen
  utterance.rate = rateFor(settings.rate)
  utterance.volume = settings.volume / 100
  speechSynthesis.cancel()
  window.setTimeout(() => speechSynthesis.speak(utterance), 0)
}
