# Remote Access Plan — Livecraft behind nginx Proxy Manager

Goal: reach Livecraft from any machine (e.g. work PC) via `livecraft.<domain>`,
same model as the existing Unsloth Studio setup: one shared password, persistent
login, HTTPS via Cloudflare origin cert, proxied by PM on the second LAN PC.

## Architecture

```
browser → https://livecraft.<domain> (Cloudflare, origin cert)
        → nginx Proxy Manager (other LAN PC)  [WebSockets ON]
        → http://<this-pc-lan-ip>:43121 (prod backend, serves dist/ + API + WS)
```

Decisions already made:
- No Tailscale (work PC restriction). Public domain exposure is accepted —
  same threat model as the existing Studio setup.
- HTTPS terminated at Cloudflare/nginx → cookie can use `Secure`.
- PM is on ANOTHER local PC → backend must bind beyond loopback.
- External access uses PRODUCTION mode (`npm start`), never the Vite dev server.

## Work items

### 1. Configurable bind host (backend)
- `server/backend.ts`: `const host = '127.0.0.1'` → read env
  `PI_LIVECRAFT_HOST`, default `127.0.0.1`.
- Set `0.0.0.0` in the prod start script (optionally the LAN IP only).
- Windows Firewall: inbound rule for TCP 43121, **private profiles only**.
- Give this PC a static IP / DHCP reservation (proxy target must not drift).

### 2. Login: password + TOTP (single user)
The real gate is the TOTP code (user already runs Authy/Bitwarden) — so the
password can be a normal memorable one, no 20-char random strings.
Backend (`server/backend.ts` + one new module `server/auth.ts`):
- Password stored as scrypt hash in env `PI_LIVECRAFT_PASSWORD_HASH`
  (helper script to generate: `node scripts/hash-password.mjs`).
- TOTP secret in env `PI_LIVECRAFT_TOTP_SECRET` (base32); one-time setup
  screen shows a QR code to scan into Authy/Bitwarden.
- Login endpoint `POST /api/auth/login { password, totp }`:
  - verify password (scrypt) → verify TOTP code (±1 window tolerance for
    clock drift) → create random 256-bit session token, keep in an in-memory
    map (token → expiry), set cookie:
    `livecraft_session=<token>; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
    (30 days = "persists" across browser restarts).
- Middleware on ALL routes except `/api/auth/login` and static files:
  - valid cookie token → pass, else `401`.
- WebSocket `upgrade` event: same check before accepting.
- Logout endpoint clears token + cookie (nice-to-have, for the UI later).

Rate limiting (login only):
- Key on **`CF-Connecting-IP`** header (behind Cloudflare nginx sees CF edge
  IPs, not visitors), fallback to socket address.
- ~5 attempts / minute / IP → `429`.

### 3. Frontend login screen
- On any `401` from the API/WS: render a full-screen login form
  (replaces app content; keep it on-theme with current design tokens).
- Two fields: password + 6-digit TOTP code.
- Submit → `POST /api/auth/login` → success: reload into app.
- One clear error on failure (no hints about which factor failed).

### 4. Hidden prod start/stop scripts
Beside the existing dev pair:
- `start-livecraft-prod-hidden.vbs` → `npm start` (vite build + backend on
  43121), hidden window, `PI_LIVECRAFT_HOST=0.0.0.0`.
- `stop-livecraft-prod.bat` → kill by port 43121 (dev stop keeps 5173).
- Dev pair stays as-is for customization sessions.

### 5. Proxy Manager recipe (manual, on the PM PC)
- New proxy host: `livecraft.<domain>` → `http://<lan-ip>:43121`
- **WebSockets: ON** (Livecraft streams everything over WS — #1 missed step)
- SSL: Let's Encrypt or CF origin setup, as used for the other hosts
- If PM runs in Docker: target `host.docker.internal` only if PM were local —
  it is NOT, so use the plain LAN IP.

## Security notes (accepted model, kept tight)
- Normal memorable password + TOTP code from user's existing authenticator
  (Authy/Bitwarden) — the code is the real gate; it exists only on their phone
  and rotates every 30s.
- Login rate limit keyed on CF-Connecting-IP.
- Firewall rule private-only; port reachable from LAN, not internet directly.
- Remember: the password gates an agent that runs bash as this PC's user —
  same exposure class as the existing Studio setup, no worse.

## Out of scope (for now)
- Per-user accounts / audit log
- Tailscale/VPN
- Auto-restart service (NSSM/Task Scheduler) — hidden VBS is enough for now
