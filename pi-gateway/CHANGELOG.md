# Changelog

## [v3.9] - 2026-02-14

**Focus:** AI Personality & Context Enhancement — human-like assistant behavior, proactive communication, message timestamp injection

### Telegram Bash Command Fix
- **Working Directory Resolution**: `/bash` command now executes in agent's workspace directory instead of gateway process directory (by Dwsy)
- **Session-Aware Execution**: Resolves session key from Telegram context, retrieves RPC client from pool, uses client's `cwd` for command execution (by Dwsy)
- **Fallback Handling**: Falls back to `process.cwd()` if no RPC client found for session (by Dwsy)
- **Debug Logging**: Added working directory logging to help troubleshoot execution context issues (by Dwsy)
- **Affected Commands**: Both `/bash <cmd>` and `!<cmd>` shortcut now use correct working directory (by Dwsy)

### Telegram Sticker Support
- **Inbound Processing**: Download stickers to disk at `~/.pi/gateway/media/telegram/{chatId}/{YYYY-MM-DD}/`, static WEBP stickers downloaded directly, animated/video stickers use thumbnail fallback (by Dwsy)
- **Sticker Cache**: Metadata cached in `sticker-cache.json` keyed by `file_unique_id`, cache hit refreshes rotating `file_id`/emoji/setName, avoids redundant downloads (by Dwsy)
- **Outbound Send**: `[sticker]` directive support, `bot.api.sendSticker` for local files and remote URLs, `send_media` tool type enum extended with `sticker` (by Dwsy)
- **CLI Media Management**: `pi-gw media stats` (storage statistics), `pi-gw media clean --days N` (cleanup old files with dry-run), `pi-gw media sticker-cache [stats|prune|clear]` (cache lifecycle) (by Dwsy)
- **Architecture**: New `media-storage.ts` (disk persistence with channel/chat/date organization), `sticker-cache.ts` (JSON cache with prune/clear), 17 tests in `bbd-sticker.test.ts` (by Dwsy)

### System Prompt Enhancement
- **AI Personality Layer**: Added "Your Role & Personality" section to gateway identity prompt — proactive, intelligent assistant who thinks ahead, stays aware, communicates naturally with emoji status indicators (✅ ⚠️ ❌ 📊 🔔), takes initiative, remembers context, prioritizes clarity (by Dwsy)
- **Proactive Communication Guidelines**: Enhanced `send_message` tool with 6 proactive scenarios (task completion, status changes, reports, alerts, suggestions, progress updates) with emoji examples and "don't spam" guidance (by Dwsy)
- **Message Actions Enhancement**: Added `pin`/`unpin` actions to `message` tool documentation with 4 proactive pin scenarios (critical alerts, announcements, reference info, task summaries) (by Dwsy)
- **Heartbeat Intelligence**: Enhanced heartbeat protocol with proactive monitoring role — check system state, look for patterns/anomalies, provide insights; added 5 proactive monitoring examples (disk trends, error patterns, deadlines, health indicators, optimization opportunities) (by Dwsy)
- **Cron Management**: Added proactive cron management guidance — suggest jobs based on patterns, notify on repeated failures, recommend schedule adjustments, auto-cleanup completed one-shots (by Dwsy)

### Message Context Injection
- **Timestamp Injection**: Added `MessageSource.timestamp` field (Unix timestamp in seconds); Telegram `buildSource` now extracts `msg.date` (by Dwsy)
- **Absolute Time Display**: Message context now includes formatted timestamp in Chinese timezone — `time:2026/02/14 16:08:50` format (by Dwsy)
- **Relative Time Display**: Added `formatRelativeTime()` helper with 7 time ranges (刚刚, X分钟前, X小时前, X天前, X周前, X个月前, X年前); injected alongside absolute time for human-readable context (by Dwsy)
- **Enhanced Context Format**:
  - Group: `[group:{chatId} | from:{sender} | thread:{threadId} | msgId:{messageId} | time:2026/02/14 16:08:50 | 2分钟前]`
  - DM: `[msgId:{messageId} | time:2026/02/14 16:08:50 | 刚刚]`

### Benefits
- AI can now understand time urgency ("刚刚" vs "2小时前" vs "3天前")
- More natural conversation with time-aware responses ("你5分钟前问的...")
- Time-based decision making (detect outdated requests, expired reminders)
- Proactive system monitoring and intelligent suggestions
- Human-like communication with emoji status indicators

## [v3.8] - 2026-02-13

**BBD Test Results:** 723/723 pass, 0 fail ✅ (v3.7: 703, v3.8: +20)
**Commits:** 17 (v3.7..v3.8)
**Team:** pi-zero (PM), BrightZenith (consultant), YoungStorm, JadePhoenix, NiceNova, CalmArrow, CalmBear
**Focus:** Agent Autonomy & Interaction — gateway self-management, session resume, group chat, model failover

### New Tools
- `gateway` tool: 3 actions — config.get (view running config), reload (hot-reload config), restart (graceful restart with config toggle) (by YoungStorm, `5a648c6`)
- `session_status` tool: query session runtime status — token count, cost, model, context usage, message count (by NiceNova, `d70290e`)

### Message Tool Phase 2
- `pin` action: pin/unpin messages across Telegram/Discord, Feishu/WebChat stub (by JadePhoenix, `d2fd73f`)
- `read` action: read chat history with limit/before params, capped at 100 messages (by JadePhoenix, `d2fd73f`)

### Cron Enhancements
- `update` action: modify existing cron jobs (by JadePhoenix)
- `runs` action: view job execution history with limit (by JadePhoenix)
- `status` action: cron engine status overview (by JadePhoenix)

### Session Management
- Auto-resume on restart: `--continue` flag added to RPC spawn when session directory has existing JSONL; `session.continueOnRestart` config toggle (default true) (by Dwsy, `6d2b783`)
- Telegram `/sessions` command: list recent sessions with message count, last activity, active status (by Dwsy, `7fbc3b6`)
- Telegram `/resume <id>` command: switch to a different session with stats display (model, context usage) (by Dwsy, `7fbc3b6`)

