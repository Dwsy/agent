# AGENTS.md — pi-gateway

> Lightweight multi-channel AI gateway. Telegram, Discord, Feishu, WebChat → pi RPC.

## Project

- **Stack**: Bun + TypeScript (strict), grammy (Telegram), discord.js, @larksuiteoapi/node-sdk (Feishu)
- **Entry**: `src/server.ts` (~520 lines), `src/cli.ts`
- **Test**: `bun test` — 723+ tests across 43 files, all must pass before commit
- **Config**: `pi-gateway.jsonc` (runtime), `pi-gateway.jsonc.example` (reference)
- **Docs**: `docs/index.md` — full documentation index

## Architecture

```
Channel Plugins (Telegram/Discord/Feishu/WebChat)
  → Message Pipeline (dispatch, queue, backpressure)
    → RPC Pool (pi --mode rpc, session binding)
      → Agent Tools (send_media, send_message, message, cron, gateway, session_status)
```

Key modules:
- `src/core/` — config, rpc-pool, session-router, types
- `src/gateway/` — message-pipeline, dispatch
- `src/plugins/` — channel plugins (telegram/discord/feishu/webchat), plugin-api-factory
- `src/security/` — allowlist, pairing, ssrf-guard, exec-guard
- `src/api/` — HTTP endpoints (media-send, message-send, message-action)
- `src/tools/` — gateway tool definitions
- `extensions/gateway-tools/` — pi extension registering tools for agent use

## Rules

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
- `cron` — enabled, jobs
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

## File Layout

```
pi-gateway/
├── src/
│   ├── server.ts              # Entry (~520L)
│   ├── cli.ts                 # CLI interface
│   ├── core/                  # Config, RPC pool, session router, types
│   ├── gateway/               # Message pipeline, dispatch
│   ├── plugins/               # Channel plugins + plugin API
│   │   ├── builtin/telegram/  # Telegram (handlers, streaming, outbound, commands, bot)
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

Current: **v3.8** (tag `v3.8`, 723 tests, 19 commits)
Active: **v3.9** — Telegram commands, group chat fixes, docs reorg
