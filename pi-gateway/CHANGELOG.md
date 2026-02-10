# Changelog

## [0.5.6] - 2026-02-08

### Changed

**Telegram Channel Re-Architecture (OpenClaw-aligned)**
- Replaced monolithic `src/plugins/builtin/telegram.ts` with modular implementation under `src/plugins/builtin/telegram/`.
- Built per-account runtime model (`Map<accountId, BotRuntime>`) with independent lifecycle/start mode.
- Added account-scoped inbound routing and session source metadata (`MessageSource.accountId`).
- Implemented account-aware outbound target parsing:
  - legacy: `telegram:<chatId>`
  - new: `telegram:<accountId>:<chatId>[:topic:<threadId>]`

### Added

- New Telegram modules:
  - `index.ts`, `bot.ts`, `handlers.ts`, `commands.ts`
  - `accounts.ts`, `config-compat.ts`, `monitor.ts`, `webhook.ts`
  - `media-download.ts`, `media-send.ts`, `format.ts`, `model-buttons.ts`
  - `group-migration.ts`, `reaction-level.ts`, `network-errors.ts`, `proxy.ts`, `update-offset-store.ts`, `sent-message-cache.ts`
- Native command and callback capability upgrades:
  - command help pagination buttons
  - model provider/model selection callback buttons
- Telegram tests:
  - `src/plugins/builtin/telegram/__tests__/accounts.test.ts`
  - `src/plugins/builtin/telegram/__tests__/target.test.ts`

### Security / Migration

- Allowlist and pairing storage upgraded to account-isolated keys with backward-compatible auto migration.
- Telegram session key migration to account dimension (`account:default`) runs on gateway startup.

### Tooling / Docs

- `pi-gw doctor` now prints Telegram account-level mode/token source hints.
- `pi-gw pairing` now supports `--account <accountId>`.
- Updated `README.md`, `pi-gateway.jsonc`, and `docs/TELEGRAM-GAP-ANALYSIS.md` to match multi-account and media behavior.

## [0.5.5] - 2026-02-08

### Added

**Layered Capability Profile (Role/Gateway/Base)**
- Added `CapabilityProfile` builder (`src/core/capability-profile.ts`) to compute per-session RPC startup capabilities with deterministic ordering and signature.
- New layered config fields in `pi-gateway.jsonc`:
  - `agent.runtime.agentDir` (mapped to `PI_CODING_AGENT_DIR`)
  - `agent.runtime.packageDir` (mapped to `PI_PACKAGE_DIR`)
  - `agent.skillsBase[]`, `agent.skillsGateway[]`
  - `roles.mergeMode` (`append`)
  - `roles.capabilities[role]` with `skills[]`, `extensions[]`, `promptTemplates[]`
- Layer merge priority:
  - `skills`: role -> gateway -> base
  - `extensions`: role -> global
  - `promptTemplates`: role -> global
- Path dedupe uses first-win semantics on absolute paths, preserving role/gateway priority.

**Profile Metadata in Runtime Diagnostics**
- Added profile diagnostics to transcript metadata on RPC acquire:
  - `role`, `cwd`, signature prefix, and capability resource counts.

### Documentation

- Added `docs/GATEWAY-EXTENSIBILITY-DEEP-AUDIT.md`: decision-grade deep audit across Gateway plugin capabilities and Agent passthrough capabilities.
- Added `docs/GATEWAY-EXTENSIBILITY-REMEDIATION-BACKLOG.md`: implementation-ready remediation backlog with priorities, acceptance criteria, risks, and rollback points.

### Changed

**RPC Pool Reuse Isolation Upgraded (CWD + Signature)**
- `RpcPool.acquire()` now takes a capability profile instead of plain cwd.
- Idle process reuse now requires both:
  - matching `cwd`
  - matching capability `signature`
- If a bound session's profile no longer matches, the process is recycled and respawned with the new profile (lazy switch on next acquire).
- `RpcClientOptions` now carries:
  - `env` (for runtime isolation vars)
  - `signature` (for observability and reuse control)
- `Gateway` config hot-reload now also updates pool config via `pool.setConfig(newConfig)`.

**Role Mapping Write Target Isolated**
- `session-router` role mapping sync now writes to:
  - `<agent.runtime.agentDir>/roles/config.json` when runtime agent dir is configured
  - falls back to `~/.pi/agent/roles/config.json` only when runtime dir is not set
- This avoids polluting the default `~/.pi/agent` runtime when gateway isolation is enabled.

