# Mobile Layout Plan

Goal: Livecraft is usable on a phone (390–430px wide): readable, tappable,
keyboard-friendly. Access is already solved — `dev:frontend` runs
`vite --host 0.0.0.0`, so any device on the home LAN or the OpenVPN tunnel
opens `http://192.168.0.9:5173`. No backend/firewall work.

## Already in place (no work)

- viewport meta; breakpoints at 1200/900/480px in `src/styles/responsive.css`
  (stacked layout: top bar, horizontal session strip, workspace, right sidebar
  capped at `34dvh`)
- `hover: none` action variants; reduced-motion rules
- mobile perf: tail-bound live/history matching (`9664084`)
- `.app-shell` is `height: 100dvh; overflow: hidden` — the document never
  scrolls, inner columns do (keeps keyboard math simple)

## Phase 1 — CSS basics (no JS)

1. `index.html`: viewport meta gains `viewport-fit=cover` (enables safe-area insets).
2. iOS auto-zoom: `@media (pointer: coarse)` → all `input, textarea, select`
   get `font-size: 16px` (composer textarea is 15px today; iOS zooms the page
   on focus of any input under 16px).
3. Touch targets: `@media (hover: none)` → interactive elements reach ~40px
   (rail tabs, session items, conversation actions, composer tools are 29–34px
   today).
4. Safe areas: top bar (≤900px stacked layout) gets `env(safe-area-inset-top)`,
   composer gets `env(safe-area-inset-bottom)` (notch / home bar).
5. `100vh` → `100dvh` where overlays are sized to the viewport
   (`index.css`, `settings.css` ×2).
6. Dialogs ≤480px: safe-area padding on `.modal-backdrop` /
   `.ask-user-question-backdrop` (widths are already responsive via
   `min(560px, 100%)` — not touched).

## Phase 2 — Mobile keyboard (JS, ~15 lines)

- `src/keyboard-inset.ts`: pure `keyboardInset(layoutHeight, offsetTop, height)`
  + a `trackKeyboardInset()` that listens to `visualViewport` resize/scroll and
  sets `--kb` (px) on `:root`. Hooked in `main.tsx`.
  - Formula: `max(0, documentElement.clientHeight - (vv.offsetTop + vv.height))`
    — valid because `.app-shell` pins the document height to `100dvh`.
- CSS: fixed backdrops stop under the keyboard:
  `.modal-backdrop, .ask-user-question-backdrop { inset: 0 0 var(--kb, 0px) }`
  and dialog `max-height`s cap against `100dvh - var(--kb)`.
- The composer needs NO keyboard code: it is in normal flow at the bottom of
  the workspace column, and the browser scrolls the focused textarea above the
  keyboard (standard chat-app behavior).

## Phase 3 — 390px overflow audit

- Headless browser screenshots at 390×844: conversation with tool cards,
  settings, git, session analysis.
- Fix whatever overflows (wrap / scroll / stack).

## Phase 4 — Real-device verification

- Open `http://192.168.0.9:5173` on the phone; iterate on whatever hurts.

## Verification

- `npx tsc -b --noEmit`
- `node --test test/keyboard-inset.test.ts` (pure function) + full suite
- headless screenshots before/after Phase 1–2