### Group Chat
- Per-message context injection: `[group:chatId | from:sender | msgId:123]` prefix for group, `[msgId:123]` for DM (by Dwsy, `75ddf44` + `c8f3330`)
- `[NO_REPLY]` silent token: agent can decline to reply in group chats, transcript logs `silent_no_reply` event (by Dwsy, `75ddf44`)
- Per-group role binding via `channels.telegram.groups[chatId].role` — each group gets its own workspace + persona
- `requireMention` (default true), `groupPolicy` (open/disabled/allowlist), `allowFrom` per-group filtering
- `MessageSource.messageId` field: enables agent to use pin/react/edit/delete via message tool (`c8f3330`)

### Model Failover
- `src/core/model-health.ts` (135 lines): error classification (6 categories: rate_limit/auth/billing/timeout/overloaded/unknown), per-model health tracking, cooldown management, fallback chain selection (by JadePhoenix)
- Config: `agent.modelFailover: { primary, fallbacks, cooldownMs }` — ordered fallback chain with configurable cooldown
- Integration: message-pipeline catch block records failures + classifies errors; agent_end records success + resets cooldown
- Transient errors (rate_limit/timeout/overloaded) → 60s cooldown; permanent errors (auth/billing) → 1h cooldown

### Documentation
- `docs/guides/configuration.md` — all 13 config sections with field tables + jsonc examples (by YoungStorm, `5985693`)
- `docs/guides/telegram.md` — BotFather setup, DM/group, streaming, commands, media, multi-account (by CalmArrow, `25d3f9b`)
- `docs/guides/group-chat.md` — per-group role, mention, policy, NO_REPLY, forum/topic (by CalmBear, `c53c4f7`)
- `docs/guides/agent-tools.md` — all 6 gateway tools: send_media/send_message/message/cron/gateway/session_status (by NiceNova, `34f2422`)

### Bug Fixes
- Telegram pin/readHistory `rt is not defined` — T2 methods missing `getRuntime()` call (`c076909`)

### Testing
- Gateway tool tests: GW-01~GW-10 covering config.get/reload/restart + error cases + auth (by YoungStorm, `ae07db4`)
- Message Phase 2 tests: MA-21~MA-30 covering pin/unpin/read-history + unsupported/error cases (by CalmArrow, `d6d3183`)

## [v3.7] - 2026-02-13

**BBD Test Results:** 703/703 pass, 0 fail ✅ (v3.6: 687, v3.7: +16)
**Team:** pi-zero (PM), EpicViper (consultant), IronIce, PureWolf, VividBear, YoungStorm, JadePhoenix
**Focus:** Code Quality & Type Safety — zero new features, pure technical debt reduction

### Security
- S3 ExecGuard wired to all 6 Bun.spawn call sites — daemon.ts hardcoded subcommand allowlist, metrics.ts/cli.ts audit logging (by EpicViper, `303bcb5`)

### Refactored (Telegram Module Split)
- `handlers.ts` 1199→528 lines: extracted `streaming.ts` (464L, dispatch+render) + `outbound.ts` (213L, send+actions) (by EpicViper, `c64e913`+`66c0baf`)
- `commands.ts` 650→464 lines: extracted `model-selector.ts` (222L, /model UI) (by EpicViper, `2880d20`)

### Refactored (Server & Extensions)
- `server.ts` 597→512 lines: extracted `cron-announcer.ts` (~100L) (by PureWolf, `7a17ab3`)
- `gateway-tools/index.ts` 538→34 lines: split into 6 modules (send-media/send-message/cron/message-action/helpers/index) (by IronIce, `7056014`)

### Type Safety
- Config types: `WebChatChannelConfig` + `TelegramAccountConfig.streaming` — eliminated 8 `as any` (by EpicViper, `9d063c6`)
- RPC event types: `src/core/rpc-events.ts` with typed extractors — eliminated 11 `as any` from chat-api + message-pipeline (by VividBear, `2b82e4e`)
- `catch (err: any)` → `catch (err: unknown)` across all `src/` non-test files — 45 occurrences (by YoungStorm, `16f59db` + follow-ups)

### Testing
- Security edge-case tests: +16 tests for allowlist + pairing (corrupted JSON, bootstrap, revokeSender, channel isolation, charset, double approve, legacy migration, per-account cap) (by JadePhoenix, `ed4e7c8`)
- `SystemEventsQueue` self-contained gc timer with `dispose()` (by IronIce, `34bf02b`)

## [v3.6] - 2026-02-12

**BBD Test Results:** 687/687 pass, 0 fail ✅ (v3.5: 568, v3.6: +119)
**Team:** pi-zero (PM), EpicViper, JadePhoenix, IronIce, PureWolf, VividBear, YoungStorm

### Added (Message Tool)
- `message` tool with react/edit/delete actions via `POST /api/message/action` (by EpicViper)
- `ChannelOutbound` +3 optional methods: `sendReaction`, `editMessage`, `deleteMessage` (by EpicViper)
- Telegram react/edit/delete implementation (by EpicViper)
- Discord react/edit/delete implementation (by JadePhoenix)
- Feishu react/edit/delete implementation with reaction_id list→filter→delete flow (by JadePhoenix)
- 20 endpoint tests MA-01~MA-20 (by YoungStorm)
- 11 tool-layer tests GT-5 (by EpicViper)

### Added (Cron Enhancements)
- Cron tool with 7 actions: list/add/remove/pause/resume/run/wake (by EpicViper)
- Cron announcer: announce/direct/silent delivery modes aligned with OpenClaw (by EpicViper)
- Cron self-delivery tracking: skip announce when agent already sent via send_message/send_media (by JadePhoenix)
- One-shot tasks: `schedule.kind:"at"` + `deleteAfterRun:true` (by EpicViper)

### Added (Role RPC)
- `/role` forwarded to role-persona extension via RPC instead of gateway builtin (by pi-zero)
- Gateway role-manager removed (80 lines) — role handled entirely by role-persona (by pi-zero)

### Added (Observability)
- RPC send/receive events persisted to `log/rpc.log` (by pi-zero)
- `DispatchResult` with `injected`/`enqueued` flags for dispatch observability (by IronIce)

### Fixed (Steer Spinner)
- Steer mode spinner stuck: `dispatch()` returns `{ injected: true }`, Telegram handler skips spinner on steer (by IronIce + PureWolf)

### Fixed (Message Ordering)
- `onStreamDelta` uses delta instead of accumulated to preserve tool-call interleaved text segments (by VividBear)

### Fixed (RPC Command Forwarding)
- `forwardToRpc` captures `message_end` events from extension commands (role-persona etc) (by pi-zero)
- Extension commands don't trigger `agent_end` — 500ms event wait + fallback `waitForIdle` (by pi-zero)
- Deduplicate `message_end` content via Set (by pi-zero)

