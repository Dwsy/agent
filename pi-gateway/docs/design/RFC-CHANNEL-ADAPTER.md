# RFC: Channel Adapter Interface Enhancement

**Status:** Accepted (direction) — implementation deferred to v3.5
**Author:** NiceViper (architecture), JadeStorm (Feishu perspective)
**Date:** 2026-02-12
**Decision:** Optional adapter pattern, evidence-based extraction after Feishu v1

---

## Problem

pi-gateway's `ChannelPlugin` interface has 5 methods. Telegram's actual implementation uses ~1000 lines of channel-specific logic that bypasses the interface:

| Capability | Telegram impl | In interface? |
|---|---|---|
| Streaming edits | `bot.api.sendMessage` + edit | ❌ |
| Typing indicator | `sendChatAction("typing")` | ❌ |
| Message dedup | Internal Map (30min TTL) | ❌ |
| Media download (inbound) | `downloadTelegramFile` | ❌ |
| Group policy | Handler-internal allowlist | ❌ |
| Message editing | Direct bot API | ❌ |
| sendText returns messageId | Returns void | ❌ |

Adding Feishu (and future channels) will duplicate these patterns unless the interface is extended.

## Rejected Alternative: OpenClaw's 20+ Adapters

OpenClaw's `ChannelPlugin` has 20+ adapter interfaces (outbound/streaming/threading/messaging/directory/pairing/security/gateway/config/status/groups/commands/heartbeat...). Many are speculative — only one channel uses them, others pass empty implementations. This is over-engineering for pi-gateway's target audience (solo devs, small teams).

## Proposal: Optional Adapter Pattern

Extend `ChannelPlugin` with optional adapters extracted from real implementations:

```typescript
interface ChannelPlugin {
  id: string;
  meta: ChannelPluginMeta;
  capabilities: ChannelCapabilities;

  // Core (required, unchanged)
  outbound: ChannelOutbound;       // sendText returns MessageSendResult (breaking change)
  init(api: GatewayPluginApi): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;

  // Optional adapters (implement what you need)
  inbound?: ChannelInboundAdapter;
  streaming?: ChannelStreamingAdapter;
  security?: ChannelSecurityAdapter;
  dedup?: ChannelDedupAdapter;
  messaging?: ChannelMessagingAdapter;
}
```

Adapter sketches (to be refined after Feishu v1):

```typescript
interface ChannelInboundAdapter {
  downloadMedia?(messageId: string, opts?: MediaDownloadOpts): Promise<MediaDownloadResult>;
}

interface ChannelStreamingAdapter {
  editMessage?(target: string, messageId: string, text: string): Promise<void>;
  setTyping?(target: string, active: boolean): Promise<void>;
}

interface ChannelSecurityAdapter {
  checkDmPolicy?(senderId: string): { allowed: boolean; reason?: string };
  checkGroupPolicy?(groupId: string, senderId: string): { allowed: boolean; reason?: string };
}

interface ChannelDedupAdapter {
  isDuplicate?(messageId: string): boolean;
  record?(messageId: string): void;
}

interface ChannelMessagingAdapter {
  normalizeTarget?(raw: string): string | null;
  formatOutbound?(text: string): string;
}
```

## Key Principle

> Adapter interfaces should be extracted from implementations, not designed ahead of them.
> — JadeStorm

Wait for Feishu v1 to ship, then compare Telegram vs Feishu patterns to identify truly shared abstractions. Speculative interfaces create maintenance burden without proven value.

## Execution Plan

1. **Now:** Feishu v1 uses current `ChannelPlugin` interface (no changes needed)
2. **After Feishu v1:** Pattern comparison — Telegram vs Feishu, identify real overlaps
3. **v3.5:** Extract evidence-based adapters, update `types.ts`
4. **v3.5+:** Migrate Telegram to new adapters (largest work item, separate planning)

## Breaking Change: sendText Return Type

Current: `sendText(target, text, opts?): Promise<void>`
Proposed: `sendText(target, text, opts?): Promise<MessageSendResult>`

This enables reply chains (need messageId from sent messages). Migration: Telegram and Discord update their sendText to return `{ ok, messageId }`. Feishu implements it from the start.

## Decision Log

| Date | Decision | By |
|---|---|---|
| 2026-02-12 | Direction approved, deferred to v3.5 | HappyCastle (PM) |
| 2026-02-12 | Evidence-based extraction over speculative design | JadeStorm + NiceViper |
| 2026-02-12 | Feishu v1 proceeds on current interface | HappyCastle |
