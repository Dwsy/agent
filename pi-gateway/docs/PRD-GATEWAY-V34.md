# PRD: pi-gateway v3.4 — Production Hardening + Deep Refactor

**Status:** Draft
**Author:** NiceViper (DarkFalcon), reviewed by pi-zero (PM)
**Date:** 2026-02-12
**Baseline:** v3.3 (366/366 pass, send_media direct delivery + 3-layer prompts + server.ts P0/P1 modularization)

---

## 1. Overview

v3.4 focuses on two themes:

1. **Production Hardening** — Validate send_media in real Telegram deployment, add auth fail-closed security, and extend the tool-based approach to `send_message`
2. **Deep Refactor** — Complete server.ts modularization (P2 message-pipeline + plugin-api-factory, P3 cleanup), targeting <500 lines

## 2. Target Users

Technical solo devs and 2-5 person teams running pi-gateway for Telegram/Discord/WebChat agent workflows.

## 3. Scope

### P0 — Must Ship

| ID | Feature | Owner | Status |
|---|---|---|---|
| V1 | send_media end-to-end Telegram validation (115.191.43.169) | Dwsy + NiceViper | Pending |
| R1 | P2: message-pipeline extraction (~340 lines) | TBD | Not Started |
| R2 | P2: plugin-api-factory extraction (~200 lines) | TBD | Not Started |
| S1 | Auth fail-closed (default deny, explicit allowlist) | TBD | Not Started |

### P1 — Should Ship

| ID | Feature | Owner | Status |
|---|---|---|---|
| T1 | `send_message` tool (text/react/reply/thread) | TBD | Not Started |
| R3 | P3: server.ts final cleanup (<500 lines) | TBD | Not Started |

### P2 — Can Ship

| ID | Feature | Owner | Status |
|---|---|---|---|
| S2 | SSRF guard (outbound URL validation) | TBD | Not Started |
| S3 | Exec allowlist (tool command restrictions) | TBD | Not Started |
| E1 | Session reset adaptation | TBD | Not Started |

### Deferred

| Feature | Reason |
|---|---|
| TTS outbound | Provider selection + voice model evaluation needed |
| WEBP sticker understanding | Vision provider wiring — separate feature track |
| `MEDIA:` directive deprecation | Keep as fallback through v3.x; deprecate in v4.0 |
| E3 Markdown adaptation | Prompt-guided approach preferred over hardcoded conversion |

## 4. Architecture

### 4.1 send_media Direct Delivery (V1 — validation of v3.3 architecture)

v3.3 established the direct delivery data flow:

```
Agent calls send_media tool
  → extension POST /api/media/send (internalToken)
    → validateMediaPath + type inference
      → sessions.get(sessionKey).lastChatId → chatId
        → registry.channels.get(channel).outbound.sendMedia(chatId, path, opts)
          → Telegram: bot.api.sendPhoto → messageId
            → tool result: {ok: true, delivered: true, messageId}
```

V1 validates this end-to-end on the production Telegram bot at 115.191.43.169.

**Validation checklist:**
- [ ] Agent generates an image → calls send_media → photo appears in Telegram chat
- [ ] Agent sends a PDF → send_media → document delivered with caption
- [ ] Invalid path → tool returns error, no crash
- [ ] Session without prior messages → graceful "no chatId" error
- [ ] Fallback: channel without sendMedia → directive returned, legacy parsing works

### 4.2 P2 Message Pipeline Extraction (R1)

Extract `processMessage` and its helpers from server.ts into `src/gateway/message-pipeline.ts`.

**Current state:** `processMessage` is ~340 lines with 13 `ctx` field dependencies:
- config, pool, sessions, queue, registry, transcripts, metrics, log
- extensionUI, systemEvents, dedup, delegateExecutor, wsClients

**Extraction strategy:**
```typescript
// src/gateway/message-pipeline.ts
export async function processMessage(
  msg: InboundMessage,
  ctx: GatewayContext,
  queueItem?: PrioritizedWork,
): Promise<void> { ... }
```

**Key risk:** `processMessage` calls `compactSessionWithHooks`, `buildSessionProfile`, and accesses `this.pool.acquire/release` — all must be available via `ctx`.

**Dependencies to resolve:**
1. `compactSessionWithHooks` → already on GatewayContext
2. `buildSessionProfile` → already on GatewayContext
3. `dispatch` → already on GatewayContext (for heartbeat wake)
4. RPC event wiring (onEvent, onThinkingDelta, etc.) — must be passed as callbacks or kept inline

### 4.3 P2 Plugin API Factory Extraction (R2)

Extract `createPluginApi` from server.ts into `src/plugins/plugin-api-factory.ts`.

**Current state:** ~200 lines, constructs the `GatewayPluginApi` object passed to plugins during init.

**Extraction:**
```typescript
// src/plugins/plugin-api-factory.ts
export function createPluginApi(
  pluginId: string,
  ctx: GatewayContext,
): GatewayPluginApi { ... }
```

**Dependency:** Consumes nearly every ctx field. GatewayContext may need 6 additional fields:
- `broadcastToWs`, `buildSessionProfile`, `dispatch`, `compactSessionWithHooks`
- `listAvailableRoles`, `setSessionRole`

Most are already on GatewayContext from P1 work.

### 4.4 Auth Fail-Closed (S1)