### Fixed (Tool Schema Compatibility)
- `Type.Union(Literal)` → `Type.String({enum})` for kimi-k2.5 and non-OpenAI model compatibility (by pi-zero)

### Fixed (Media)
- `send_media` default `workspaceOnly: false` — allow absolute paths outside workspace (by pi-zero)
- Channel `sendMedia` returning `{ok:false}` now returns HTTP 502 instead of silent 200 (by pi-zero)

### Fixed (Telegram)
- Thinking display limit increased from 300/200 to 1024 chars (by pi-zero)
- Pi command name conflict filter removed (by pi-zero)

### Fixed (BG-002: Session Lifecycle)
- Session_end audit: telegram key migration = rename (no session_end needed), heartbeat release = pool return (no session_end needed). Inline comments + 2 tests added (by VividBear)

### Fixed (BG-003)
- `ctx.registry` → `this.registry` startup crash fix (by pi-zero)

## [v3.5] - 2026-02-12

**BBD Test Results:** 568/568 pass, 0 fail ✅ (v3.4: 531, v3.5: +37)

### Added (CA-1: Channel Adapter Interfaces)
- `ChannelOutbound`: named interface extracted from inline outbound definition, `sendText` returns `Promise<MessageSendResult>` (by NiceViper)
- `ChannelStreamingAdapter`: edit-in-place streaming contract (`createPlaceholder`, `editMessage` → boolean skip-not-retry, `setTyping`, `StreamingConfig` with `editThrottleMs >= 300ms`) (by NiceViper)
- `ChannelSecurityAdapter`: DM access control (`DmPolicy`, `checkAccess` sync|async, pairing tier support) (by NiceViper)
- `ChannelPluginCapabilities`: added `streaming` and `security` boolean fields (by NiceViper)
- 3-step sendText migration: union type → channel implementations → type narrowing + `wrapLegacyOutbound` removed (by NiceViper)

### Added (CA-2: Telegram Adapter Migration)
- Telegram `sendText` returns `MessageSendResult` with try/catch error capture (by TrueJaguar/PureWolf)
- Telegram `streaming` and `security` adapters wired to `ChannelPlugin` (by TrueJaguar/PureWolf)

### Added (D1: Discord + WebChat Migration)
- Discord declares `streaming` and `security` capabilities (by MintHawk/KeenWolf)
- WebChat declares `media` capability (by MintHawk/KeenWolf)

### Added (F3a: Feishu Streaming + Security)
- Feishu streaming card updates via `client.im.message.patch` + `buildMarkdownCard` (by JadeStorm)
- Feishu DM policy alignment with `ChannelSecurityAdapter` (by JadeStorm)
- Feishu `sendText` returns `MessageSendResult` (by NiceViper, CA-1 step 3)
- `checkBotMentioned` fail-closed fix + `isSenderAllowed` accountId scoping (by JadeStorm)

### Added (Feishu PR2: Media)
- Feishu media inbound + outbound with `validateMediaPath` guard on `sendFeishuMedia` (by JadeStorm)

### Added (BG-002: Session Lifecycle)
- `session_end` hook dispatched on 5 paths: explicit reset, RPC disconnect, idle eviction, role switch, gateway shutdown (by PureWolf)

### Added (BG-003: Registration Conflict Detection)
- Startup summary logs plugin registration conflicts with resolution status (skipped/overwritten/duplicate) (by PureWolf/KeenWolf)

### Added (Telegram Commands)
- `/context` command showing progress bar, tokens, cost, message counts, tool calls (by TrueJaguar)
- Context usage display in `/status` output (by TrueJaguar)
- Restored `/stop` command removed in v3.1 refactor (by TrueJaguar)
- Added `stop`/`role`/`cron` to `localCommands` set to prevent RPC forwarding (by TrueJaguar)

### Fixed
- Telegram spinner orphan messages in steer mode — lazy init spinner/reply on first callback fire (by TrueJaguar)
- Telegram message ordering after tool calls — `toolCallSinceLastText` flag preserves sequence boundaries (by TrueJaguar)
- RPC `abort()` writes directly to stdin without waiting for response (by HappyCastle)
- RPC model fallback — retry without `--provider`/`--model` on spawn failure when model not found (by JadeStorm)
- ExecGuard applied in RPC pool fallback path (by JadeStorm)
- Audio format support expanded: `.aiff`, `.aac`, `.opus`, `.wma` added to `AUDIO_EXTS` (by HappyCastle)
- Telegram `bot.catch` error handler + logger level gating (by HappyCastle)
- Telegram respond callback diagnostic logging — no more silent send failures (by HappyCastle/TrueJaguar)
- RPC-EVENT log noise reduced: 9 event types downgraded info→debug, tool names logged on `tool_execution_start` (by HappyCastle)
- Telegram `/stop` command description corrected to match abort behavior (by TrueJaguar)

### Changed
- Heartbeat enabled by default in config (by HappyCastle)
- `types.ts`: 308 → 468 lines (+160) with CA-1 interfaces, then 468 → 455 after `wrapLegacyOutbound` removal

### Documentation
- `docs/BG-001-TOOL-BRIDGE-DESIGN.md`: Gateway ↔ agent tool ecosystem bridge — 3 paths analyzed, Path B (extension bridge) recommended (by NiceViper)
- `docs/BG-004-HOT-RELOAD-DESIGN.md`: Plugin hot-reload mechanism — scoped reload with 5-tier complexity, 3-phase implementation (by NiceViper)
- `docs/CA-0-CHANNEL-PATTERN-COMPARISON.md`: Evidence-based channel pattern analysis (by NiceViper)
- `docs/CA-1-CHANNEL-ADAPTER-INTERFACE.md`: Channel adapter interface spec, 7/7 APPROVE (by NiceViper)
- `docs/PRD-GATEWAY-V35.md`: v3.5 PRD final (by HappyCastle, 7/7 reviewed)

## [Unreleased] - v3.4 - 2026-02-12

**BBD Test Results:** 482/482 pass, 0 fail ✅ (v3.3: 448, v3.4: +34)

### Added (R1: Message Pipeline Extraction — v3.4)
- `src/gateway/message-pipeline.ts`: `processMessage` extracted from server.ts with full GatewayContext injection, RPC event wiring, hook dispatch, and outbound text normalization (by NiceViper)
- server.ts reduced from 1783 → 1447 lines after R1

