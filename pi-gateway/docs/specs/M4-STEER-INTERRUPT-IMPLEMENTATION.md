# M4 Steer/Interrupt Implementation Plan

> Status: Draft | Author: GoldJaguar | Date: 2026-02-11

---

## 1. Current State Analysis

### Existing Implementation (Telegram-only)
```typescript
// dispatch() method already has mode handling for Telegram:
if (session?.isStreaming && rpc) {
  const mode = this.resolveTelegramMessageMode(sessionKey, msg.source.accountId);
  
  if (mode === "interrupt") {
    await rpc.abort();
  } else {
    const rpcMode = mode === "follow-up" ? "followUp" : "steer";
    await rpc.prompt(msg.text, msg.images, rpcMode);
    return;
  }
}
```

### Problems
1. **Telegram-only**: Mode resolution only works for Telegram channel
2. **No queue cleanup**: Interrupt mode doesn't clear SessionQueue/collect buffer
3. **Config fragmentation**: `messageMode` only in `TelegramProviderConfig`

---

## 2. Implementation Plan

### Step 1: Generalize Config

Add `messageMode` to general config (fallback for all channels):

```typescript
// config.ts
export interface Config {
  // ... existing fields
  agent: AgentConfig & {
    // ... existing fields
    messageMode?: "steer" | "follow-up" | "interrupt"; // Default for all channels
  };
}

// Channel configs keep their own messageMode for override
export interface TelegramProviderConfig {
  // ... existing fields
  messageMode?: "steer" | "follow-up" | "interrupt"; // Overrides global default
}
```

### Step 2: Generalize Mode Resolution

```typescript
// server.ts
private resolveMessageMode(
  sessionKey: SessionKey,
  source: MessageSource
): "steer" | "follow-up" | "interrupt" {
  // Channel-specific override first
  if (source.channel === "telegram") {
    const accountCfg = source.accountId 
      ? this.config.channels.telegram?.accounts?.[source.accountId]
      : undefined;
    const accountMode = accountCfg?.messageMode;
    const channelMode = this.config.channels.telegram?.messageMode;
    return accountMode ?? channelMode ?? this.config.agent.messageMode ?? "steer";
  }
  
  // Other channels: use global default
  return this.config.agent.messageMode ?? "steer";
}
```

### Step 3: Refactor Dispatch with Queue Cleanup

```typescript
async dispatch(msg: InboundMessage): Promise<void> {
  // Layer 0: Deduplication
  if (this.config.queue.dedup.enabled && this.dedup.isDuplicate(msg)) {
    return;
  }

  await this.registry.hooks.dispatch("message_received", { message: msg });

  const { sessionKey, source } = msg;
  const session = this.sessions.get(sessionKey);
  const rpc = this.pool.getForSession(sessionKey);

  // Check if session is active and we should handle injection/interrupt
  if (session?.isStreaming && rpc) {
    const mode = this.resolveMessageMode(sessionKey, source);

    if (mode === "interrupt") {
      // INTERRUPT MODE: abort current run + clear queue + re-dispatch
      await this.handleInterruptMode(sessionKey, rpc, msg);
      return;
    } else {
      // STEER/FOLLOW-UP MODE: inject message into active run
      const handled = await this.handleInjectionMode(sessionKey, rpc, msg, mode);
      if (handled) return;
    }
  }

  // Normal enqueue flow (no active streaming)
  await this.enqueueMessage(msg);
}

private async handleInterruptMode(
  sessionKey: SessionKey,
  rpc: RpcClient,
  msg: InboundMessage
): Promise<void> {
  // 1. Abort current RPC run
  try {
    await rpc.abort();
    this.log.info(`[INTERRUPT] ${sessionKey}: RPC abort sent`);
  } catch (err: any) {
    this.log.warn(`[INTERRUPT] ${sessionKey}: Failed to abort RPC: ${err?.message}`);
  }

  // 2. Clear SessionQueue (remove pending items)
  // TODO: SwiftQuartz provides clearSessionQueue(sessionKey) interface
  const cleared = await this.queue.clearSession(sessionKey);
  this.log.info(`[INTERRUPT] ${sessionKey}: Cleared ${cleared} pending items from queue`);

  // 3. Clear collect buffer (if in collect mode)
  // TODO: SwiftQuartz provides clearCollectBuffer(sessionKey) interface
  const bufferCleared = await this.queue.clearCollectBuffer?.(sessionKey) ?? 0;
  if (bufferCleared > 0) {
    this.log.info(`[INTERRUPT] ${sessionKey}: Cleared ${bufferCleared} items from collect buffer`);
  }

  // 4. Reset session state
  const session = this.sessions.get(sessionKey);
  if (session) {
    session.isStreaming = false;
  }

  // 5. Re-dispatch as new message (will enqueue normally)
  this.log.info(`[INTERRUPT] ${sessionKey}: Re-dispatching message after interrupt`);
  await this.enqueueMessage(msg);
}

private async handleInjectionMode(
  sessionKey: SessionKey,
  rpc: RpcClient,
  msg: InboundMessage,
  mode: "steer" | "follow-up"
): Promise<boolean> {
  const rpcMode = mode === "follow-up" ? "followUp" : "steer";
  
  this.transcripts.logMeta(sessionKey, "inbound_injected", {
    mode,
    textLen: msg.text.length,
    hasImages: (msg.images?.length ?? 0) > 0,
  });

  try {
    await rpc.prompt(msg.text, msg.images, rpcMode);
    this.log.info(`[INJECT] ${sessionKey}: Message injected with mode=${mode}`);
    return true;
  } catch (err: any) {
    this.log.warn(`[INJECT] ${sessionKey}: Failed to inject: ${err?.message}`);
    return false;
  }
}

private async enqueueMessage(msg: InboundMessage): Promise<void> {
  // Existing enqueue logic (unchanged)
  const item: PrioritizedWork = {
    work: async () => { await this.processMessage(msg, item); },
    priority: this.computePriority(msg),
    enqueuedAt: Date.now(),
    ttl: 0,
    source: msg.source,
    text: msg.text,
    summaryLine: msg.text.slice(0, 140) || undefined,
    images: msg.images,
    onBeforeCollectWork: async (batch) => {
      // ... existing callback
    },
  };
  // ... rest of enqueue logic
}
```