**Current gap:** `auth.mode: "none"` is the default — gateway accepts all requests without authentication.

**Target behavior:**
- Default: `auth.mode: "token"` with a generated token shown at startup
- `auth.mode: "none"` requires explicit `auth.allowUnauthenticated: true` confirmation
- All HTTP endpoints (except `/health` and webhook paths) require auth header
- WS connections require auth in the initial handshake
- Channel plugins (Telegram/Discord) bypass HTTP auth (they have their own auth)

**Config:**
```jsonc
{
  "gateway": {
    "auth": {
      "mode": "token",           // "none" | "token" | "bearer"
      "token": "auto",           // "auto" = generate at startup, or explicit value
      "allowUnauthenticated": false  // must be true to use mode:"none"
    }
  }
}
```

### 4.5 send_message Tool (T1)

Extend the tool-based approach to text messaging:

```typescript
send_message({ text: "Hello!", sessionKey?: "..." })
send_message({ text: "👍", react: true, messageId: "123" })
send_message({ text: "Reply text", replyTo: "456" })
send_message({ text: "Thread msg", threadId: "789" })
```

**Architecture:** Same pattern as send_media — extension → `/api/message/send` → channel plugin.

**ChannelPlugin extension:**
```typescript
outbound: {
  sendText(target, text, opts?): Promise<void>;           // existing
  sendMedia?(target, path, opts?): Promise<MediaSendResult>;  // v3.3
  sendReaction?(target, messageId, emoji): Promise<void>;      // v3.4
  replyTo?(target, messageId, text, opts?): Promise<MessageSendResult>;  // v3.4
}
```

### 4.6 P3 Server.ts Cleanup (R3)

After P2, server.ts should contain only:
- Class constructor + field declarations
- `startServer()` / `stopServer()` lifecycle
- HTTP route dispatch table (delegating to modules)
- WS frame dispatch table (delegating to modules)
- `ctx` getter

**Target: <500 lines.** Current: 1783 after P1.

Remaining extraction candidates after P2:
- `handleApiChat` / `handleApiChatStream` → `src/api/chat-api.ts`
- `handleApiSend` → `src/api/send-api.ts`
- WS frame handler → `src/gateway/ws-handler.ts`
- Plugin init/load sequence → `src/plugins/plugin-loader.ts` (partially done)

## 5. Design References

| Doc | Path |
|---|---|
| v3.3 PRD | `docs/PRD-GATEWAY-V33.md` |
| Server Refactor Spec | `docs/SERVER-REFACTOR-SPEC.md` |
| System Prompt Architecture | `docs/SYSTEM-PROMPT-ARCHITECTURE.md` |
| Security Architecture | `docs/architecture/SECURITY.md` |
| Core Modules | `docs/CORE-MODULES.md` |

## 6. Acceptance Criteria

### AC-1: Production Validation (V1)
- [ ] send_media delivers photo/document/audio to Telegram chat on 115.191.43.169
- [ ] Tool result contains `delivered: true` + `messageId`
- [ ] Error cases handled gracefully (no crash, clear error message)
- [ ] Fallback directive path still works for channels without sendMedia

### AC-2: Message Pipeline (R1)
- [ ] `processMessage` extracted to `src/gateway/message-pipeline.ts`
- [ ] server.ts no longer contains message processing logic
- [ ] All 366+ tests pass (zero regression)
- [ ] RPC event wiring works identically

### AC-3: Plugin API Factory (R2)
- [ ] `createPluginApi` extracted to `src/plugins/plugin-api-factory.ts`
- [ ] Plugin init/lifecycle unchanged
- [ ] All 366+ tests pass

### AC-4: Auth Fail-Closed (S1)
- [ ] Default config requires authentication
- [ ] `auth.mode: "none"` requires explicit `allowUnauthenticated: true`
- [ ] Token auto-generated and displayed at startup
- [ ] Health + webhook endpoints exempt from auth
- [ ] BBD tests cover auth enforcement + bypass paths

### AC-5: send_message Tool (T1)
- [ ] `POST /api/message/send` endpoint with text/react/reply modes
- [ ] Extension registers `send_message` tool
- [ ] Telegram + Discord implementations
- [ ] BBD tests cover happy path + error cases

### AC-6: Server.ts Cleanup (R3)
- [ ] server.ts < 500 lines
- [ ] Only lifecycle + dispatch tables remain
- [ ] All tests pass

## 7. Team

| Agent | Suggested Role | v3.4 Tasks |
|---|---|---|
| pi-zero (HappyCastle) | PM | PRD, coordination, release |
| NiceViper (DarkFalcon) | Architecture + Impl | R1, T1 |
| DarkUnion (GoldJaguar) | Spec + Review | R1 review, R2 review |
| TrueJaguar (KeenDragon) | Security + Telegram | S1, V1 Telegram validation |
| MintHawk (KeenUnion) | WebChat + HTTP | R2, R3 |
| JadeHawk (SwiftQuartz) | Cron + Commands | Available |
| HappyNova (MintTiger) | Testing | Regression + new BBD tests |

## 8. Release Criteria

- [ ] All P0 items complete
- [ ] All P1 items complete or explicitly deferred with rationale
- [ ] Full regression green (target: 400+ tests)
- [ ] server.ts < 500 lines
- [ ] Production Telegram validation passed
- [ ] CHANGELOG.md updated
- [ ] No known P0 security gaps
