# Message Queue Backpressure & Priority Design

> Status: Reviewed | Author: SwiftQuartz | Reviewers: KeenUnion, DarkFalcon, KeenDragon

## Problem

Current `message-queue.ts` has three issues:

1. **No priority** — Pure FIFO, DM and group messages treated equally
2. **No backpressure** — Pool full → `acquire()` throws; queue full → silent drop (webhook path doesn't even check return value)
3. **No message coalescing** — Users sending 3-4 rapid messages each trigger separate RPC prompts

## Design

Three orthogonal layers, each independently useful:

```
Inbound Message
     │
     ▼
┌─────────────────────────┐
│  Layer 0: Dedup         │  Fingerprint: senderId + timestamp + contentHash
│  (per-session)          │  LRU cache 1000 entries, TTL 60s
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Layer 1: Priority      │  Assign numeric priority based on source
│  (session-level)        │  DM=10, group=5, webhook=3, allowlist=+2
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Layer 2: Collect       │  Debounce 1500ms, merge same-session messages
│  (session-level)        │  into single prompt before RPC dispatch
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Layer 3: Backpressure  │  Global cap + pool-full waiting list + TTL
│  (global)               │  Graceful degradation instead of throw/drop
└─────────────────────────┘
```

## Layer 1: Priority Queue

### Priority Assignment

```typescript
interface PrioritizedWork {
  work: QueuedWork;
  priority: number;       // higher = more urgent
  enqueuedAt: number;     // Date.now()
  ttl: number;            // ms, 0 = no expiry
  source?: MessageSource; // for collect grouping
  text?: string;          // original text for collect merge
  summaryLine?: string;   // human-readable summary for drop policy (fallback: text.slice(0,140))
}

function computePriority(msg: InboundMessage, config: Config): number {
  let p = 5; // default: group
  if (msg.source.chatType === "dm") p = 10;
  if (msg.source.channel === "webhook") p = 3;
  if (isAllowlisted(msg.source.senderId, config)) p += 2;
  return p;
}
```

### SessionQueue Changes

Replace `QueuedWork[]` with sorted insertion (array is small, ≤15 items, sort is fine):

```typescript
class SessionQueue {
  private queue: PrioritizedWork[] = [];

  enqueue(item: PrioritizedWork): boolean {
    if (this.queue.length >= this.maxSize) {
      // Evict lowest priority item if new item has higher priority
      const lowest = this.queue.reduce((min, x) => x.priority < min.priority ? x : min);
      if (item.priority > lowest.priority) {
        this.queue.splice(this.queue.indexOf(lowest), 1);
        this.onEvicted(lowest); // notify caller for user feedback
      } else {
        return false; // new item is lowest priority, reject
      }
    }
    // Insert sorted by priority desc, FIFO within same priority
    const idx = this.queue.findIndex(x => x.priority < item.priority);
    this.queue.splice(idx === -1 ? this.queue.length : idx, 0, item);
    this.scheduleProcess();
    return true;
  }
}
```

## Layer 2: Collect Mode

Reference: OpenClaw `buildCollectPrompt()` + `waitForQueueDebounce()`.

### Debounce Window

After enqueue, don't process immediately. Wait `collectDebounceMs` (default: 1500ms) of silence before draining:

```typescript
class SessionQueue {
  private collectTimer: ReturnType<typeof setTimeout> | null = null;
  private collectDebounceMs = 1500;
  private mode: "collect" | "individual" | "interrupt" = "collect"; // v1: collect + individual

  private scheduleProcess(): void {
    if (this.processing) return;
    // Reset debounce timer on each new message
    if (this.collectTimer) clearTimeout(this.collectTimer);
    this.collectTimer = setTimeout(() => {
      this.collectTimer = null;
      this.drainCollected();
    }, this.collectDebounceMs);
  }
}
```

### Merge Logic

When debounce fires, take all queued items and merge into single prompt.
Uses async while loop (not recursion) to avoid stack overflow under high-frequency enqueue:

```typescript
private async drainCollected(): Promise<void> {
  this.processing = true;
  try {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.queue.length);

      if (batch.length === 1) {
        await this.executeSingle(batch[0]);
      } else {
        // Assert same channel (defensive — session key encodes channel)
        console.assert(batch.every(b => b.source?.channel === batch[0].source?.channel));
        const merged = this.buildCollectPrompt(batch);
        await this.executeMerged(merged, batch);
      }
      // Loop continues if new items arrived during execution
    }
  } finally {
    this.processing = false;
  }
}

private buildCollectPrompt(items: PrioritizedWork[]): string {
  const lines = ["[Queued messages while agent was busy]", ""];
  for (let i = 0; i < items.length; i++) {
    lines.push("---");
    lines.push(`Queued #${i + 1}`);
    lines.push(items[i].text ?? "(no text)");
    lines.push("");
  }
  return lines.join("\n");
}
```

### Drop Policy: Summarize

When queue is full and eviction happens, summarize the dropped message:

```typescript
private onEvicted(item: PrioritizedWork): void {
  const summary = item.summaryLine ?? (item.text ?? "").slice(0, 140);
  const ellipsis = !item.summaryLine && (item.text?.length ?? 0) > 140 ? "..." : "";
  this.droppedSummaries.push(`[Dropped] ${summary}${ellipsis}`);
  // Cap at 5 summaries
  if (this.droppedSummaries.length > 5) {
    const overflow = this.droppedSummaries.length - 5;
    this.droppedSummaries = [
      ...this.droppedSummaries.slice(-5),
      `(and ${overflow} more dropped)`,
    ];
  }
  // Append to next collect prompt as overflow section
}
```

### Edge Cases

- **Cross-channel in same session**: Won't happen — session key already encodes channel. Defensive assert in drainCollected.
- **New message during drain**: Handled by async while loop — drain checks queue again after each batch execution
- **Merged metadata**: `respond`/`setTyping`/`onStreamDelta` use last item (reflects user's latest intent). `channel`/`senderId` use first non-empty value.
- **Dropped summaries cap**: Max 5 summaries in overflow section. Beyond that: `(and N more dropped)`

## Layer 3: Global Backpressure

### Pool-Full Waiting List

Replace `throw Error("RPC pool at capacity")` with a waiting queue:

```typescript
// In MessageQueueManager or a new PoolBackpressure class
interface WaitingEntry {
  sessionKey: SessionKey;
  resolve: (client: RpcClient) => void;
  reject: (error: Error) => void;
  priority: number;
  enqueuedAt: number;
  ttlMs: number; // default: 30000
}