### Added (R2: Plugin API Factory Extraction — v3.4)
- `src/plugins/plugin-api-factory.ts`: `createPluginApi` extracted from server.ts, constructs scoped `GatewayPluginApi` per plugin with logger, registration methods, and lifecycle hooks (by DarkUnion)
- server.ts reduced from 1447 → 1228 lines after R2

### Added (S1: Auth Fail-Closed — v3.4)
- Default auth mode changed to `token` with auto-generated token shown at startup (by TrueJaguar)
- `auth.mode: "none"` now requires explicit `auth.allowUnauthenticated: true` confirmation
- All HTTP/WS endpoints require auth except `/health` and webhook paths
- WS connections support `?token=` query parameter authentication
- `/webhook/telegram` and `/webhook/discord` get auth exemption only when respective channels are enabled via `buildAuthExemptPrefixes`
- `auth.logToken: false` config option to hide auto-generated tokens from logs
- Tests in `bbd-v34-auth.test.ts` (by TrueJaguar)

### Added (S2: SSRF Guard — v3.4)
- `src/core/ssrf-guard.ts`: outbound URL validation blocking RFC 1918/6890 private ranges, link-local (169.254.x.x), loopback, dangerous schemes, credentials in URLs, decimal IP notation, and IPv4-mapped IPv6 (by JadeHawk)
- `validateOutboundUrl()`: async DNS-rebinding-aware validation with configurable `allowedHosts` (wildcard support), `blockedHosts`, `allowPrivate`, `maxRedirects`
- `safeFetch()`: drop-in `fetch` replacement with SSRF guard + redirect blocking
- `validateConfigUrl()`: startup-time config URL validation (scheme + credentials check)
- 34 tests in `bbd-v34-ssrf-guard.test.ts` covering AWS metadata, loopback, private nets, IPv6, decimal IP, octal IP rejection, IPv4-mapped IPv6 hex normalization, wildcard hosts, credential blocking (by JadeHawk)

### Added (S3: Exec Allowlist — v3.4)
- `src/core/exec-guard.ts`: `ExecGuard` class with fail-closed executable allowlist (default: `["pi", "ps"]`), audit logging, and listener API (by JadeHawk)
- Two-pass arg sanitization: marks sensitive flags (`--token`, `--key`, `--secret`, `--password`), then redacts following values
- `validatePiCliPath()`: startup validation of configured `piCliPath` against allowlist
- Audit log with configurable max entries, stats (`total/allowed/blocked`), and `onAudit()` callback for external integrations
- Cron isolated mode naturally gated via RPC pool → ExecGuard path
- 20 tests in `bbd-v34-exec-guard.test.ts` (by JadeHawk)

### Added (E1: Session Reset Adaptation — v3.4)
- `src/gateway/session-reset.ts`: centralized `resetSession()` replacing duplicated logic in `session-api.ts` and `plugin-api-factory.ts` (by JadeHawk)
- Reset now includes: RPC `newSession` + state reset + `systemEvents.consume` + `queue.clearCollectBuffer` + `session_reset` hook + WS broadcast + transcript logging
- New `session_reset` hook added to `PluginHookName` for plugin extensibility
- 11 tests in `bbd-v34-session-reset.test.ts` (by JadeHawk)

### Fixed (Telegram Video Kind — v3.4)
- `sendLocalFileByKind` now handles `video` kind via `sendVideo`, fixing fallback to audio for video uploads (by TrueJaguar)
- `TelegramMediaDirective` kind mapping: incoming `"document"` normalized to `"file"` to match expected enum (by TrueJaguar)
- Tests in `bbd-v34-media-kind.test.ts` (by TrueJaguar)

### Fixed (WebChat Media Event — v3.4)
- `sendWebChatMedia` signs file URLs and broadcasts `media_event` over WS with `sessionKey` for frontend filtering (by MintHawk)
- WS `media_event` includes `sessionKey` so multi-session frontends can route pushes correctly (by MintHawk)

### Changed (Code Quality — v3.4)
- server.ts reduced from 1783 → 1228 lines (31% reduction from v3.3, cumulative 59% from v3.2 peak of 2985)
- P2 modularization complete: message-pipeline + plugin-api-factory extracted
- GatewayContext extended with `channelApis`, `reloadConfig` hook, and 6 additional fields for plugin-api-factory support

### Documentation
- `docs/PRD-GATEWAY-V34.md`: Production Hardening + Deep Refactor PRD (by NiceViper, reviewed by pi-zero)
- `docs/S2-SSRF-GUARD-SPEC.md`: SSRF guard design spec (by JadeHawk)
- `docs/S3-EXEC-ALLOWLIST-SPEC.md`: Exec allowlist design spec (by JadeHawk)

## [v3.3] - 2026-02-11

**BBD Test Results:** 361/361 pass, 0 fail ✅ (v3.2: 305, v3.3: +56)

### Added (F1: System Prompt 3-Layer Architecture — v3.3)
- Three-layer prompt system: Layer 1 Gateway Identity (static), Layer 2 Capability Prompts (conditional), Layer 3 Per-Message Context (channel handlers) (architecture by NiceViper)
- `buildGatewayIdentityPrompt()`: runtime line (agent/host/os/capabilities), gateway rules, always injected unless `identity=false` (by DarkUnion)
- Enhanced heartbeat segment: HEARTBEAT_OK decision guide, HEARTBEAT.md format example, `alwaysHeartbeat` config option (by TrueJaguar)
- Enhanced cron segment: /cron command reference, schedule formats, execution modes, event processing rules (by JadeHawk)
- Enhanced media segment: type inference table, blocked path examples, multi-MEDIA rules (by TrueJaguar)
- `buildDelegationSegment()`: agent list, constraints (timeout/depth/concurrent), delegation guidelines (by JadeHawk)
- `buildChannelSegment()`: Telegram (4096 char, HTML), Discord (2000 char, Markdown), WebChat (lightbox, sessions) formatting hints (by MintHawk)
- `GatewayPromptsConfig` extended: `identity`, `channel`, `delegation`, `alwaysHeartbeat` toggles (by NiceViper)
- Tests SP-10 ~ SP-30 (21 scenarios) (by HappyNova)

