# PRD: pi-gateway v3.3 — Structured Tools + Code Quality

**Status:** Active
**Author:** pi-zero (PM)
**Date:** 2026-02-11
**Baseline:** v3.2 (305/305 pass, system prompt injection + cron CLI + media security delivered)

---

## 1. Overview

v3.3 has two parallel tracks:

1. **Structured Tools** — Replace text-based `MEDIA:` directives with tool calls (`send_media`), establishing the pattern for future gateway tools
2. **Code Quality** — Begin server.ts modularization (2800+ lines → independent route modules), enforced by Dwsy

## 2. Target Users

Technical solo devs and 2-5 person teams running pi-gateway for Telegram/Discord/WebChat agent workflows.

## 3. Scope

### Track 1: Structured Tools + Prompts

| ID | Feature | Priority | Owner | Status |
|---|---|---|---|---|
| F1 | System Prompt Layered Architecture | P0 | NiceViper | ✅ Done |
| F1-T | System Prompt BBD Tests (SP-10~SP-30) | P0 | HappyNova | ✅ Done (21/21) |
| F2 | `send_media` Tool + `/api/media/send` Endpoint | P0 | NiceViper | ✅ Implemented |
| F2-T | `send_media` BBD Tests | P0 | HappyNova | In Progress |
| F3 | S1 MEDIA Path Security Hardening | P1 | TrueJaguar | Assigned |

### Track 2: Code Quality (server.ts Modularization)

| ID | Feature | Priority | Owner | Status |
|---|---|---|---|---|
| Q1 | Server Refactor Spec | P1 | DarkUnion | In Progress |
| Q2 | Media routes extraction (`media-routes.ts`) | P1 | MintHawk | ✅ Done |
| Q3 | Media send extraction (`media-send.ts`) | P1 | NiceViper | ✅ Done |
| Q4 | Remaining server.ts modularization | P2 | TBD (per spec) | Blocked on Q1 |

### Deferred to v3.4

| Feature | Reason |
|---|---|
| `send_message` tool (react/reply/thread) | send_media first, expand later |
| TTS outbound | Provider selection needed |
| WEBP sticker understanding | Vision provider wiring pending |
| `MEDIA:` directive deprecation | Keep as fallback through v3.x |
| E1 Session reset / E3 Markdown adaptation | v3.4 scope |

## 4. Architecture

### 4.1 System Prompt Layers (F1)

```
Layer 1: Identity (agent name, host, OS, version, capabilities list)
Layer 2: Capability prompts (heartbeat, cron, media, delegation, channel hints)
Layer 3: Per-message context (media notes, reply hints, cron events)
```

- Conditional injection: only enabled features generate prompt segments
- Config: `GatewayPromptsConfig` with per-feature toggles
- Docs: `docs/SYSTEM-PROMPT-ARCHITECTURE.md`

### 4.2 send_media Tool (F2)

```
Agent calls send_media tool
  → gateway-tools extension POST /api/media/send (internalToken auth)
    → validateMediaPath (7-layer security)
      → type inference from extension
        → returns MEDIA: directive in tool result
          → channel handler parses and delivers
```

- Dual auth: sessionKey (pool validation) OR internalToken (HMAC-SHA256, per-process)
- Extension auto-skips registration when PI_GATEWAY_URL env absent
- Docs: `docs/MEDIA-TOOL-ARCHITECTURE.md`

### 4.3 Modularization (Q1-Q4)

Target structure:
```
src/
├── api/
│   ├── media-routes.ts    (GET /api/media/* — serve signed files)
│   ├── media-send.ts      (POST /api/media/send — tool endpoint)
│   ├── cron-api.ts        (existing — /api/cron/*)
│   └── metrics.ts         (existing — /api/metrics)
├── server.ts              (routing dispatch only, <500 lines target)
└── ...
```

Full refactor spec: `docs/SERVER-REFACTOR-SPEC.md` (DarkUnion, in progress)

## 5. Design References

| Doc | Path |
|---|---|
| System Prompt Architecture | `docs/SYSTEM-PROMPT-ARCHITECTURE.md` |
| Media Tool Architecture | `docs/MEDIA-TOOL-ARCHITECTURE.md` |
| Server Refactor Spec | `docs/SERVER-REFACTOR-SPEC.md` (pending) |
| Media Security Tests | `src/core/bbd-v32-media-security.test.ts` |

## 6. Acceptance Criteria

### AC-1: System Prompt Layers
- [x] 3-layer prompt architecture (identity / capability / per-message)
- [x] Conditional injection — null when no features enabled
- [x] Config override can force-disable individual segments
- [x] 21 BBD tests green (SP-10 ~ SP-30)

### AC-2: send_media Tool
- [ ] `POST /api/media/send` validates sessionKey or internalToken
- [ ] Path security via existing `validateMediaPath` (traversal/absolute/scheme/symlink)
- [ ] Auto-detect media type from file extension
- [ ] Extension registers `send_media` only when PI_GATEWAY_URL present
- [ ] Tool returns MEDIA: directive for channel handler consumption
- [ ] BBD tests cover auth, security, type inference, error cases

### AC-3: MEDIA Security Hardening (S1)
- [ ] Telegram media-send.ts passes all paths through validateMediaPath
- [ ] No bypass via symlink, null byte, or scheme injection
- [ ] Extended tests in `bbd-v33-media-security.test.ts`

### AC-4: Code Quality
- [ ] server.ts reduced by ≥200 lines (media routes extracted)
- [ ] New features in independent modules (no server.ts bloat)
- [ ] Refactor spec documents remaining extraction targets

## 7. Team

| Agent | Role | v3.3 Tasks |
|---|---|---|
| pi-zero (HappyCastle) | PM | PRD, coordination, review |
| NiceViper (DarkFalcon) | Architecture + Impl | F1, F2, Q3 |
| HappyNova (MintTiger) | Testing | F1-T, F2-T |
| TrueJaguar (KeenDragon) | Security | F3 |
| MintHawk (KeenUnion) | WebChat + Refactor | Q2 |
| DarkUnion (GoldJaguar) | Spec + Review | Q1 |
| JadeHawk (SwiftQuartz) | Cron (standby) | Available |

## 8. Release Criteria

- [ ] All new BBD tests green
- [ ] Existing 305 tests still pass (no regression)
- [ ] server.ts line count reduced
- [ ] CHANGELOG.md updated
- [ ] No P0/P1 items remaining
