/** Extension status tones derived from the ANSI colors pi extensions emit. */
export type StatusTone = 'success' | 'warning' | 'danger' | null

type Rgb = [number, number, number]

/** Basic SGR foreground codes (30–37) mapped to canonical RGB values. */
const BASIC_FG: Record<number, Rgb> = {
  30: [0, 0, 0],
  31: [204, 0, 0],
  32: [0, 204, 0],
  33: [204, 204, 0],
  34: [0, 0, 204],
  35: [204, 0, 204],
  36: [0, 204, 204],
  37: [204, 204, 204],
}

/** Nearest-neighbor palette for tone mapping (pi TUI theme-ish values). */
const TONE_PALETTE: Array<{ tone: Exclude<StatusTone, null>; rgb: Rgb }> = [
  { tone: 'danger', rgb: [255, 85, 85] },
  { tone: 'warning', rgb: [255, 187, 0] },
  { tone: 'success', rgb: [85, 255, 85] },
]

/** Distance threshold beyond which a color counts as neutral (no tone). */
const MAX_TONE_DISTANCE = 140

/** Walks SGR escape codes and returns the dominant foreground color by character count. */
export function dominantAnsiColor(raw: string): Rgb | null {
  const counts = new Map<Rgb, number>()
  let active: Rgb | null = null
  let plain = 0
  const pattern = /\u001b\[([0-9;]*)m/g
  let last = 0
  for (const match of raw.matchAll(pattern)) {
    if (match.index! > last) {
      if (active) counts.set(active, (counts.get(active) ?? 0) + (match.index! - last))
      else plain += match.index! - last
    }
    last = match.index! + match[0].length
    const codes = match[1] === '' ? [0] : match[1].split(';').map(Number)
    active = null
    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i]
      if (code === 0 || code === 39) active = null
      else if (code >= 30 && code <= 37) active = BASIC_FG[code]
      else if (code === 38 && codes[i + 1] === 2) {
        active = [codes[i + 2] ?? 0, codes[i + 3] ?? 0, codes[i + 4] ?? 0]
        i += 4
      }
    }
  }
  if (raw.length > last) {
    if (active) counts.set(active, (counts.get(active) ?? 0) + (raw.length - last))
    else plain += raw.length - last
  }
  let best: Rgb | null = null
  let bestCount = 0
  for (const [rgb, count] of counts) {
    if (count > bestCount) {
      best = rgb
      bestCount = count
    }
  }
  // Unstyled text wins over a stray colored fragment.
  return plain >= bestCount ? null : best
}

/** Maps an RGB value to the nearest tone, or null when it matches nothing clearly. */
export function toneForColor(rgb: Rgb): StatusTone {
  let best: StatusTone = null
  let bestDistance = MAX_TONE_DISTANCE
  for (const { tone, rgb: target } of TONE_PALETTE) {
    const distance = Math.sqrt(
      (rgb[0] - target[0]) ** 2 + (rgb[1] - target[1]) ** 2 + (rgb[2] - target[2]) ** 2,
    )
    if (distance < bestDistance) {
      best = tone
      bestDistance = distance
    }
  }
  return best
}

/** Resolves a tone for raw ANSI status text: parsed color first, null when uncolored. */
export function toneFromAnsi(raw: string): StatusTone {
  const rgb = dominantAnsiColor(raw)
  return rgb ? toneForColor(rgb) : null
}
