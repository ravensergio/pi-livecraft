# Chat File-Path Plan (paths and downloads built; inline images open)

Goal: when a model writes a local file path in chat — e.g.
`E:\z_Working_PI\zz_PiSessions\2026-10-16-kokon-test\cow-tensy.png` —
Livecraft detects it and shows the image. General case: any path the model
pastes, not MCP image results.

Status: Phase A and the `/api/files/raw` download route are built — an absolute
Windows path in chat prose renders as a link the browser saves, so a device on
the LAN or VPN can pull a file that lives on this PC. Inline images remain open.

## What already exists (the foundation)

- `GET /api/files` reads workspace files through the guarded `readWorkspaceFile`.
- `POST /api/files/open` opens a workspace path with the OS default handler
  (`openPath`). "Click a path → Windows opens it" already works today.

## Phase A — clickable paths (BUILT)

`markdown-file-paths.ts` detects drive-letter and UNC paths in Markdown text runs
only (code blocks and inline code stay literal), and relative paths and URLs are
left alone on purpose: too many false positives. The link points at
`GET /api/files/raw?path=…`.

## Phase B — inline images (still open)

1. `/api/files/raw` exists and streams any absolute path as an attachment.
   Inline images need it to answer `?inline=1` (or a second route) without the
   `Content-Disposition` header.
2. Image-extension paths render as `<img>`; click opens full size.
3. Non-image paths keep the download behavior.

## The path rule (decided)

Absolute paths outside the session workspace are accepted, matching
`/api/files/open`. Accepted exposure: anyone who can reach the port can read any
file on this PC. Tolerable while the server stays on loopback plus the VPN; it
must wait for the login in `REMOTE-ACCESS-PLAN.md` before any public exposure.


## Hazards left for inline images

- File deleted after the reply → graceful broken-image fallback.

## Explicitly out of scope

- MCP image content blocks (kokon): dedicated model, not a general path.
- A per-session image gallery: separate idea, separate plan if wanted.