class PoolWaitingList {
  private waiting: WaitingEntry[] = []; // sorted by priority desc

  enqueue(entry: WaitingEntry): void {
    const idx = this.waiting.findIndex(x => x.priority < entry.priority);
    this.waiting.splice(idx === -1 ? this.waiting.length : idx, 0, entry);
    this.startTtlTimer(entry);
  }

  // Called by pool when a process becomes idle
  drain(client: RpcClient): boolean {
    // Expire stale entries
    this.expireStale();
    if (this.waiting.length === 0) return false;
    const next = this.waiting.shift()!;
    next.resolve(client);
    return true;
  }

  private startTtlTimer(entry: WaitingEntry): void {
    setTimeout(() => {
      const idx = this.waiting.indexOf(entry);
      if (idx !== -1) {
        this.waiting.splice(idx, 1);
        entry.reject(new Error("Queue timeout — 服务繁忙请稍后"));
      }
    }, entry.ttlMs);
  }
}
```

### Global Pending Cap

```typescript
class MessageQueueManager {
  private globalMaxPending = 100; // configurable

  enqueue(sessionKey: SessionKey, item: PrioritizedWork): boolean {
    const totalPending = this.getTotalPending();
    if (totalPending >= this.globalMaxPending) {
      // Find lowest priority item across all sessions, evict if new item is higher
      const lowest = this.findGlobalLowestPriority();
      if (lowest && item.priority > lowest.item.priority) {
        lowest.queue.evict(lowest.item);
        // fall through to enqueue
      } else {
        return false;
      }
    }
    return this.getOrCreateQueue(sessionKey).enqueue(item);
  }
}
```

## Bug Fix: Webhook Enqueue

```typescript
// server.ts line ~1220 — BEFORE
this.queue.enqueue(sessionKey, async () => { ... });
return Response.json({ ok: true, sessionKey });

