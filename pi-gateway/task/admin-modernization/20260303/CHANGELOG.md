# Change Log — 2026-03-03

## Delivered

### 1) Mantine-based modernization + dark/light switch
- Migrated admin shell to Mantine AppShell
- Added color scheme persistence and runtime toggle
- Added atomic components (`PageHeader`, `SurfaceCard`, `StatusChip`, `ThemeToggle`)

### 2) Unified admin + web chat
- Added first-class `/chat` route in admin console
- Implemented WS client (`req/res/event`) for gateway protocol
- Implemented session sidebar, history loading, chat send/abort, typing/stream handling
- Added image upload (base64) and preview flow
- Added role switching via WS API

### 3) Backend compatibility fixes
- Added WS method aliases in gateway:
  - `session.listRoles` → `roles.list`
  - `session.setRole` → `roles.set`

### 4) API ergonomics
- Changed admin HTTP client base URL from hardcoded localhost to same-origin `/api`

### 5) Validation
- `admin-console`: `bun run typecheck` ✅
- `admin-console`: `bun run build` ✅
- `pi-gateway`: `bun run check` ✅

## Files touched (major)
- `admin-console/package.json`
- `admin-console/src/main.tsx`
- `admin-console/src/App.tsx`
- `admin-console/src/layout/*`
- `admin-console/src/pages/*` (all main pages + new chat page)
- `admin-console/src/components/*` (atomic + gate components)
- `admin-console/src/lib/api.ts`
- `admin-console/src/lib/ws-client.ts`
- `admin-console/src/hooks/use-gateway-ws.ts`
- `src/ws/ws-methods.ts`

## Known follow-up
- Frontend bundle warning (>500k): split chat markdown/highlight path by lazy loading.

## Final hardening verification pass (direct PM)

### Commands executed
1. `cd admin-console && bun run typecheck && bun run build` → ✅ PASS
2. `cd .. && bun run check` → ✅ PASS
3. `bun test src/ws/tests/unit/ws-session-role-alias.test.ts src/ws/tests/unit/ws-auth-guard.test.ts src/ws/tests/unit/ws-auth-e2e.test.ts` → ✅ PASS (6 passed, 0 failed)

### Code-level smoke verification
- WS role alias wiring confirmed in `src/ws/ws-methods.ts`:
  - `session.listRoles` → `roles.list`
  - `session.setRole` → `roles.set`
- WS auth guard/regression coverage confirmed by targeted tests:
  - `src/ws/tests/unit/ws-session-role-alias.test.ts`
  - `src/ws/tests/unit/ws-auth-guard.test.ts`
  - `src/ws/tests/unit/ws-auth-e2e.test.ts`
- Same-origin `/api` behavior + auth token path confirmed:
  - `admin-console/src/lib/api.ts` uses `baseURL: '/api'`
  - request interceptor injects `Authorization: Bearer <gateway_api_token>`
  - `admin-console/src/hooks/use-gateway-ws.ts` uses same token for WS `connect`

### Minimal polish changes
- Removed unused imports only (production-safe, no behavioral change):
  - `src/ws/ws-methods.ts`
  - `admin-console/src/pages/chat-page.tsx`

### Touched files in this hardening pass
- `src/ws/ws-methods.ts`
- `admin-console/src/pages/chat-page.tsx`
- `task/admin-modernization/20260303/CHANGELOG.md`

## Direct PM follow-up — merged chat full-feature parity

### Scope delivered
- Event parity in merged chat page:
  - Added `media_event` handling (append image/file push to latest assistant message when possible)
  - Added `message_event` handling (assistant text push)
  - Added minimal `extension_ui_request` / `extension_ui_dismissed` prompt UI and WS response path
- Render parity:
  - Restored code block highlighting with lazy-loaded `highlight.js` core + selected languages (chunk-split)
  - Added `<think>...</think>` collapsible rendering via `<details class="thinking-panel">...`
  - Kept legacy-compatible markdown/HTML behavior (`raw html passthrough`, markdown render otherwise)
- Session/runtime behavior:
  - Session list refresh after send/new/delete and key runtime updates
  - Token update propagation to WS path via reconnect hook:
    - settings emits `gateway-token-updated`
    - `use-gateway-ws` listens + refreshes token + reconnects WS

### Commands executed
1. `cd admin-console && bun run typecheck && bun run build` → ✅ PASS
2. `cd .. && bun run check` → ✅ PASS

### Files touched (this follow-up)
- `admin-console/src/pages/chat-page.tsx`
- `admin-console/src/lib/ws-client.ts`
- `admin-console/src/hooks/use-gateway-ws.ts`
- `admin-console/src/pages/settings-page.tsx`
- `admin-console/src/styles.css`
- `task/admin-modernization/20260303/CHANGELOG.md`

## Direct PM follow-up — local auth + static compatibility + WS offline fix

### Scope delivered
- Local access auth ergonomics:
  - localhost / 127.0.0.1 loopback requests can bypass token auth (DX mode)
- Static compatibility for admin shell:
  - Root path compatibility for `/admin-console.config.json`
  - `/favicon.ico` handled as `204 No Content` to remove browser-console noise
- WS offline fix:
  - Local loopback WS upgrade now sets `authenticated=true`
  - WS `connect` handler respects pre-authenticated sockets (skips redundant token requirement)

### Commands executed
1. `cd admin-console && bun run typecheck && bun run build` → ✅ PASS
2. `cd .. && bun scripts/embed-web.ts && bun run check` → ✅ PASS

### Verification evidence
- `GET /admin-console.config.json` → `200 OK`
- `GET /web/admin-console.config.json` → `200 OK`
- `GET /favicon.ico` → `204 No Content`
- WS probe:
  - `connect` request on loopback returns `ok: true`
  - follow-up `sessions.list` returns `ok: true`

### Files touched (local auth/static/ws pass)
- `src/server.ts`
- `src/ws/ws-router.ts`
- `src/api/http-router.ts`
- `src/core/static-server.ts`
- `src/core/auth.ts`
- `admin-console/src/main.tsx`
- `admin-console/index.html`

## Direct PM follow-up — object/json message rendering fix

### Scope delivered
- Fixed chat rendering for non-string payloads to avoid `[object Object]` output.
- Added robust unknown payload normalization in chat page:
  - Supports `text` / `message` / `content` fields across events
  - Object/array payloads are rendered as pretty `json` code blocks
  - JSON-string payloads are auto-detected and prettified
- Applied normalization to:
  - realtime `chat.reply`
  - realtime `message_event`
  - history `chat.history` message content

### Commands executed
1. `cd admin-console && bun run typecheck` → ✅ PASS
2. `cd admin-console && bun run build` → ✅ PASS
3. `cd .. && bun scripts/embed-web.ts && bun run check` → ✅ PASS

### Files touched (object/json render fix)
- `admin-console/src/pages/chat-page.tsx`
- `task/admin-modernization/20260303/CHANGELOG.md`
