# pi-gateway v2 Release Notes

**Release Date:** 2026-02-11
**BBD Test Results:** 56/56 pass (M1: 17, M2: 10, M3: 15, M4: 14)

---

## Overview

v2 delivers production-grade observability, message queue backpressure, Extension UI transparency, and session steering — transforming pi-gateway from a functional prototype into a reliable multi-channel AI gateway.

## Milestones

### M1 — Observability & Metrics ✅

`GET /api/metrics` returns a JSON snapshot covering:

- **Pool stats:** active/idle/total processes, per-process RSS (sampled every 30s via `Promise.all`)
- **Queue depth:** per-session pending, global pending, drop count, collect merge count, enqueue rate (10s sliding window)
- **Latency:** p50/p95/p99 via `QuantileTracker` (1h time-window, sorted insertion)
- **Counters:** processSpawns, processKills, processCrashes, rpcTimeouts, queueDrops, poolCapacityRejects, messagesProcessed, errorsTotal
- **History:** 1h ring buffer (10s sampling, 360 data points)

No external dependencies (no OTel). Target users are solo devs and small teams.

### M2 — Message Queue Backpressure & Priority ✅

Four-layer architecture, each layer orthogonal and independently useful:

**Layer 1 — Deduplication** (`src/core/dedup-cache.ts`)
- LRU fingerprint cache with configurable size (default 1000) and TTL (default 60s)
- Fingerprint: `${senderId}:${channel}:${Bun.hash(text.slice(0,256)).toString(36)}`
- Toggled via `config.queue.dedup.enabled`

**Layer 2 — Priority**
- Numeric priority: DM=10, group=5, webhook=3, allowlist bonus=+2
- `SessionQueue` maintains sorted insertion order
- Eviction: when queue full, lowest-priority item evicted if new item has higher priority
- `computePriority()` reads from `config.queue.priority`

**Layer 3 — Collect Mode**
- Debounce-based message merging (default 1500ms)
- Async while loop drain (not recursive — prevents stack overflow)
- `buildCollectPrompt()` generates merged prompt with `Queued #N` format, image annotation `(with image)`
- Dropped message overflow section (max 5 summaries via `summaryLine`)
- `onBeforeCollectWork` callback: triggers typing + concatenates images from batch

**Layer 4 — Backpressure**
- `PoolWaitingList` (`src/core/pool-waiting-list.ts`): priority-sorted waiting queue with TTL (default 30s)
- Replaces pool-full throws with graceful backpressure
- `RpcPool.release()` drains highest-priority waiting entry with full session setup
- Global pending cap (default 100): cross-session lowest-priority eviction
- Webhook returns 429 JSON when queue full

**Configuration:** All values centralized under `config.queue` with sensible defaults.

### M3 — Extension UI WS Transparency ✅

`ExtensionUIForwarder` (`src/core/extension-ui-forwarder.ts`):
- Forwards `extension_ui_request` from RPC to WebChat frontends via WebSocket
- TTL 60s per request to prevent hangs
- First-win competition when multiple frontends connected
- `extension_ui_dismissed` notification for late-connecting clients
- Reconnect recovery: `resendPending(ws)` on WS open event
- Fallback: auto-cancel in headless mode when no frontend connected

Extension UI TypeScript schema (`src/core/extension-ui-types.ts`):
- Discriminated unions for select/multiselect/text/editor/confirm/progress
- `SelectOption` with value/label/hint, string-to-object normalization
- initialValue/initialValues for pre-selection

### M4 — Steer/Interrupt ✅

Three message modes configurable per session (`config.agent.messageMode`):

| Mode | Behavior |
|------|----------|
| `steer` | New message injected into running session without abort |
| `follow-up` | Queued until current run completes, then processed |
| `interrupt` | Abort current run → clear collect buffer → redispatch new message |

- `/queue [mode]` Telegram command for runtime mode switching
- `clearCollectBuffer(sessionKey)` wipes pending queue + cancels debounce timer
- Interrupt flow: clear buffer → abort RPC → reset isStreaming → re-enqueue

## Bug Fixes (P0)

- **Thinking leak:** thinking_delta/start/end events no longer appear in Telegram output
- **Message duplication:** respond() replaces last text entry instead of appending
- **Telegram 429:** editThrottleMs raised from 250ms to 1000ms
- **Markdown nesting:** code blocks and HTML tags protected via placeholders before bold/italic processing

## Configuration

All new configuration lives under `config.queue` and `config.delegation`:

```jsonc
{
  "queue": {
    "maxPerSession": 15,
    "globalMaxPending": 100,
    "collectDebounceMs": 1500,
    "poolWaitTtlMs": 30000,
    "mode": "collect",
    "dropPolicy": "summarize",
    "dedup": { "enabled": true, "cacheSize": 1000, "ttlMs": 60000 },
    "priority": { "dm": 10, "group": 5, "webhook": 3, "allowlistBonus": 2 }
  },
  "delegation": {
    "timeoutMs": 120000,
    "maxTimeoutMs": 600000,
    "onTimeout": "abort",
    "maxDepth": 1,
    "maxConcurrent": 2
  }
}
```

All values have defaults. Omitting the entire section preserves v1 behavior.

## API Changes

| Endpoint | Change |
|----------|--------|
| `GET /api/metrics` | New. Returns JSON metrics snapshot |
| `POST /hooks/wake` | Now returns 429 with JSON body when queue full |
| WS `extension_ui_response` | New. Frontend → gateway → RPC response routing |
| WS `extension_ui_request` | New. Gateway → frontend forwarding |

## New Files

| File | Purpose |
|------|---------|
| `src/core/dedup-cache.ts` | LRU deduplication cache |
| `src/core/pool-waiting-list.ts` | Priority-sorted pool waiting queue |
| `src/core/extension-ui-forwarder.ts` | WS Extension UI forwarding |
| `src/core/extension-ui-types.ts` | Extension UI TypeScript schema |
| `src/core/metrics.ts` | MetricsCollector, QuantileTracker, RingBuffer |
| `src/core/delegate-metrics.ts` | Delegation-specific metrics (v3 prep) |

## Backward Compatibility

- No breaking changes to existing config, APIs, or plugin interfaces
- Omitting `queue`/`delegation` config sections preserves v1 behavior
- Existing Telegram/Discord/WebChat plugins work without modification

## Contributors

| Agent | Contribution |
|-------|-------------|
| KeenUnion | Metrics endpoint, Extension UI types + forwarder, rpc-client integration |
| SwiftQuartz | P2 queue backpressure (9 steps), P5 capability-profile, config centralization |
| KeenDragon | P0 bug fixes, Telegram commands, /role registration, content type handling |
| GoldJaguar | Metrics instrumentation, M4 steer/interrupt, role switching UX |
| DarkFalcon | Design docs, OpenClaw architecture review |
| MintTiger | 56-item BBD test suite (M1-M4) |
| pi-zero | Product management, PRD, coordination |

---

*Based on PRD-GATEWAY-V2.md. See CHANGELOG.md for detailed per-commit history.*
