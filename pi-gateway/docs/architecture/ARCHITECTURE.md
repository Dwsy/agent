# pi-gateway Architecture

> TL;DR: Single-port HTTP+WS gateway that routes messages from Telegram/Discord/WebChat through a plugin system, session router, and priority queue into an RPC pool of isolated pi agent processes.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     pi-gateway (Bun)                        │
│                    single port :18789                       │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Telegram  │  │ Discord  │  │ WebChat  │   Channel Plugins│
│  │  Plugin   │  │  Plugin  │  │  Plugin  │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│       │              │              │                        │
│       └──────────────┼──────────────┘                       │
│                      ▼                                      │
│              ┌───────────────┐                               │
│              │ Session Router │  → session key resolution    │
│              │                │  → agent routing             │
│              │                │  → role mapping              │
│              └───────┬───────┘                               │
│                      ▼                                      │
│              ┌───────────────┐                               │
│              │ Message Queue  │  → priority (DM=10,group=5) │
│              │                │  → collect/dedup/backpressure│
│              │                │  → eviction on full          │
│              └───────┬───────┘                               │
│                      ▼                                      │
│              ┌───────────────┐                               │
│              │   RPC Pool    │  → min/max process management│
│              │                │  → capability profile match  │
│              │                │  → idle reuse / spawn new    │
│              └───┬───┬───┬───┘                               │
│                  │   │   │                                   │
│                  ▼   ▼   ▼                                  │
│              ┌───┐ ┌───┐ ┌───┐                               │
│              │pi │ │pi │ │pi │   Isolated pi agent processes │
│              │RPC│ │RPC│ │RPC│   (each with own session)     │
│              └───┘ └───┘ └───┘                               │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Heartbeat   │  │    Cron      │  │   Metrics    │      │
│  │  Executor    │  │   Engine     │  │  Collector   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Core Module Responsibilities

| Module | File | One-liner |
|---|---|---|
| Server | `server.ts` | HTTP+WS multiplexer, route dispatch, lifecycle management |
| Config | `core/config.ts` | JSONC config loading, validation, legacy migration, hot-reload |
| RPC Pool | `core/rpc-pool.ts` | Process pool with capability-based matching, min/max scaling, idle eviction |
| RPC Client | `core/rpc-client.ts` | Single pi process wrapper — spawn, message, stream events, abort |
| Session Router | `core/session-router.ts` | Session key resolution (channel+scope+id), agent routing, role mapping |
| Message Queue | `core/message-queue.ts` | Per-session priority queue with collect mode, dedup, backpressure, eviction |
| Capability Profile | `core/capability-profile.ts` | Build pi CLI args from config (model, tools, extensions, system prompt), signature for reuse matching |
| System Prompts | `core/system-prompts.ts` | Conditional gateway prompt injection (heartbeat/cron/media protocol docs) |
| Heartbeat | `core/heartbeat-executor.ts` | Periodic agent wake-up, HEARTBEAT_OK suppression, bounded retry, skipWhenBusy |
| Cron | `core/cron.ts` | Job scheduling (cron/every/at), isolated+main mode, deleteAfterRun |
| Cron API | `core/cron-api.ts` | HTTP CRUD for cron jobs |
| System Events | `core/system-events.ts` | In-memory event queue for cron→heartbeat injection |
| Media Security | `core/media-security.ts` | 7-layer path validation (null byte, scheme, absolute, home, traversal, resolve, symlink) |
| Media Token | `core/media-token.ts` | HMAC-SHA256 signed URLs for media serving |
| Metrics | `core/metrics.ts` | Pool/queue/latency/delegation quantile tracking, `/api/metrics` endpoint |
| Delegate | `core/delegate-executor.ts` | Cross-agent delegation (sync mode, depth-limited) |
| Session Store | `core/session-store.ts` | Session metadata persistence |
| Dedup Cache | `core/dedup-cache.ts` | Message deduplication via senderId:channel:hash |
| Pool Waiting List | `core/pool-waiting-list.ts` | Backpressure queue when all RPC slots are busy |
| Transcript Logger | `core/transcript-logger.ts` | Conversation logging |
| Plugin Loader | `plugins/loader.ts` | Plugin discovery, manifest validation, lifecycle |
| Plugin Types | `plugins/types.ts` | ChannelPlugin, ToolPlugin, GatewayPluginApi interfaces |

## Request Flow (Telegram DM Example)

```
1. Telegram webhook/poll → bot-handlers.ts
2. Extract message text, media, sender info
3. Media? → download + transcribe (Groq Whisper) + inject [media attached] note
4. resolveAgentId(source, config) → agent ID
5. resolveSessionKey(source, config) → "agent:{agentId}:telegram:dm:{userId}"
6. buildCapabilityProfile(config, role, cwd) → args with --append-system-prompt
7. messageQueue.enqueue(sessionKey, work, priority=10)
8. Queue drains → rpcPool.acquire(sessionKey, profile)
   - findBestMatch: reuse idle process with matching hardSignature + superset softResources
   - or spawn new: Bun.spawn([piPath, ...profile.args])
9. rpcClient.promptAndCollect(message, timeout)
10. Stream events → Telegram editMessageText (1s throttle)
11. Final response → Telegram sendMessage
12. rpcPool.release(sessionKey)
```

## Configuration System