### Added (F2: send_media Tool — v3.3)
- `POST /api/media/send` endpoint in `src/api/media-send.ts`: dual auth (sessionKey + internalToken), path security via `validateMediaPath`, media type auto-inference (photo/audio/video/document), caption support (by NiceViper)
- `extensions/gateway-tools/index.ts`: `send_media` tool registration when `PI_GATEWAY_URL` present, calls `/api/media/send`, returns `MEDIA:` directive for channel delivery (by NiceViper)
- `getGatewayInternalToken()`: HMAC-derived per-process token for pi→gateway auth (by NiceViper)
- `capability-profile.ts`: injects `PI_GATEWAY_URL` + `PI_GATEWAY_INTERNAL_TOKEN` env vars into spawned pi processes (by NiceViper)
- Tests MS-10 ~ MS-30 (21 scenarios) (by HappyNova)

### Added (F3: S1 MEDIA Security Hardening — v3.3)
- `validateMediaPath` hardened: URL scheme regex (`/^[a-zA-Z][a-zA-Z0-9+.-]*:/`), `data:` URI blocking, whitespace/null byte guard (by TrueJaguar)
- `parseOutboundMediaDirectives` now validates `[photo]`/`[audio]` directive paths via `validateMediaPath`, blocking absolute/traversal/scheme paths (by TrueJaguar)
- `sendTelegramMedia` entry-point guard: validates all local paths before dispatch, covering `/photo`/`/audio` command paths (by TrueJaguar)
- `normalizePath` dead code cleanup: removed `file://` expansion (blocked by validateMediaPath, contradicted system prompt rules) (by TrueJaguar)
- Tests S1-1 ~ S1-14 in `bbd-v33-media-security.test.ts` (by TrueJaguar)

### Added (F4: Telegram outbound.sendMedia — v3.3)
- `sendMediaViaAccount()` in `handlers.ts`: multi-account + topic routing via `parseTelegramTarget`, delegates to `sendTelegramMedia` with full path validation (by TrueJaguar)
- Telegram `ChannelPlugin.outbound.sendMedia` wired in `index.ts` — enables direct media delivery via `POST /api/media/send` without directive fallback (by TrueJaguar)

### Changed (Q1-Q3: Code Quality — v3.3)
- **P0 server.ts modularization** (by DarkUnion):
  - `src/api/http-router.ts`: HTTP route dispatch
  - `src/api/openai-compat.ts`: OpenAI-compatible API endpoints
  - `src/api/webhook-api.ts`: webhook wake endpoint
  - `src/api/session-api.ts`: session CRUD + model/think/reset APIs
- **P1 server.ts modularization** (by MintHawk, JadeHawk, NiceViper):
  - `src/gateway/command-handler.ts`: slash command parsing + TUI guard + registry dispatch + RPC fallback
  - `src/gateway/role-manager.ts`: role listing + session role switching
  - `src/gateway/tool-executor.ts`: tool registry, execution, delegate_to_agent interception
  - `src/gateway/types.ts`: GatewayContext interface for dependency injection
- server.ts reduced from 2881 → 1790 lines (38% reduction, 11 modules extracted)
- Media routes extracted from `server.ts` to `src/api/media-send.ts` (by NiceViper)
- `system-prompts.ts` rewritten from 3 conditional segments to full 3-layer architecture with typed builders (by NiceViper + all contributors)
- Server.ts modularization refactor spec: P2 (message-pipeline, plugin-api-factory) planned

---

## [v3.2] - 2026-02-11

**BBD Test Results:** 305/305 pass, 0 fail ✅

### Added (F1: System Prompt Injection — v3.2)
- `buildGatewaySystemPrompt(config)` conditionally injects heartbeat/cron/media protocol docs into agent system prompt (by GoldJaguar, reviewed by KeenDragon)
- `src/core/system-prompts.ts`: capability-aware prompt builder (by GoldJaguar)
- Tests SP-1 ~ SP-6 (by MintTiger)

### Added (F2: Cron CLI Management — v3.2)
- Cron CRUD: `addJob()`, `removeJob()`, `pauseJob()`, `resumeJob()`, `listJobs()`, `runJob()` in `src/core/cron.ts` (by SwiftQuartz, reviewed by GoldJaguar)
- HTTP API: `GET/POST/DELETE /api/cron/jobs`, `PATCH /api/cron/jobs/:id`, `POST /api/cron/jobs/:id/run` in `src/core/cron-api.ts` (by SwiftQuartz)
- WS methods: `cron.list`, `cron.add`, `cron.remove`, `cron.pause`, `cron.resume`, `cron.run` (by SwiftQuartz)
- Telegram/Discord `/cron` slash command (by SwiftQuartz)
- Validation: schedule parsing, id uniqueness, agentId existence check (by SwiftQuartz)
- Tests CR-1 ~ CR-11 (by MintTiger)

### Added (F3: WebChat Image Send/Receive — v3.2)
- `src/core/media-token.ts`: HMAC-SHA256 signed URL generation/verification, config secret with random fallback, 1h default TTL (by KeenUnion, reviewed by DarkFalcon)
- `GET /api/media/:token/:filename`: signed token verification → path validation → `Bun.file()` streaming response, MIME inference, 10MB default limit (by KeenUnion)
- `processWebChatMediaDirectives()`: parses `MEDIA:./path` in agent replies, images → signed URLs, non-images → download links (by KeenUnion)
- Frontend: media image rendering with lazy loading, click-to-expand lightbox overlay, history persistence of mediaImages (by KeenUnion)
- SVG XSS protection: `Content-Disposition: attachment` + `Content-Security-Policy: sandbox` (by KeenUnion, review fix from DarkFalcon)
- Tests WI-1 ~ WI-5 (by MintTiger)

### Added (F4: MEDIA Path Security Hardening — v3.2)
- `src/core/media-security.ts`: `validateMediaPath()` — blocks null bytes, URL schemes (`://`, `data:`, `file:`), absolute paths, `~`, `..` traversal, symlink escape via `realpathSync` (by KeenDragon, tested by MintTiger)
- Reused by both Telegram `media-send.ts` and WebChat `/api/media` endpoint (by KeenDragon + KeenUnion)
- Tests MS-1 ~ MS-8 (by MintTiger)

---

## [v3.1] - 2026-02-11

**BBD Test Results:** 240/240 pass, 0 fail, 8 skip — **首次全绿** (v3.0: 151, v3.1: 55, extensions: 9, telegram: 25)