**Server Entry Points Unified on Capability Profiles**
- Updated all RPC acquire call sites (`dispatch`, `/api/chat`, `/api/chat/stream`, OpenAI-compatible endpoint, webhook wake) to use session role-based capability profiles.

**Docs and Sample Config Updated**
- Updated `README.md` and `pi-gateway.jsonc` sample comments to document:
  - runtime isolation fields
  - layered skill loading
  - role-specific capability overlays

### Added (tests)

- `src/core/capability-profile.test.ts`
  - verifies merge order, dedupe behavior, legacy fallback, signature stability, runtime env mapping
- `src/core/session-router.test.ts`
  - verifies role mapping writes under runtime agent dir and workspace dir behavior
- `src/core/rpc-pool.integration.test.ts`
  - verifies reuse on same signature, non-reuse on different signature, and lazy switching after profile change

## [0.5.4] - 2026-02-07

### Added

**Autonomous Model Router Extension**
- Added new dynamic pi extension: `extensions/auto-model-router/index.ts`.
- Provides two agent-callable tools for model control:
  - `list_models`: inspect current/available models with filter and limit.
  - `switch_model`: switch to target `provider/modelId` and optional thinking level.
- Adds `before_agent_start` autonomy guidance so the agent can proactively evaluate and switch model when task characteristics change.
- Adds optional auto-routing heuristic before each turn (`off | assist | aggressive`) with cooldown to avoid switch thrashing.
- Supports dynamic loading via `pi -e /path/to/index.ts` and gateway RPC startup via `agent.extensions[]`.

## [0.5.3] - 2026-02-07

### Added

**RPC Startup Capability Injection**
- `agent` config now supports startup-level capability injection into each `pi --mode rpc` process:
  - `systemPrompt`, `appendSystemPrompt`
  - `extensions[]`, `skills[]`, `promptTemplates[]`
  - `noExtensions`, `noSkills`, `noPromptTemplates`
- `RpcPool.spawnClient()` maps these fields to CLI flags (`--append-system-prompt`, repeated `--extension`, repeated `--skill`, repeated `--prompt-template`, etc.) so AI capabilities are available at process start, not only via runtime instructions.
- Added examples in `pi-gateway.jsonc` and `README.md` for explicit extension/prompt injection.

## [0.5.2] - 2026-02-07

### Changed

**Telegram Tool Call Display**
- Added `onToolStart` callback in inbound dispatch pipeline so channel plugins can receive tool name + args from `tool_execution_start`.
- Telegram streaming messages now render simplified tool lines during execution (inspired by subagent formatter style):
  - `read` / `write` / `edit` / `multi_edit`: show path only
  - `bash`: show command only
  - other tools: compact args preview
- Telegram now keeps a stronger `typing` chat action heartbeat during runs (start + interval + stream/tool updates), so users can see the bot is still working.
- Final Telegram reply keeps the simplified tool-call lines above the assistant text (instead of hiding tool activity).
- Fixed a Telegram send-path race where global bot reference could become null during final chunk delivery, causing incomplete/truncated output in chat.

## [0.5.1] - 2026-02-07

### Fixed

**RPC Pool CWD Binding**
- Fixed a daemon/runtime bug where prewarmed RPC processes could start without an explicit `cwd` and inherit `/`, then be reused by Telegram sessions.
- `RpcPool.start()` and maintenance prewarm now spawn with a deterministic default role workspace CWD instead of implicit process cwd.
- `RpcPool.acquire()` now reuses idle processes only when their `cwd` matches the requested session cwd, preventing cross-role/cross-workspace contamination.
- If a session is already bound to a live process with mismatched `cwd`, the process is recycled and respawned with the correct `cwd`.

## [0.5.0] - 2026-02-07

### Added

**OpenAI Compatible API**
- `POST /v1/chat/completions`: full OpenAI chat completions endpoint. Any OpenAI SDK client (Python `openai`, curl, ChatBox, Continue, etc.) can connect directly to the gateway.
- Supports `stream: false` (synchronous, returns `chat.completion` object) and `stream: true` (SSE, returns `chat.completion.chunk` events with `data: [DONE]` terminator).
- Uses last user message as prompt, routes through the standard RPC pipeline.

**WS Methods (aligned with OpenClaw)**
- `models.list`: list available models via RPC `get_available_models`
- `usage.status`: token usage stats via RPC `get_session_stats`
- `sessions.compact`: compact session context via RPC `compact`
- `sessions.delete`: remove session from store and release RPC process
- `channels.status`: list loaded channels with label and capabilities
- `config.reload`: manually trigger config hot-reload