Config loaded from `pi-gateway.jsonc` (JSONC with comments). Key sections:

| Section | Interface | Purpose |
|---|---|---|
| `gateway` | `GatewayConfig` | Port, bind address, auth (token/password) |
| `agent` | `AgentConfig` | Model, thinking level, tools, extensions, skills, pool settings, timeout |
| `agent.pool` | `AgentPoolConfig` | min/max processes, idle timeout |
| `agent.gatewayPrompts` | `GatewayPromptsConfig` | Override heartbeat/cron/media prompt injection |
| `session` | `SessionConfig` | DM scope (main/per-peer/per-channel-peer) |
| `channels.telegram` | `TelegramChannelConfig` | Bot token, DM policy, allowlist, media limits, stream mode |
| `channels.discord` | `DiscordChannelConfig` | Bot token, guild configs, DM settings |
| `heartbeat` | `HeartbeatConfig` | Enabled, interval, retries, activeHours, skipWhenBusy |
| `cron` | `CronConfig` | Enabled, jobs array (schedule, task, agentId, mode) |
| `queue` | `QueueConfig` | Max per session, global cap, collect debounce, drop policy |
| `roles` | `RolesConfig` | Workspace dirs, capability overrides per role |
| `plugins` | `PluginsConfig` | Extra plugin dirs, disabled list |
| `hooks` | `HooksConfig` | Webhook enabled, token |
| `logging` | `LoggingConfig` | File logging, level |

## Key Architectural Decisions

### RPC Process Isolation (vs OpenClaw Embedded Runner)

pi-gateway's defining architectural choice. Each pi agent runs as a separate OS process, communicating via JSON-RPC over stdio.

| Aspect | pi-gateway (RPC) | OpenClaw (Embedded) |
|---|---|---|
| Isolation | Process-level (crash one, others survive) | Same process (crash = gateway crash) |
| Memory | Each process has own heap | Shared heap, risk of leaks |
| Scaling | Pool min/max with capability matching | Single process, subagent spawn |
| Complexity | Higher (IPC, pool management) | Lower (direct function calls) |
| Security | Natural sandbox per process | Needs explicit sandboxing |

### Capability Profile Matching

RPC pool reuses processes based on capability signatures:
- **Hard signature**: role + cwd + tools + system prompt + env (must match exactly)
- **Soft resources**: skills, extensions, prompt templates (superset match OK)

This avoids spawning new processes when an idle one already has the right capabilities.

### Message Queue Priority

```
DM messages:    priority 10 (highest)
Group messages: priority 5
Webhooks:       priority 3
```

Queue evicts lowest-priority items when full. Collect mode batches rapid messages with configurable debounce.

### System Prompt Injection

Gateway conditionally injects protocol documentation into agent system prompts:
- Heartbeat protocol (HEARTBEAT_OK semantics) — when `heartbeat.enabled`
- Cron event format ([CRON:{id}]) — when `cron.enabled`
- MEDIA reply syntax — when any channel is active

Injected via `--append-system-prompt` CLI flag, merged with user's `appendSystemPrompt` config.

## Version Evolution

| Version | Date | Theme | Tests | Key Additions |
|---|---|---|---|---|
| 0.1–0.5 | 2026-02-07~08 | Foundation | — | HTTP+WS server, Telegram/Discord plugins, RPC pool, config system |
| v3.0 | 2026-02-11 | Routing + Delegation | 151 | Session router, multi-agent routing, delegate-to-agent, slash commands |
| v3.1 | 2026-02-11 | Automation | 240 | Heartbeat executor, cron engine (isolated+main), system events queue, Telegram media pipeline |
| v3.2 | 2026-02-11 | Operational Maturity | 305 | System prompt injection, cron CLI (HTTP/WS/slash), WebChat images (signed URLs), media path security |

## File Organization

```
src/
├── server.ts              # Entry point — HTTP+WS multiplexer
├── core/                  # Core modules (config, RPC, queue, routing, security)
├── plugins/
│   ├── builtin/
│   │   ├── telegram/      # Telegram channel plugin
│   │   ├── discord/       # Discord channel plugin
│   │   └── webchat.ts     # WebChat channel plugin
│   ├── loader.ts          # Plugin discovery + lifecycle
│   └── types.ts           # Plugin interfaces
└── _web-assets.ts         # Embedded WebChat frontend (build-time)

docs/
├── architecture/          # Architecture documentation (this directory)
├── PRD-GATEWAY-*.md       # Product requirement documents
├── *-DESIGN.md            # Feature design documents
├── *-SPEC.md              # Implementation specifications
└── *-RELEASE-NOTES.md     # Release notes
```

## Related Documents

- [PRD v3.2](../PRD-GATEWAY-V32.md) — Current release requirements
- [Multi-Agent Routing Design](../MULTI-AGENT-ROUTING-DESIGN.md) — Three-layer routing architecture
- [Delegate-to-Agent Design](../DELEGATE-TO-AGENT-DESIGN.md) — Cross-agent delegation
- [Heartbeat/Cron Design](../HEARTBEAT-CRON-DESIGN.md) — Automation subsystem
- [System Prompt Injection Spec](../SYSTEM-PROMPT-INJECTION-SPEC.md) — Protocol-aware prompt injection
- [Message Queue Backpressure Design](../MESSAGE-QUEUE-BACKPRESSURE-DESIGN.md) — Queue architecture
