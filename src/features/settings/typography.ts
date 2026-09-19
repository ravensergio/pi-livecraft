/** Typography settings: user-adjustable font sizes and line-heights applied as CSS variables. */

export interface TypographyField {
  id: string
  label: string
  sizeVar: string
  lineHeightVar?: string
  defaultSize: number
  defaultLineHeight?: number
  minSize: number
  maxSize: number
}

/** Every exposed control, in display order. */
export const typographyFields: TypographyField[] = [
  {
    id: 'reply',
    label: 'Reply text',
    sizeVar: '--fs-reply',
    lineHeightVar: '--lh-reply',
    defaultSize: 16,
    defaultLineHeight: 1.4,
    minSize: 10,
    maxSize: 24,
  },
  {
    id: 'user',
    label: 'User bubbles',
    sizeVar: '--fs-user',
    lineHeightVar: '--lh-user',
    defaultSize: 16,
    defaultLineHeight: 1.3,
    minSize: 10,
    maxSize: 24,
  },
  {
    id: 'thinking',
    label: 'Thinking blocks',
    sizeVar: '--fs-thinking',
    lineHeightVar: '--lh-thinking',
    defaultSize: 16,
    defaultLineHeight: 1.2,
    minSize: 10,
    maxSize: 24,
  },
  {
    id: 'teaser',
    label: 'Thinking teaser',
    sizeVar: '--fs-teaser',
    lineHeightVar: '--lh-teaser',
    defaultSize: 14,
    defaultLineHeight: 1.5,
    minSize: 10,
    maxSize: 24,
  },
  {
    id: 'composer',
    label: 'Composer input',
    sizeVar: '--fs-composer',
    lineHeightVar: '--lh-composer',
    defaultSize: 16,
    defaultLineHeight: 1.55,
    minSize: 10,
    maxSize: 24,
  },
  {
    id: 'timestamp',
    label: 'Timestamps',
    sizeVar: '--fs-timestamp',
    defaultSize: 11,
    minSize: 9,
    maxSize: 18,
  },
  {
    id: 'toolOutput',
    label: 'Tool output',
    sizeVar: '--fs-tool-output',
    lineHeightVar: '--lh-tool-output',
    defaultSize: 12,
    defaultLineHeight: 1.6,
    minSize: 9,
    maxSize: 20,
  },
  {
    id: 'status',
    label: 'Status bar values',
    sizeVar: '--fs-status',
    defaultSize: 12,
    minSize: 9,
    maxSize: 18,
  },
]

const STORAGE_KEY = 'pi-livecraft.typography.v1'

export interface TypographySettings {
  [fieldId: string]: { size: number; lineHeight?: number }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Reads persisted typography overrides, clamped to each field's range. */
export function readTypography(): TypographySettings {
  let raw: string | null = null
  try {
    raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return {}
  }
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const result: TypographySettings = {}
  for (const field of typographyFields) {
    const entry = (parsed as Record<string, unknown>)[field.id]
    if (typeof entry !== 'object' || entry === null) continue
    const size = (entry as { size?: unknown }).size
    const lineHeight = (entry as { lineHeight?: unknown }).lineHeight
    if (!isFiniteNumber(size)) continue
    const clamped: { size: number; lineHeight?: number } = {
      size: Math.min(field.maxSize, Math.max(field.minSize, size)),
    }
    if (field.lineHeightVar && isFiniteNumber(lineHeight))
      clamped.lineHeight = Math.min(2.4, Math.max(0.9, lineHeight))
    result[field.id] = clamped
  }
  return result
}

/** Persists typography overrides. */
export function writeTypography(settings: TypographySettings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage unavailable (private mode) — settings stay in memory for the session.
  }
}

/** Applies overrides to :root; omitted fields fall back to their CSS defaults.
 *  Clears every variable first so removed overrides never linger inline. */
export function applyTypography(settings: TypographySettings): void {
  const root = document.documentElement
  for (const field of typographyFields) {
    root.style.removeProperty(field.sizeVar)
    if (field.lineHeightVar) root.style.removeProperty(field.lineHeightVar)
  }
  for (const field of typographyFields) {
    const entry = settings[field.id]
    if (entry?.size !== undefined) root.style.setProperty(field.sizeVar, `${entry.size}px`)
    if (field.lineHeightVar && entry?.lineHeight !== undefined)
      root.style.setProperty(field.lineHeightVar, String(entry.lineHeight))
  }
}

/** Clears all inline overrides so the CSS defaults win again. */
export function resetTypography(): void {
  const root = document.documentElement
  for (const field of typographyFields) {
    root.style.removeProperty(field.sizeVar)
    if (field.lineHeightVar) root.style.removeProperty(field.lineHeightVar)
  }
}
