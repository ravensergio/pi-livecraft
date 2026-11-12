# Open plans — Livecraft fork

Unfinished work and parked ideas only. Finished features live in the code and in `src/features/*/README.md`; the git log holds the rest.

## Chat file paths — download built, inline images open

Current rule (`src/features/conversation/markdown-file-paths.ts`, commit `2948c64`): a path becomes a download link when it is a whole code span, the only content of a code block, wrapped in quote marks, or an absolute path that a space does not cut short. A path with spaces inside a sentence stays plain text — deliberate, not a bug.

Still open:

1. `/api/files/raw` answers `?inline=1` (or a second route) without `Content-Disposition`.
2. Image-extension paths render as `<img>`; click opens full size.
3. File deleted after the reply → graceful broken-image fallback.
4. Non-image paths keep the download behaviour.

**Security decision that must stay true:** absolute paths outside the session workspace are readable by anyone who can reach the port — same exposure as `/api/files/open`. Acceptable only while the backend binds to loopback plus the VPN. It must not go public before the login below.

## Remote access behind nginx Proxy Manager — not started

- `server/backend.ts:64` still hardcodes `const host = '127.0.0.1'`. Needs an env-configurable bind host, and external use must run production mode (`npm start`), never the Vite dev server.
- Login does not exist yet: one user, password as an scrypt hash in `PI_LIVECRAFT_PASSWORD_HASH`, TOTP secret in `PI_LIVECRAFT_TOTP_SECRET`, `POST /api/auth/login`, and the same check on every route plus the WebSocket `upgrade`.
- Windows Firewall inbound rule for TCP 43121, private profiles only. Static IP or DHCP reservation — the proxy target must not drift.

## Streaming render — idea only, not started

While a message streams, every delta re-parses the whole message as markdown. Idea: a pure splitter (`segment-stream.ts` + unit tests, fences and tables included) feeding finished segments to memoized `<Markdown>` with one live tail. Accept only if output is pixel-identical to today and a long code-heavy reply streams without dropped frames.

## Cross-session search (search Phase 2) — not started

Phase 1 (in-session Ctrl+F) shipped in `src/features/search/`. Phase 2: a "which chat said X?" search over pi's own session files — a `GET /api/search?q=` in the backend scanning the session directory already read by `server/pi-session-store.ts` (jsonl text, capped scan, no index, no database), results as session + snippet, click opens the session. The UI hangs off the search bar: a "all sessions" toggle.


## Finished — removed from this file, findable in git

- Mobile layout, verified on Raven's phone 2026-10-17 → `src/styles/responsive.css`.
- Select reply text → quote it into the composer, 2026-10-17 → `src/features/conversation/SelectionQuote.tsx`.