### Step 4: SwiftQuartz Interface

SwiftQuartz needs to provide:

```typescript
// message-queue.ts
export class MessageQueueManager {
  // ... existing methods

  /**
   * Clear all pending items for a session.
   * Returns number of items cleared.
   */
  async clearSession(sessionKey: SessionKey): Promise<number> {
    const queue = this.queues.get(sessionKey);
    if (!queue) return 0;
    
    const pending = queue.pending;
    // Remove all items (they'll be dropped)
    while (!queue.isEmpty) {
      // Evict items
    }
    return pending;
  }

  /**
   * Clear collect buffer for a session.
   * Returns number of items cleared from buffer.
   */
  async clearCollectBuffer(sessionKey: SessionKey): Promise<number> {
    // Implementation depends on collect buffer structure
    // Called by interrupt mode to discard buffered messages
    return 0;
  }
}
```

---

## 3. Testing Plan

### Unit Tests
```typescript
// tests/steer-interrupt.test.ts
describe("M4: steer/interrupt modes", () => {
  test("steer mode: injects message into active run", async () => {
    // Setup active session
    // Send message with mode=steer
    // Assert rpc.prompt() called with "steer"
  });

  test("follow-up mode: injects message with followUp behavior", async () => {
    // Setup active session
    // Send message with mode=follow-up
    // Assert rpc.prompt() called with "followUp"
  });

  test("interrupt mode: aborts, clears queue, re-dispatches", async () => {
    // Setup active session with queued messages
    // Send message with mode=interrupt
    // Assert rpc.abort() called
    // Assert queue.clearSession() called
    // Assert message re-enqueued
  });
});
```

### Integration Tests
```bash
# WebSocket test
echo '{"type":"req","id":"1","method":"chat.send","params":{"text":"test","mode":"interrupt"}}' | websocat ws://localhost:52134/ws

# Telegram test
# Set messageMode: "interrupt" in config
# Send message while agent is running
# Verify abort + new response
```

---

## 4. Implementation Order

| Step | Task | File | Estimated Time |
|------|------|------|----------------|
| 1 | Add messageMode to global config | `config.ts` | 15min |
| 2 | Generalize resolveMessageMode | `server.ts` | 30min |
| 3 | Refactor dispatch with mode handling | `server.ts` | 1h |
| 4 | Implement interrupt mode (abort + cleanup) | `server.ts` | 1h |
| 5 | SwiftQuartz: clearSession/clearCollectBuffer | `message-queue.ts` | 30min |
| 6 | Update example config | `pi-gateway.jsonc.example` | 15min |
| 7 | Write tests | `tests/steer-interrupt.test.ts` | 1h |

Total: ~4.5 hours

---

## 5. Open Questions

1. **Collect buffer cleanup**: Should cleared messages be logged as "dropped" or silently discarded?
2. **Hook integration**: Should we dispatch `message_interrupted` hook for observability?
3. **Metrics**: Need `incInterruptCount()` / `incSteerCount()` metrics?

---

*Ready for implementation. Waiting for SwiftQuartz queue cleanup interface.*