**REST APIs**
- `GET /api/models`: list available models (proxy to RPC)
- `GET /api/session/usage?sessionKey=...`: token usage and cost stats

**Security**
- All token comparisons now use `timingSafeEqual` from `node:crypto` (prevents timing side-channel attacks). Applied to: HTTP auth, WebSocket upgrade, WS `connect` method, webhook `/hooks/*` endpoints. Aligned with OpenClaw `auth.ts` `safeEqual`.

**Infrastructure**
- WS tick keepalive: broadcasts `event:tick` with timestamp every 30s to prevent proxy/CDN connection timeouts. Aligned with OpenClaw `tick` event.
- Config hot-reload: `fs.watch` on config file with 500ms debounce. Changes to `pi-gateway.jsonc` are automatically applied without restart. Also available via WS `config.reload` method.
- Cleanup on stop: tick timer and config watcher properly disposed.

## [0.4.0] - 2026-02-07

### Added

**Production Hardening**
- `agent.timeoutMs` config (default 120s): per-message timeout with `rpc.abort()` + 5s force-kill fallback for hung processes
- RPC process init: `set_auto_compaction(true)` + `set_auto_retry(true)` automatically sent on acquire
- 8 new RPC client methods: `setAutoCompaction`, `setAutoRetry`, `getAvailableModels`, `cycleModel`, `cycleThinkingLevel`, `setSteeringMode`, `setFollowUpMode`, `abortRetry`
- `agent_end` hook now receives real `messages` array and `stopReason` from RPC event stream

**Slash Commands (aligned with OpenClaw)**
- `/think <level>`: set thinking level (off/minimal/low/medium/high/xhigh) via RPC `set_thinking_level`
- `/model <provider/modelId>`: switch model via RPC `set_model`
- `/stop`: abort current agent run via RPC `abort`
- `/help`: list all available commands
- `/compact`: now actually calls RPC `compact` (was placeholder)
- REST APIs: `POST /api/session/think`, `POST /api/session/model`
- `GatewayPluginApi`: added `setThinkingLevel`, `setModel`, `compactSession`, `abortSession`
- `setMyCommands` registers all 7 commands to Telegram API

**Extension UI Auto-Handler**
- `rpc-client.ts` `handleExtensionUIRequest`: auto-responds to pi extension UI requests in headless mode
- `select`: auto-picks first option; `confirm`: auto-confirms; `input`/`editor`: auto-cancels; `notify`/status/widget: silent ack
- Prevents hang when pi extensions use `ctx.ui.select()` / `ctx.ui.confirm()` / `ctx.ui.input()`

**TUI Command Guard**
- Gateway intercepts known TUI-dependent pi extension commands (`/role info`, `/memories`, `/plan`, etc.) and returns an instant message instead of hanging
- Timeout force-kill: if a command hangs despite abort, RPC process is killed and released after 5s grace period

**SDK Types**
- `@mariozechner/pi-ai` and `@mariozechner/pi-agent-core` added as devDependencies
- `types.ts` now re-exports authoritative types: `ImageContent`, `ThinkingLevel`, `AgentEvent`, `AgentMessage`, `Model`, etc.
- `ThinkingLevel` uses `pi-agent-core` definition (includes "off")

**Image Format Fix**
- Root cause: pi-mono `ImageContent` is flat `{ data, mimeType }`, not nested `{ source: { data, mediaType } }` as RPC docs suggest
- Gateway now uses correct flat format; `/api/chat` accepts both formats and normalizes
- E2E verified: 1x1 red pixel -> "Red.", screenshot -> accurate description

### Known Limitations

- pi extensions using `ctx.ui.custom()` (TUI components) cannot work in RPC mode — this is a pi-mono limitation
- Affected commands: `/role info`, `/role create`, `/role map`, `/role list`, `/memories`, `/memory-fix`, `/memory-tidy`, `/plan`
- These commands are intercepted by gateway with a helpful message

## [0.3.0] - 2026-02-07

### Added