**Critical Fixes (v3.1):**
- `resolveMainSessionKey()` 统一提取到 `session-router.ts` — Cron main mode 和 Heartbeat 共享，修复事件不可见问题 (GoldJaguar + SwiftQuartz)
- `getPiCommands()` 使用 `pool.findBestMatch()` 替代 `pool.getForSession()` — 修复 Telegram pi_ 命令永不注册 (KeenDragon)
- `isInActiveHours()` 使用 `Intl.DateTimeFormat` 处理时区 — 修复跨时区 activeHours 判断 (GoldJaguar)

### Added (Heartbeat — v3.1)
- `HeartbeatExecutor` rewrite in `src/core/heartbeat-executor.ts`: periodic agent wake-up with `findBestMatch` pool strategy (reuse idle only, never spawn), bounded retry (2 attempts × 5s), concurrent guard, `requestNow()` for immediate wake (by GoldJaguar)
- `isHeartbeatContentEffectivelyEmpty()`: skips API calls when HEARTBEAT.md contains only headings and empty checkboxes (by GoldJaguar)
- `stripHeartbeatToken()`: edge-strip algorithm handles markdown/HTML-wrapped tokens, iterative start/end removal, whitespace collapse (by GoldJaguar)
- `DEFAULT_HEARTBEAT_PROMPT`: "do not infer or repeat tasks from prior conversations" guard against hallucinated tasks (by GoldJaguar)
- `CRON_EVENT_PROMPT` / `EXEC_EVENT_PROMPT`: specialized prompts for system event processing (by GoldJaguar)
- `HeartbeatConfig` added to `Config` interface with `maxRetries`, `retryDelayMs`, `messageTimeoutMs`, per-agent override support (by GoldJaguar)
- `skipWhenBusy` implementation: checks `pool.getForSession().isIdle` before executing heartbeat (by GoldJaguar)
- `isInActiveHours` timezone: uses `Intl.DateTimeFormat(formatToParts)` with IANA timezone instead of system local time (by GoldJaguar)
- Cron main mode fallback: when `heartbeatWake` unavailable, removes injected event and falls back to isolated mode (by GoldJaguar)
- `SystemEventsQueue.gc()` scheduled in server.ts WS tick keepalive (30s interval) for TTL expiry cleanup (by GoldJaguar)
- Heartbeat integration in `server.ts`: lifecycle management (start/stop with gateway), alert delivery to agent-bound channels via `deliverHeartbeatAlert()` (by GoldJaguar)

### Added (Cron — v3.1)
- Cron main mode in `src/core/cron.ts`: injects system events via `SystemEventsQueue`, wakes heartbeat via `requestNow()` callback, falls back to isolated mode when systemEvents unavailable (by SwiftQuartz)
- `deleteAfterRun` support: non-`at` jobs can self-remove after first execution via `job.deleteAfterRun: true` (by SwiftQuartz)
- `SystemEventsQueue` in `src/core/system-events.ts`: gateway-layer in-memory event queue with inject/peek/consume, max 20 events per session, 1h TTL, periodic GC, stats for monitoring (by GoldJaguar)
- `resolveMainSessionKey()` shared between HeartbeatExecutor and CronEngine via session-router for consistent session key resolution (by SwiftQuartz)
- SystemEventsQueue GC scheduled in server.ts WS tick keepalive (30s interval) (by GoldJaguar)

### Added (Telegram Media — v3.1)
- Telegram media download (`telegram/media-download.ts`): photo/video/document/audio download via Telegram File API → base64 with MIME inference (by KeenDragon)
- Telegram audio transcription (`telegram/audio-transcribe.ts`): Groq Whisper (default) + OpenAI Whisper via OpenAI-compatible STT API (by KeenDragon)
- Telegram media send (`telegram/media-send.ts`): `MEDIA:` directive parsing, `[photo]`/`[audio]` directives, path security (block absolute/~ paths), caption handling (by KeenDragon)
- Media reply prompt injection in `telegram/handlers.ts`: agents receive instructions on `MEDIA:` syntax so outbound media parsing is no longer dead code (by KeenDragon)
- `media_group` batching: messages with same `media_group_id` grouped with 1500ms debounce (by KeenDragon)
- Media note injection: `[media attached: N images]` prefix prepended to inbound text (by KeenDragon)

### Added (v3.1 Tests)
- 55 v3.1 test scenarios in `src/core/bbd-v31-heartbeat-cron-media.test.ts` covering full §4 spec matrix: heartbeat response processing (H1–H4), markup stripping (H5–H6), missing file (H8), activeHours (H9–H10), skip conditions (H7, H11), pool retry (H12), skipWhenBusy (H13), per-agent override (H14), error handling (H15), concurrent guard (H16), cron isolated/delivery (C1–C4), cron main mode (C5–C7), schedule parsing (C8–C11), job CRUD (C12–C14), integration linkage (L1–L7), media outbound security/parsing, media inbound voice/note format (by MintTiger)

### Added (v3.1 Docs)
- `docs/HEARTBEAT-CRON-IMPLEMENTATION-SPEC.md`: executable implementation spec with code snippets, config definitions, 37 test scenarios (by DarkFalcon)
- `docs/V3.1-RELEASE-NOTES.md`: full release notes with architecture decisions and contributor summary (by DarkFalcon)

### Fixed (v3.1)
- Telegram pi_ command registration: `getPiCommands` now uses `pool.findBestMatch()` instead of `pool.getForSession()` for temp session key — fixes commands never appearing in Telegram menu (root cause: DarkFalcon, fix: KeenDragon)
- `refreshPiCommands` retry logic: `commandsRegistered` gate now only set on success, with max 3 retries — previously failed silently on first attempt and never retried (by KeenDragon)
- `getPiCommands` error handling: `.catch(() => [])` replaced with error logging + `null` return to distinguish "no commands" from "fetch failed" (by KeenDragon)
- Telegram `setMyCommands` 100-command limit: added `.slice(0, 50)` truncation — 10 local + 91 pi commands exceeded Telegram API limit, causing silent rejection (by KeenDragon)
- `resolveMainSessionKey` consistency: CronEngine and HeartbeatExecutor now use the same session-router-based resolution, fixing cron main mode events being invisible to heartbeat (found by DarkFalcon, fixed by SwiftQuartz)

