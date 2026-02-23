# AGENTS.md — pi-gateway

> Lightweight multi-channel AI gateway. Telegram, Discord, Feishu, WebChat → pi RPC.

## Project

- **Stack**: Bun + TypeScript (strict), grammy (Telegram), discord.js, @larksuiteoapi/node-sdk (Feishu)
- **Entry**: `src/server.ts` (~520 lines), `src/cli.ts`
- **Test**: `bun test` — 723+ tests across 43 files, all must pass before commit
- **Config**: `pi-gateway.jsonc` (runtime), `pi-gateway.jsonc.example` (reference)
- **Docs**: `docs/index.md` — full documentation index

## Architecture

### Clean Architecture (v4.0+)

```
┌─────────────────────────────────────────────────────────────┐
│  Interface Layer (Adapters)                                  │
│  ├── plugins/builtin/telegram, discord, feishu, webchat     │
│  ├── api/ (HTTP endpoints)                                   │
│  └── ws/ (WebSocket handlers)                                │
├─────────────────────────────────────────────────────────────┤
│  Application Layer (Use Cases)                               │
│  ├── services/ (SessionRouter, MessageDispatcher)           │
│  ├── use-cases/ (HandleInboundMessage)                      │
│  └── ports/ (inbound/outbound interfaces)                   │
├─────────────────────────────────────────────────────────────┤
│  Domain Layer (Business Logic)                               │
│  ├── types.ts (core domain types)                           │
│  ├── config/entities.ts (ConfigEntity, AgentsEntity, etc.)  │
│  └── session/repository.ts                                  │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure Layer (External Systems)                     │
│  ├── security/ (AuthService, ExecGuardService, etc.)        │
│  ├── persistence/ (SessionStore)                            │
│  └── rpc/ (RPC pool, client)                                │
└─────────────────────────────────────────────────────────────┘
```

### Legacy Compatibility
- Top-level `core/*.ts` files are compatibility layer — **deprecated, do not use for new code**
- New code should import from `core/domain/`, `core/application/`, `core/infrastructure/`, or `core/interface/`
- Migration in progress: old code → new architecture gradually

### Data Flow
```
Channel Plugins (Telegram/Discord/Feishu/WebChat)
  → Message Pipeline (dispatch, queue, backpressure)
    → RPC Pool (pi --mode rpc, session binding)
      → Agent Tools (send_media, send_message, message, cron, gateway, session_status)

Cron Plugin (builtin, sole CronEngine owner)
  → CronEngine (schedule, trigger, concurrency guard, error backoff)
    → RPC Pool (isolated session per job)
    → CronAnnouncer → channel outbound.sendText (direct delivery)
    → SystemEventsQueue + HeartbeatWake (notify main agent)
```

### Key Modules
- `src/core/domain/` — Pure business logic, no external dependencies
- `src/core/application/` — Use cases, ports (interfaces), orchestration
- `src/core/infrastructure/` — External system implementations
- `src/core/interface/` — Adapters (HTTP, WS, plugins)
- `src/core/index.ts` — Clean Architecture exports (preferred import path)
- `src/gateway/` — Message pipeline, dispatch
- `src/plugins/` — Channel plugins + plugin API factory
- `src/security/` — Auth, allowlist, pairing, SSRF, exec guard
- `src/api/` — HTTP endpoints
- `src/tools/` — Gateway tool definitions
- `extensions/gateway-tools/` — Pi extension registering tools for agent use

## Rules

### Clean Architecture Rules
- **Dependency direction**: interface → application → domain, infrastructure → domain only
- **New code imports**: Use `core/index.ts` or specific layer (`core/domain/`, `core/application/`, etc.)
- **No circular dependencies**: domain cannot import from application/infrastructure/interface
- **Types over implementations**: Prefer importing types from domain, implementations from infrastructure
- **Port interfaces**: Application layer defines ports, infrastructure implements them

### Code Quality
- Single file ≤ 500 lines — split by responsibility if exceeded
- `GatewayContext` is the contract — all modules receive `ctx: GatewayContext`, no direct Gateway imports
- New features go in independent modules, not server.ts
- `tsc --noEmit` + `bun test` must pass before every commit
- Commit format: `<type>(<scope>): <subject>` (feat/fix/docs/refactor/test)

### Security
- Media paths: `validateMediaPath()` for external callers, `isAllowedAbsolutePath()` for agent tools
- Outbound send functions must call validation on first line, not rely on callers
- Auth fail-closed: default `mode: "token"`, `mode: "off"` requires explicit `allowUnauthenticated: true`
- ExecGuard checks all `Bun.spawn` call sites
- No `rm` — use `trash`

### Testing
- New features require tests in the same commit or follow-up
- Mock `sendText` must return `MessageSendResult` (not void) to match CA-1 interface
- Test file naming: `*.test.ts` colocated or in `src/core/`

### Multi-Agent Coordination
- `server.ts` edits serialized — one person at a time, coordinate via messenger
- `git add` only your changed files — `git add .` risks including others' uncommitted work
- Reserve files via `pi_messenger` before editing shared modules
- Don't modify others' committed files without coordination