**REST Chat API (curl-testable)**
- `POST /api/chat`: synchronous chat — send message, wait for full reply. Supports `message`, `sessionKey`, `images` params. Returns `{ ok, reply, sessionKey, duration }`. E2E verified with `claude-haiku-4-5`.
- `POST /api/chat/stream`: SSE streaming chat — returns `text/event-stream` with `delta`, `tool`, `tool_end`, `done` events. Curl-friendly: `curl -N -X POST`.
- `POST /api/session/reset`: reset a session (calls RPC `new_session`, zeroes message count).
- `GET /api/sessions/:key`: single session detail by encoded session key.
- `GET /api/pool`: detailed RPC process pool info (per-process id, sessionKey, isAlive, isIdle, lastActivity).

**Streaming Infrastructure**
- `InboundMessage.onStreamDelta` callback: server pushes `(accumulated, delta)` to channel plugins on each `text_delta` event from pi RPC.
- Telegram plugin now uses `onStreamDelta` for real streaming: sends initial message after 20 chars, then `editMessageText` every 1s (throttled), final edit with full HTML formatting.

### Fixed

- **Streaming reply was dead code**: `replyMsgId` was never set because no code sent the initial message during streaming. Now `onStreamDelta` sends initial message via `sendMessage`, stores `message_id`, and subsequent deltas call `editMessageText`.
- **Voice handler was fake**: changed from "(voice message)" to explicit agent instruction: `[Voice message, Xs. Voice transcription not yet supported. Ask user to type instead.]`
- **rpc-client `prompt()` images type**: changed from incorrect `{ mimeType, data }` to correct `ImageContent[]` (matching pi RPC protocol `{ source: { type: "base64", mediaType, data } }`). Removed `as any` cast in server.ts.

### Added (docs)
- `docs/FEATURE-REALITY-CHECK.md`: honest assessment of what actually works vs what was placeholder code.

## [0.2.1] - 2026-02-07

### Changed

**Telegram Plugin — P0 Complete Rewrite** (`src/plugins/builtin/telegram.ts`: 200 -> 380 lines)

Aligned with OpenClaw `src/telegram/` feature set. Gap analysis documented in `docs/TELEGRAM-GAP-ANALYSIS.md`.

- **Media reception**: `bot.on("message:photo/document/voice")` handlers. Downloads files via Telegram File API -> base64 `ImageContent`. Supports JPEG/PNG/GIF/WebP images up to 10MB. Documents with image MIME also processed as images. Voice messages forwarded as text hint for transcription.
- **Markdown -> Telegram HTML**: `markdownToTelegramHtml()` converts bold, italic, strikethrough, inline code, code blocks, and links to Telegram HTML entities. `parse_mode: "HTML"` on all outbound messages. Automatic fallback to plain text if HTML parse fails.
- **sequentialize middleware**: `@grammyjs/runner` sequentialize ensures messages from the same chat (and forum topic) are processed in order. Key format: `{chatId}` or `{chatId}:{threadId}`.
- **apiThrottler middleware**: `@grammyjs/transformer-throttler` prevents hitting Telegram API rate limits on high-frequency operations.
- **Inbound debouncing**: 1.5s debounce window merges rapid-fire messages from the same chat. Text joined with `\n\n`, images accumulated. Uses latest `ctx` for reply.
- **Streaming reply**: Sends initial placeholder message, updates via `editMessageText` as text streams in. Final edit applies full HTML formatting. Falls back to new message on edit failure.
- **Native slash commands**: `bot.api.setMyCommands()` registers `/new`, `/status`, `/compact` to Telegram API on startup (visible in Telegram command menu).
- **Bot username caching**: `getMe()` called once and cached to avoid repeated API calls for mention detection.
- **HTML-formatted /status**: Status response now uses `<b>` and `<code>` HTML formatting.

### Added

- `docs/TELEGRAM-GAP-ANALYSIS.md`: detailed feature comparison (12 aligned, 6 P0, 10 P1, 7 P2 items)
- `docs/PLUGIN-ARCHITECTURE.md`: documents boundary between pi extensions (core) and gateway plugins (periphery)
- `~/.pi/gateway/plugins/monitor/`: example gateway plugin demonstrating registerHttpRoute, registerCommand, registerGatewayMethod, and hooks
- Dependency: `@grammyjs/runner` for sequentialize middleware

## [0.2.0] - 2026-02-07

### Added

**Session Persistence**
- `SessionStore` class (`src/core/session-store.ts`): persists session metadata to `~/.pi/gateway/sessions/sessions.json`
- Automatic restore on gateway startup (role, messageCount, lastActivity)
- Deferred write-back: dirty flag + 10s interval flush + flush on shutdown
- RPC processes now receive `--session-dir` to persist pi transcripts per session
- `getSessionDir()` / `encodeSessionDir()` utilities for safe directory naming

