# Changelog

## [Unreleased] - v3.1 - 2026-02-11

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