## Config

Runtime config: `pi-gateway.jsonc` (JSONC with comments)

Key sections:
- `gateway` — port, bind, auth
- `agent` — piCliPath, model, thinkingLevel, pool, tools, extensions, modelFailover
- `session` — dmScope (main/per-peer/per-channel-peer)
- `channels.telegram` — botToken, dmPolicy, allowFrom, streamMode, groups
- `channels.discord` — token, dmPolicy, guilds
- `channels.feishu` — appId, appSecret, streamMode
- `cron` — enabled, jobs (schedule: cron/every/at, delivery: announce/silent, concurrency guard, error backoff)
- `roles` — workspaceDirs (role → CWD mapping)

Group chat config key = exact `chatId` from Telegram (not always `-100` prefix). Check logs for actual value.

## Telegram Commands

| Command | Auth | Description |
|---------|------|-------------|
| /new | — | Reset session |
| /stop | — | Interrupt output |
| /model | — | View/switch model |
| /think [level] | — | Cycle/set thinking level |
| /compact [instructions] | — | Compress context |
| /status | — | Session status |
| /context | — | Context usage details |
| /sessions | — | List recent sessions |
| /resume <id> | — | Switch session |
| /whoami | — | Sender info |
| /bash <cmd> | allowFrom | Execute shell on host |
| !cmd | allowFrom | Bash shortcut (!! excluded) |
| /config [section] | allowFrom | View config (redacted) |
| /restart | config toggle | Graceful restart |
| /cron | — | Cron job management |
| /help | — | Command reference |

## Import Guidelines

### Preferred Import Paths (Clean Architecture)

```typescript
// ✅ Domain types — from domain layer
import type { ConfigEntity, SessionKey, InboundMessage } from "../core/domain/index.ts";

// ✅ Application ports — from application layer  
import type { MessageHandlerPort, SessionStorePort } from "../core/application/ports/inbound/index.ts";

// ✅ Infrastructure implementations — from infrastructure layer
import { AuthService, SessionStore } from "../core/infrastructure/index.ts";

// ✅ Interface adapters — from interface layer
import { SystemPromptBuilder } from "../core/interface/plugins/system-prompts/index.ts";

// ✅ Unified barrel export (convenience)
import { SessionRouterService, MessageDispatcherService } from "../core/index.ts";
```

### Legacy Imports (Deprecated — Do Not Use for New Code)

```typescript
// ❌ Avoid these — will be removed in future
import { loadConfig } from "../core/config.ts";           // Use core/index.ts
import { SessionStore } from "../core/session-store.ts";  // Use core/infrastructure/
import { AuthService } from "../core/auth.ts";            // Use core/infrastructure/
```

### Migration Strategy
- **New features**: Always use Clean Architecture paths
- **Bug fixes in old code**: Can use existing imports, migrate if touching multiple files
- **Refactoring**: Coordinate via messenger, update imports incrementally

## File Layout

```
pi-gateway/
├── src/
│   ├── server.ts              # Entry (~520L)
│   ├── cli.ts                 # CLI interface
│   ├── core/                  # Clean Architecture core
│   │   ├── domain/           # Business logic (innermost)
│   │   ├── application/      # Use cases, ports
│   │   ├── infrastructure/   # External implementations
│   │   ├── interface/        # Adapters (HTTP, WS, plugins)
│   │   ├── tests/            # Core unit/integration tests
│   │   └── index.ts          # Clean Architecture exports
│   │   └── *.ts              # ⚠️ Legacy compatibility files
│   ├── gateway/               # Message pipeline, dispatch
│   ├── plugins/               # Channel plugins + plugin API
│   │   ├── builtin/cron/     # Cron plugin (CronEngine owner, announcer)
│   │   ├── builtin/heartbeat/# Heartbeat plugin
│   │   ├── builtin/telegram/ # Telegram (handlers, streaming, outbound, commands, bot)
│   │   ├── builtin/discord/
│   │   ├── builtin/feishu/
│   │   └── builtin/webchat/
│   ├── security/              # Auth, allowlist, pairing, SSRF, exec guard
│   ├── api/                   # HTTP endpoints
│   ├── tools/                 # Gateway tool definitions
│   ├── web/                   # WebChat frontend
│   └── ws/                    # WebSocket methods
├── extensions/gateway-tools/  # Pi extension for agent tools
├── docs/                      # Documentation (see docs/index.md)
├── pi-gateway.jsonc           # Runtime config (gitignored)
├── pi-gateway.jsonc.example   # Config reference
├── CHANGELOG.md               # Version history
└── tsconfig.json              # Strict TS config
```

## Version

Current: **v4.0** — Clean Architecture refactor complete
- 4-layer architecture: domain → application → infrastructure → interface
- Legacy compatibility layer preserved
- TypeScript errors: 93 → 23 (-75%)
- Tests: 73 passed, runtime stable

Previous: **v3.8** (723 tests)
Active: **v4.1** — (next iteration)