**File Logging**
- `FileLogger` (`src/core/logger-file.ts`): daily rotating log files `gateway-YYYY-MM-DD.log`
- Configurable via `config.logging.file` / `config.logging.level` / `config.logging.retentionDays`
- Auto-cleanup of old log files (hourly check, default 7-day retention)
- Dual output: console + file (each independently togglable)
- New config key: `logging: { file: false, level: "info", retentionDays: 7 }`

**Cron Engine**
- `CronEngine` (`src/core/cron.ts`): scheduled task execution with three schedule kinds
  - `cron`: recurring via cron expression (powered by `croner` library)
  - `at`: one-shot at specific ISO datetime (auto-removed after trigger)
  - `every`: recurring interval (`30s`, `5m`, `1h`, `2d`)
- Jobs persisted in `~/.pi/gateway/cron/jobs.json`
- Jobs dispatch to sessions via `gateway.dispatch()` (supports isolated `cron:{jobId}` sessions)
- CLI commands: `pi-gw cron list` / `pi-gw cron add <id> --schedule --text [--kind] [--session]` / `pi-gw cron remove <id>`

**Webhook Enhancement**
- `POST /hooks/wake` now accepts optional `sessionKey` parameter (default: `agent:main:main:main`)
- New endpoint `POST /hooks/event`: broadcasts custom events to all WS clients as `hook:{eventName}`
- Both endpoints share token auth (`hooks.token`)

**Gateway Auth**
- Token-based auth for HTTP and WebSocket when `gateway.auth.mode: "token"` is set
- HTTP: `Authorization: Bearer <token>` header or `?token=` query param
- WebSocket: token validated on upgrade via query param, and in `connect` method via `params.auth.token`
- Static files (`/`, `/web/*`) and `/health` are exempt from auth
- Invalid token returns 401 / WS close 4001

**Daemon Installer**
- `pi-gw install-daemon [--port N]`: generates platform-specific service file
  - macOS: `~/Library/LaunchAgents/com.pi-gateway.plist` (launchd, RunAtLoad + KeepAlive)
  - Linux: `~/.config/systemd/user/pi-gateway.service` (systemd user unit)
- `pi-gw uninstall-daemon`: stops, disables, and removes the service file
- Aligned with OpenClaw's `openclaw onboard --install-daemon`

**Docker Support**
- `Dockerfile`: based on `oven/bun:1`, installs Node.js 22 + pi CLI, exposes port 18789
- `docker-compose.yml`: one-command startup with volume mounts for `~/.pi/gateway` and `~/.pi/agent`
- `.dockerignore`: excludes node_modules, dist, docs

**Example Plugin: Monitor**
- `~/.pi/gateway/plugins/monitor/`: demonstrates gateway plugin capabilities
  - `on("message_received")`: counts inbound messages
  - `registerHttpRoute("GET", "/api/monitor")`: external monitoring endpoint
  - `registerCommand("monitor")`: slash command for quick status (no LLM)
  - `registerGatewayMethod("monitor.stats")`: WS RPC method
- `docs/PLUGIN-ARCHITECTURE.md`: documents the boundary between pi extensions (core/agent capabilities) and gateway plugins (periphery/connectivity)

### Changed

- `server.ts`: `this.sessions` changed from raw `Map` to `SessionStore` (persistent)
- `server.ts`: logger creation uses `FileLogger` when `config.logging.file` is enabled
- `rpc-pool.ts`: `spawnClient()` now accepts `sessionKey` and passes `--session-dir` to pi
- `config.ts`: added `LoggingConfig` type and `logging` key to `Config` interface

## [0.1.1] - 2026-02-07

### Added

- HTTP endpoint `POST /api/send` for CLI and external send requests (`channel:target` format)
- WebSocket methods: `chat.history`, `sessions.get`, `config.get`
- Config redaction for `config.get` response (`auth token/password`, Telegram/Discord tokens, hook token)
- Plugin CLI extension runtime in `pi-gw`:
  - `CliProgram` + `CliCommandHandler` interfaces
  - Dynamic loading and execution of plugin-registered CLI commands via `registerCli`
- Pairing management commands:
  - `pi-gw pairing list [--channel <channel>]`
  - `pi-gw pairing approve <channel> <code>`

### Changed

