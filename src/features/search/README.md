# Search

In-conversation search opened by the `search` command (default `ctrl+f`, which
hijacks the browser's find bar; reassign it in Settings to hand the key back).
Phase 2 — cross-session search over pi's session files — is planned in `PLANS.md`
and lives nowhere yet.

- `search-messages.ts` is the pure matcher: case-insensitive substring search over
  `{index, text}` entries built from the session's visible message text, in thread
  order, capped at 1000 matches. It reads message data, not the DOM, so folded
  long pastes are searchable.
- `SearchBar.tsx` owns the bar: live count, Enter/Shift+Enter and ↑/↓ cycling,
  Esc closes. Jumping reuses the session-analysis navigation (`data-message-index`
  anchor); the conversation opens message folds as part of navigation. Highlighting
  uses the CSS Custom Highlight API (`::highlight(livecraft-search[-active])` in
  `search.css`) over the mounted DOM only, with a MutationObserver rescan; browsers
  without the API get navigation and the counter, no painting.
- App wiring lives in `App.tsx`: `searchOpen` state, the `search` command case,
  Escape passthrough while the bar is open, and the searchable entries derived
  from `snapshot.messages` via `visibleText`.

Test: `test/search-messages.test.ts` (matcher order, case, offsets, cap).
Not tested: the highlight pass (DOM-only, degrades silently).