### Fixed (pre-existing test failures — by MintTiger)
- `commands.test.ts`: mock missing `getPiCommands` on api object — `refreshPiCommands` threw TypeError during `setupTelegramCommands` (3 tests)
- `server.extensions.test.ts`: FakeRpc missing `sessionKey` property — `rpc.sessionKey !== sessionKey` guard silently dropped all events, producing empty fullText (1 test)
- `server.extensions.test.ts`: FakeRpc event missing `partial` field — `extractPartialText(ame?.partial)` crashed on `JSON.stringify(undefined).slice` (1 test)
- `server.extensions.test.ts`: queue mock missing `clearCollectBuffer` — `handleInterruptMode` threw TypeError (1 test)
- `server.extensions.test.ts`: webchat dispatch test expected enqueue but v3.1 steer mode now injects via `rpc.prompt()` — updated assertion to match steer behavior (1 test)

### Changed (v3.1 — Telegram)
- Thinking blockquote now preserved in final Telegram reply — previously spliced out when text_delta started (by KeenDragon)
- `MEDIA:` reply hint injected after media note when images are received, enabling agents to use outbound media directives (by KeenDragon)
- `skill:xxx` commands collapsed into `/skills` inline keyboard — click to browse, click to run via `dispatch()` (by KeenDragon)
- `/skills` added to LOCAL_COMMANDS and localCommands set (by KeenDragon)

### Added (WebChat — v3.1)
- Session management sidebar in `gw-chat`: collapsible session list (☰ toggle), sorted by last activity, showing message count, relative time, streaming/role badges, per-session delete (by DarkFalcon)
- New session creation: generates unique `agent:{agentId}:webchat:dm:{id}` session keys, resets chat state, auto-refreshes session list after first message (by DarkFalcon)
- Chat header bar: current session title (parsed from session key), agent badge (🤖 for non-main agents), role selector dropdown with live `session.setRole` switching (by DarkFalcon)
- `chat.send` / `chat.abort` now pass explicit `sessionKey` for multi-session support (by DarkFalcon)
- Mobile responsive sidebar: overlay mode with backdrop dismiss, fixed positioning between status bar and bottom nav (by DarkFalcon)

### Added (Discord)
- Discord plugin modular rewrite: `discord/index.ts`, `discord/handlers.ts`, `discord/commands.ts`, `discord/format.ts`, `discord/types.ts` — replaces single-file `discord.ts` (by KeenUnion)
- Streaming message display: `message.edit()` with 500ms throttle, 1800-char cutoff, full reply on completion (by KeenUnion)
- Guild-level slash command registration (instant effect): /new, /status, /compact, /think, /model, /stop, /help — aligned with Telegram command set (by KeenUnion)
- Tool call display in streaming: `→ tool args` format using Discord native markdown (by KeenUnion)
- Thinking display in streaming: blockquote `> 💭` with 300-char truncation (by KeenUnion)
- Plugin loader now supports modular directory layout (`builtin/{name}/index.ts`) alongside single-file (`builtin/{name}.ts`) (by KeenUnion)
- Discord channel config in `pi-gateway.jsonc.example`: token, dmPolicy, guilds, streaming options (by KeenUnion)

### Fixed
- Thinking content (thinking_delta/start/end) no longer leaks into Telegram output; events are logged but not rendered to fullText (by KeenDragon)
- Message duplication: respond() now replaces the last text entry in contentSequence instead of appending, preventing double text (by KeenDragon)
- Telegram editMessageText 429 rate limit: raised default editThrottleMs from 250ms to 1000ms (by KeenDragon)
- Nested Markdown rendering: code blocks and existing HTML tags (blockquote etc.) are protected via placeholders before bold/italic regex processing (by KeenDragon)