// AFTER
const enqueued = this.queue.enqueue(sessionKey, {
  work: async () => { ... },
  priority: 3, // webhook baseline
  enqueuedAt: Date.now(),
  ttl: 30000,
});
if (!enqueued) {
  return Response.json({ error: "Queue full", sessionKey }, { status: 429 });
}
return Response.json({ ok: true, sessionKey });
```

## Configuration

```jsonc
// pi-gateway.jsonc
{
  "queue": {
    "maxPerSession": 15,
    "globalMaxPending": 100,
    "collectDebounceMs": 1500,
    "poolWaitTtlMs": 30000,
    "dropPolicy": "summarize",  // "summarize" | "old" | "new"
    "mode": "collect",          // "collect" | "individual" | "interrupt" (v1: collect + individual)
    "dedup": {
      "enabled": true,
      "mode": "message-id",    // "message-id" | "prompt" | "none"
      "cacheSize": 1000,
      "ttlMs": 60000
    },
    "priority": {
      "dm": 10,
      "group": 5,
      "webhook": 3,
      "allowlistBonus": 2
    }
  }
}
```

## Deduplication (Layer 0)

Fingerprint: `senderId + timestamp + hash(text.slice(0, 64))`. LRU cache with configurable size and TTL.

```typescript
class DeduplicationCache {
  private cache = new Map<string, number>(); // fingerprint → timestamp
  private maxSize = 1000;
  private ttlMs = 60000;

  isDuplicate(msg: InboundMessage): boolean {
    const fp = this.fingerprint(msg);
    const existing = this.cache.get(fp);
    if (existing && Date.now() - existing < this.ttlMs) return true;
    this.cache.set(fp, Date.now());
    this.evictStale();
    return false;
  }

  private fingerprint(msg: InboundMessage): string {
    const content = msg.text.slice(0, 64);
    const hash = Bun.hash(content).toString(36);
    return `${msg.source.senderId}:${msg.source.channel}:${hash}`;
  }

  private evictStale(): void {
    if (this.cache.size <= this.maxSize) return;
    const now = Date.now();
    for (const [key, ts] of this.cache) {
      if (now - ts > this.ttlMs || this.cache.size > this.maxSize) {
        this.cache.delete(key);
      }
    }
  }
}
```

## Pool Drain Integration

When `pool.release()` returns a process to idle, check the waiting list:

```
pool.release(sessionKey)
  → client.sessionKey = null
  → client.lastActivity = Date.now()
  → waitingList.drain(client)
    → if waiting entry exists: resolve(client), re-bind to new session
    → else: client stays in idle pool
```

This integration point lives in `rpc-pool.ts` `release()` method.

## Migration

- `QueuedWork` type alias kept for backward compat, wraps into `PrioritizedWork` with default priority=5
- `enqueue(sessionKey, work)` signature kept, overloaded with `enqueue(sessionKey, PrioritizedWork)`
- Existing behavior preserved when no priority/collect config is set

## Metrics Integration (#1)

New metrics exposed via `/api/metrics`:
- `queue.totalPending` — global pending count
- `queue.perSession[].pending` — per-session pending
- `queue.enqueueRate` — enqueue/s (sliding window)
- `queue.dropCount` — total drops since start
- `queue.collectMergeCount` — total collect merges
- `queue.poolWaitingCount` — current pool waiting list size
- `queue.avgWaitTime` — average time in pool waiting list

## Implementation Order

1. Bug fix: webhook enqueue return value check ✅
2. `PrioritizedWork` type + `summaryLine` field + `computePriority()` in dispatch layer
3. SessionQueue sorted insertion + eviction + `onEvicted` callback
4. Deduplication cache (Layer 0)
5. Collect mode (debounce 1500ms + async while loop drain + merge)
6. PoolWaitingList + `pool.release()` drain integration
7. Global pending cap
8. Config integration (`queue.*` section)
9. Metrics hooks (reuse RingBuffer from metrics.ts for enqueueRate)