- Telegram `/new` command now performs real RPC session reset (`new_session`) instead of placeholder response
- Plugin registry now tracks CLI registrars (`cliRegistrars`) and exposes them through API/plugin listing
- CLI unknown-command handling now attempts plugin command dispatch before failing

### Fixed

- TypeScript check now passes cleanly (`bun run check`)
- `tsconfig` now supports `.ts` extension imports (`allowImportingTsExtensions`)
- RPC client typing and Bun stream narrowing fixes (`stdin/stdout/stderr` pipe handling)
- Config deep-merge typing safety improvements (`deepMerge<T>` + plain object guard)
- Pairing module now uses ESM `readdirSync` import (removed CJS `require`)

## [0.1.0] - 2026-02-07

### Added

**Core Gateway**
- Single-port HTTP + WebSocket multiplexed server (Bun), aligned with OpenClaw Gateway architecture
- WebSocket protocol: `req/res/event` three-frame model matching OpenClaw Gateway Protocol
- Built-in methods: `connect`, `health`, `chat.send`, `chat.history`, `chat.abort`, `sessions.list`, `plugins.list`
- HTTP endpoints: `/health`, `/api/sessions`, `/api/plugins`, webhook `POST /hooks/wake`
- Static file serving for Web UI from Gateway process

**RPC Process Pool**
- Manages `pi --mode rpc` subprocess pool (configurable min/max/idle timeout)
- Session binding: each session acquires an RPC process, released on idle
- Health checks and idle process reclamation (30s maintenance loop)
- Model passthrough: `agent.model` config (e.g. `claude-kiro-local/claude-haiku-4-5-20251001`) passed as `--provider` + `--model` to pi process

**Session Router**
- Session key format aligned with OpenClaw: `agent:{agentId}:{channel}:{scope}:{id}`
- DM scope modes: `main` (all DMs collapse), `per-peer`, `per-channel-peer`
- Telegram group + topic support, Discord channel + thread support
- role-persona integration: per-channel/group role config -> CWD binding -> pi auto-loads matching role

**Plugin System**
- `GatewayPluginApi` interface aligned 1:1 with OpenClaw `OpenClawPluginApi`
- 8 registration methods: `registerChannel`, `registerTool`, `registerHook`, `registerHttpRoute`, `registerGatewayMethod`, `registerCommand`, `registerService`, `registerCli`
- 14 lifecycle hooks aligned with OpenClaw `PluginHookName`
- Hook dispatch engine: sequential execution, error isolation per handler
- Plugin discovery: config dirs > `~/.pi/gateway/plugins/` > builtin, with `plugin.json` manifest

**Channel Plugins**
- **Telegram** (grammy): DM + group + forum topic, DM pairing/allowlist, requireMention gating, typing indicators, 4096-char message chunking
- **Discord** (discord.js): DM + guild channel + thread, DM pairing/allowlist, requireMention gating, typing indicators, 2000-char message chunking
- **WebChat**: built-in, uses Gateway WS protocol directly

**Security**
- DM policy system aligned with OpenClaw: `pairing`, `allowlist`, `open`, `disabled`
- Pairing system: 8-character uppercase code, 1-hour expiry, max 3 pending per channel
- Persisted allowlists and pairing requests in `~/.pi/gateway/credentials/`

**Configuration**
- JSON5 config file with key structure aligned to `openclaw.json`
- Top-level keys: `gateway`, `agent`, `session`, `channels`, `plugins`, `roles`, `hooks`, `cron`, `logging`
- Config search order: `$PI_GATEWAY_CONFIG` > `./pi-gateway.jsonc` > `./pi-gateway.json` > `~/.pi/gateway/pi-gateway.jsonc` > `~/.pi/gateway/pi-gateway.json`

**Web UI**
- Lit-based SPA served from Gateway, zero build step (CDN importmap)
- Chat, Sessions, Plugins, Health panels
- WebSocket connection with auto-reconnect

**CLI**
- `pi-gw gateway` / `doctor` / `send` / `config show` / `pairing` / `cron` / `install-daemon`

**role-persona Integration**
- Per-channel/group role binding via config
- Role -> CWD mapping synced to `~/.pi/agent/roles/config.json`
- RPC processes spawned with role-specific CWD

### Technical Details

- Runtime: Bun 1.0+
- Agent integration: `pi --mode rpc` (JSON Lines over stdin/stdout)
- Bot libraries: grammy (Telegram), discord.js (Discord)
- Web UI: Lit 3 via CDN
- Tested with: `claude-kiro-local/claude-haiku-4-5-20251001`
