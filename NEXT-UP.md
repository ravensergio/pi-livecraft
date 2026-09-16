# NEXT UP — Extension status chips: parse extension's own colors (ANSI)

## Context
Extension status chips (pi-telegram-plus etc.) render in the composer status bar.
Current color = keyword heuristic on text (`extensionStatusTone` in
`src/features/composer/status-bar/ComposerStatusBar.tsx`) — can mislead for other
extensions ("pending" → yellow even when neutral, "disconnected" substring bugs).

Goal: read the extension's INTENDED color from the ANSI SGR codes pi already emits
(extensions call `ctx.ui.setStatus(key, theme.fg("error"|...))`), map it to a tone.
~60 lines total. No protocol/server/dependency changes — frontend only.

## Implementation plan

### 1. New utility: `src/features/composer/status-bar/status-tone.ts` (~35 lines)
- `dominantAnsiColor(raw: string): [number, number, number] | null`
  - State machine over the string with regex `/\u001b\[([0-9;]*)m/g`
  - Track active color (truecolor `38;2;r;g;b`, basic fg codes 30–37, reset 0/39)
  - Count characters under each active color → return the dominant one (or null if
    no colored segments)
- `toneForColor(rgb): 'success' | 'warning' | 'danger' | null`
  - Nearest-neighbor (Euclidean) against a small table:
    - danger ≈ reds (#ff5555-ish, ANSI 31), warning ≈ yellows/oranges (ANSI 33),
      success ≈ greens (ANSI 32)
  - Threshold: if distance to nearest > ~140 → null (neutral)

### 2. Data shape change (~20 lines across 3 files)
- App.tsx `extensionStatuses`: `Record<sessionId, Record<key, string>>` →
  `Record<sessionId, Record<key, { text: string; tone: 'success'|'warning'|'danger'|null }>>`
  - In the setStatus handler: parse raw (before stripping) for color, strip ANSI
    for the displayed text, store both
- Composer.tsx prop: `extensionStatuses?: string[]` →
  `Array<{ text: string; tone: ... | null }>`
- ComposerStatusBar.tsx: use `chip.tone` when non-null, else fall back to
  existing `extensionStatusTone(text)` keyword heuristic (uncolored extensions)

### 3. CSS — already done
`.ext-status-chip.success/.warning/.danger` exist in composer.css. No changes.

## Verify
- tsc: `npx tsc -b --noEmit` (root tsconfig is solution-style; plain `tsc --noEmit` checks NOTHING)
- Live test: telegram-plus connected → green chip; disconnected → gray;
  (if possible) trigger its error state → red
- Commit + push to ravensergio/pi-livecraft

## Status
DONE — commit 6973063. Parser verified with 6 test cases (truecolor + basic ANSI,
neutral threshold). Keyword fallback kept for uncolored extensions.