### Added
- `/api/metrics` GET endpoint: returns JSON snapshot of pool stats, queue depth, latency percentiles (p50/p95/p99), error counters, subprocess RSS, and 1h ring buffer history (by KeenUnion)
- `MetricsCollector` with `QuantileTracker` (time-window sorted insertion, 1h retention) and `RingBuffer` (fixed array, 10s sampling, 360 points) in `src/core/metrics.ts` (by KeenUnion)
- Subprocess RSS sampling via `ps -o rss=` at 30s intervals with `Promise.all` parallel fetch (by KeenUnion)
- `poolCapacityRejects` counter distinguishing pool-full rejects from queue drops (by KeenUnion + GoldJaguar)
- `ExtensionUIForwarder` in `src/core/extension-ui-forwarder.ts`: WS-forwards `extension_ui_request` to WebChat frontends with TTL 60s, first-win competition, `extension_ui_dismissed` notification for late clients, and reconnect recovery for pending requests (by KeenUnion)
- Extension UI TypeScript schema in `src/core/extension-ui-types.ts`: discriminated unions for select/multiselect/text/editor/confirm/progress, `SelectOption` with value/label/hint, `PendingUIRequest` tracking structure (by KeenUnion)
- `RpcClient.extensionUIHandler` optional callback: `handleExtensionUIRequest` now tries external WS forwarding before falling back to auto-cancel in headless mode (by KeenUnion)
- WS `extension_ui_response` method in `handleWsFrame` for frontend → gateway → RPC response routing (by KeenUnion)
- WS `open` event triggers `extensionUI.resendPending(ws)` for reconnect recovery (by KeenUnion)
- `DeduplicationCache` in `src/core/dedup-cache.ts`: LRU fingerprint cache with configurable size/TTL, fingerprint uses `senderId:channel:hash(text)` to avoid false positives (by SwiftQuartz)
- `PrioritizedWork` type with numeric priority (DM=10, group=5, webhook=3, allowlist=+2), TTL, `summaryLine`, `collectMergedText`, `images`, and `onBeforeCollectWork` callback (by SwiftQuartz)
- `SessionQueue` collect mode: debounce-based message merging (1500ms), async while loop drain, `buildCollectPrompt()` aligned with OpenClaw format, dropped message overflow section (max 5 summaries) (by SwiftQuartz)
- `MessageQueueManager` global pending cap (default 100): cross-session lowest-priority eviction when global limit reached (by SwiftQuartz)
- `PoolWaitingList` in `src/core/pool-waiting-list.ts`: priority-sorted waiting queue with TTL 30s, replaces pool-full throws with graceful backpressure (by SwiftQuartz)
- `RpcPool` waiting list integration: `acquire()` enqueues to waiting list instead of throwing at capacity, `release()` drains highest-priority waiting entry with full session setup (clearEventListeners → newSession → initializeRpcState) (by SwiftQuartz)
- `QueueConfig` in config.ts: centralized queue configuration (maxPerSession, globalMaxPending, collectDebounceMs, poolWaitTtlMs, mode, dropPolicy, dedup, priority) with defaults (by SwiftQuartz)
- Enqueue rate metrics: 10s sliding window in `MessageQueueManager.getStats()` returning msg/sec (by SwiftQuartz)
- `/role` command registered in Telegram menu (LOCAL_COMMANDS), routed through server.ts registered command handler for role switching (by KeenDragon)
- M1 metrics instrumentation: 7 hooks added across `rpc-pool.ts` (spawn/kill/crash/capacityReject), `message-queue.ts` (drop/eviction), and `server.ts` (timeout/messageProcessed/latency) (by GoldJaguar)
- `RpcClient.pid` getter exposes subprocess PID for RSS sampling in metrics (by GoldJaguar)
- P4 Role Switching UX: `/role <name>` command, WS methods `session.listRoles` and `session.setRole`, `listAvailableRoles()` and `setSessionRole()` helpers in server.ts (by GoldJaguar)
- Multi-agent routing design document — 3-layer routing (static binding → prefix → default) + delegate_to_agent tool spec + OpenClaw comparison (docs/MULTI-AGENT-ROUTING-DESIGN.md) (by DarkFalcon)
- Telegram content types gap analysis — inbound/outbound/media-understanding/TTS full comparison with P0-P3 implementation roadmap (docs/TELEGRAM-CONTENT-TYPES-GAP.md) (by DarkFalcon)
- M1 BBD simulation tests in `src/core/bbd-simulation.test.ts` (17 tests): dedup cache (identical/cross-sender/disabled/LRU), queue priority (DM>group>webhook), thinking event filtering (delta/start/end not in fullText, `<think>` tag stripping), editThrottle logic (1000ms default, rapid skip, inflight lock), QuantileTracker (percentiles, expiry eviction), stream text replace-not-append (single text entry, tool+text sequence) (by MintTiger)
- M2 BBD simulation tests in `src/core/bbd-m2-simulation.test.ts` (10 tests): collect mode prompt format, single-message no-merge, multi-message debounce merge, low-priority eviction on queue full, getStats field completeness, DM vs group priority processing, dedup+queue interaction, dropped summary format, collect prompt overflow section, global pending cap cross-session eviction (by MintTiger)
- `buildCollectPrompt()` image marking and `onBeforeCollectWork` callback for collect-mode image concatenation (by SwiftQuartz + GoldJaguar)
- P2 collect mode integration test script: `scripts/test-collect-mode.sh` for validating debounce/merge behavior (by GoldJaguar)
- M4 steer/interrupt message handling: generalized `resolveMessageMode()` for all channels, `handleInterruptMode()` (abort + clearCollectBuffer + redispatch), `handleInjectionMode()` (steer/follow-up via RPC prompt), session-level `messageMode` overrides (by GoldJaguar)
- `MessageQueueManager.clearCollectBuffer(sessionKey)`: clears pending queue, cancels debounce timer, resets droppedSummaries, returns cleared count; `SessionQueue.clearCollectBuffer()` implementation (by SwiftQuartz)
- v3 delegate_to_agent tool schema: `ToolDefinition` with agentId/task/mode/timeoutMs/stream params, validation, and handler interface (by GoldJaguar)
- v3 delegate_to_agent test skeleton: happy path, timeout, agent-not-found, error propagation test cases (by GoldJaguar)
- v3 Config: `AgentsConfig`, `AgentDefinition`, `DelegationConstraints`, `AgentBinding` types for multi-agent routing (by GoldJaguar)
- v3 DelegateExecutor: sync delegation with security constraints (allowlist, maxConcurrent, maxDepth via RPC metadata), RPC pool integration, timeout/error handling, resource cleanup, delegation prompt prefix with conciseness guidance (by GoldJaguar)
- v3 Gateway integration: `delegateExecutor` initialization, `DELEGATE_TO_AGENT_TOOL_NAME` interception in `executeRegisteredTool()`, validation + execution flow (by GoldJaguar)
- v3 DelegationMetrics: `DelegationMetrics` class with count/success/timeout/error/rejected/poolExhausted/avg/p95/active, integrated into `MetricsCollector`, exposed via `/api/metrics` endpoint (by GoldJaguar)
- Lazy pi command registration: per-account `commandsRegistered` flag triggers `refreshPiCommands()` on first real message instead of at init, avoiding virtual sessionKey pool slot leak (by KeenDragon)
- Forward message context: extracts forward_origin/forward_from sender name and prepends `[Forwarded from ...]` to message text (by KeenDragon)
- Non-image document handling: text-based documents (text/*, JSON, XML) are decoded and attached as context; binary files get metadata-only context (by KeenDragon)
- Streaming live updates now use `parse_mode: "HTML"` with `markdownToTelegramHtml()` for both `editMessageText` and initial `sendMessage` (by KeenDragon)
- `escapeHtml()` exported from format.ts for use in handlers (by KeenDragon)

### Changed
- Voice messages now reply directly with "语音消息暂不支持，请发送文字" and return, instead of faking a prompt to the agent (by KeenDragon)
- High-frequency RPC event logs (text_delta, thinking_delta, message_update, partial extracted) downgraded from info to debug (by KeenDragon)
- FEATURE-REALITY-CHECK.md fully updated: streaming reply marked as working (not dead code), added sections for thinking handling, message dedup, slash command dynamic registration (by KeenDragon)
- Webhook `POST /hooks/wake` now returns 429 with JSON body when queue is full instead of silently dropping (by SwiftQuartz)
- `computePriority()` now reads from `config.queue.priority` instead of hardcoded values (by SwiftQuartz)
- `RpcPool.acquire()` no longer throws on capacity — falls back to `PoolWaitingList` with priority-based ordering and TTL (by SwiftQuartz)
- `MessageQueueManager` constructor reads `config.queue.*` for maxPerSession, mode, collectDebounceMs, globalMaxPending (by SwiftQuartz)
- `pi-gateway.jsonc.example` updated with `queue` configuration section (by SwiftQuartz)
- Type fixes for TypeScript compilation: `ImageContent` imports in `server.ts` and `message-queue.ts`, `allImages` type alignment, `ReturnType` syntax fix in `rpc-pool.ts`, `InboundMessage` mock completeness in test files (by GoldJaguar)

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
