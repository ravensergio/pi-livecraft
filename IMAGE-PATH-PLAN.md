# Chat Image-Path Plan (idea locked, not started)

Goal: when a model writes a local file path in chat — e.g.
`E:\z_Working_PI\zz_PiSessions\2026-10-16-kokon-test\cow-tensy.png` —
Livecraft detects it and shows the image. General case: any path the model
pastes, not MCP image results.

Status: brainstorm done, no code, no decision. Revisit later.

## What already exists (the foundation)

- `GET /api/files` reads workspace files through the guarded `readWorkspaceFile`.
- `POST /api/files/open` opens a workspace path with the OS default handler
  (`openPath`). "Click a path → Windows opens it" already works today.

## Phase A — clickable paths (cheap, do first if ever built)

1. Detect path-like tokens in rendered chat text (`Markdown.tsx`):
   Windows (`E:\...`), WSL (`/e/...`), `file://` — any file extension.
   Scan text nodes only; never code blocks or inline code (samples stay text).
2. Detected path renders with a small "open" action → existing
   `/api/files/open`. No new backend route. Works for every file type.

## Phase B — inline images (only if A proves the want)

1. New route `/api/files/raw`: reuses the `readWorkspaceFile` guard, streams
   bytes with the right `Content-Type`.
2. Image-extension paths render as `<img>`; click opens full size.
3. Non-image paths keep Phase A behavior.

## The open decision (answer before building)

- Absolute paths (`E:\...`) are outside the session cwd. The guard must accept
  either a small root allowlist (the working folders) or cwd only.
  This is a privacy/security decision, not a code problem.

## Hazards to handle

- File deleted after the reply → graceful broken-image fallback.
- False positives: paths in code samples, docs, tables.
- Paths split across lines must not half-match.

## Explicitly out of scope

- MCP image content blocks (kokon): dedicated model, not a general path.
- A per-session image gallery: separate idea, separate plan if wanted.
