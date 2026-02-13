# CA-1: Channel Adapter Interface Definition

**Status:** Draft — pending team review
**Author:** NiceViper
**Date:** 2026-02-12
**Evidence:** CA-0-CHANNEL-PATTERN-COMPARISON.md
**RFC:** RFC-CHANNEL-ADAPTER.md

---

## 1. Summary

Extend `ChannelPlugin` with two evidence-based optional adapters (StreamingAdapter + SecurityAdapter) and change `sendText` to return `MessageSendResult`. Based on CA-0 pattern comparison across 4 channels.

## 2. Interface Changes

### 2.1 ChannelPlugin (updated)

```typescript
export interface ChannelPlugin {
  /** Unique channel identifier */
  id: string;
  meta: ChannelPluginMeta;
  capabilities: ChannelCapabilities;

  // Core (required)
  outbound: ChannelOutbound;
  init(api: GatewayPluginApi): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;

  // Optional adapters (evidence-based, CA-0)
  streaming?: ChannelStreamingAdapter;
  security?: ChannelSecurityAdapter;
}
```

### 2.2 ChannelOutbound (breaking change: sendText return type)

```typescript
export interface ChannelOutbound {
  /** Send text — returns MessageSendResult (breaking: was void) */
  sendText(target: string, text: string, opts?: SendOptions): Promise<MessageSendResult | void>;
  /** Send media file (optional) */
  sendMedia?(target: string, filePath: string, opts?: MediaSendOptions): Promise<MediaSendResult>;
  /** Max message length hint for chunking */
  maxLength?: number;
}
```

**Migration (3-step):**
1. Step 1 (CA-1): Type = `Promise<MessageSendResult | void>` — backward compat
2. Step 2 (CA-2 + D1): All channels return `MessageSendResult`
3. Step 3 (CA-2 complete deadline): Remove `| void`, type = `Promise<MessageSendResult>`

### 2.3 ChannelStreamingAdapter (new)

Extracted from Telegram + Discord shared `contentSequence + editThrottle + buildLiveText` pattern (CA-0 §2).

```typescript
export interface ChannelStreamingAdapter {
  /**
   * Send a placeholder message (spinner/loading) and return its ID for later editing.
   * Both Telegram and Discord create an initial message before streaming edits.
   * @param target — channel-specific chat target (Telegram: chatId, Discord: channelId, etc.)
   */
  createPlaceholder(target: string, opts?: StreamPlaceholderOpts): Promise<{ messageId: string }>;

  /**
   * Edit an existing message with updated content (for live streaming).
   * Returns true if edit succeeded, false if failed (e.g. Telegram 429).
   * @param target — channel-specific chat target (same as createPlaceholder)
   *
   * Security note: text content only. If future streaming embeds MEDIA directives,
   * any file paths in edit content MUST pass validateMediaPath before delivery.
   */
  editMessage(target: string, messageId: string, text: string, opts?: StreamEditOpts): Promise<boolean>;

  /**
   * Show typing indicator. Optional — some channels don't support it.
   */
  setTyping?(target: string, active: boolean): Promise<void>;

  /** Channel-specific streaming config defaults */
  config?: StreamingConfig;
}

export interface StreamPlaceholderOpts {
  /** Initial text for the placeholder (e.g. spinner frame) */
  text?: string;
  /** Thread/topic ID for threaded channels */
  threadId?: string;
  /** Reply to a specific message */
  replyTo?: string;
  /** Parse mode for the placeholder text */
  parseMode?: "Markdown" | "HTML" | "plain";
}

export interface StreamEditOpts {
  parseMode?: "Markdown" | "HTML" | "plain";
}

export interface StreamingConfig {
  /** Minimum ms between edits (Telegram: 1000, Discord: 500) */
  editThrottleMs?: number;
  /** Stop editing when text exceeds this length (Discord: 1800) */
  editCutoffChars?: number;
  /** Minimum accumulated chars before first edit (Telegram: ~800) */
  streamStartChars?: number;
}
```

**Who implements:**
- Telegram: ✅ (editMessageText + sendChatAction)
- Discord: ✅ (editReply + similar pattern)
- WebChat: ❌ (WS push, no edit-in-place — v3.6 may add WS `stream_delta` event)
- Feishu: ❌ v1 (card patch planned for v2, different API shape)

**Note:** WebChat and Feishu opt out by not implementing `streaming`. Their streaming is handled in dispatch callbacks (`onStreamDelta` → WS push / card patch), which is channel-internal logic.

**Scope boundary:** The adapter defines the `editMessage`/`createPlaceholder` contract only. The shared `contentSequence + buildLiveText + pushLiveUpdate` pipeline logic lives in a utility module (`streaming/live-text.ts`), not in the adapter interface. This keeps the adapter thin while enabling Telegram/Discord to reuse the rendering pipeline.

### 2.4 ChannelSecurityAdapter (new)

Standardizes DM policy across channels. Delegates to shared `security/allowlist.ts` (CA-0 §3).

```typescript
export interface ChannelSecurityAdapter {
  /** DM access policy */
  dmPolicy: DmPolicy;
  /** Static allowlist from config */
  dmAllowFrom?: Array<string | number>;
  /** Whether this channel supports pairing flow.
   *  false → config-only allowFrom check
   *  true  → shared allowlist.ts + pairing.ts (persisted allowlist + code approval) */
  supportsPairing?: boolean;
  /** Account ID for scoped allowlist persistence */
  accountId?: string;
  /** Override default access check. If omitted, delegates to shared allowlist.ts.
   *  Channels can override for custom logic (e.g. group-specific rules). */
  checkAccess?(senderId: string, context: AccessCheckContext): AccessResult;
}

export interface AccessCheckContext {
  channel: string;
  chatType: "dm" | "group" | "channel" | "thread";
  chatId?: string;
  accountId?: string;
}

export interface AccessResult {
  allowed: boolean;
  reason?: string;
  /** If pairing is needed, the generated code */
  pairingCode?: string;
}
```

**Who implements:**
- Telegram: ✅ (already uses `security/allowlist.ts`)
- Discord: ✅ (already uses `security/allowlist.ts`)
- Feishu: ✅ (migrate from inline `checkDmPolicy` to `allowlist.ts` — F3a acceptance criteria)
- WebChat: ❌ (auth-only, no DM policy)

**Integration point:** `message-pipeline.ts` or channel handler checks `plugin.security` before dispatch:

```typescript
if (plugin.security) {
  const allowed = isSenderAllowed(
    plugin.id,
    source.senderId,
    plugin.security.dmPolicy,
    plugin.security.dmAllowFrom,
    plugin.security.accountId,
  );
  if (!allowed) { /* reject or pairing flow */ }
}
```

This centralizes the check that Telegram/Discord/Feishu currently do independently.

## 3. Legacy Compatibility

### wrapLegacyOutbound

Adapter for channels that haven't migrated yet:

```typescript
export function wrapLegacyOutbound(old: {
  sendText(target: string, text: string, opts?: SendOptions): Promise<void>;
  sendMedia?(target: string, filePath: string, opts?: MediaSendOptions): Promise<MediaSendResult>;
  maxLength?: number;
}): ChannelOutbound {
  return {
    ...old,
    async sendText(target: string, text: string, opts?: SendOptions) {
      try {
        await old.sendText(target, text, opts);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
```

Used during migration window only. Removed when `| void` is dropped from sendText return type.

## 4. Files Changed

| File | Change | Owner |
|---|---|---|
| `src/plugins/types.ts` | Add StreamingAdapter, SecurityAdapter, ChannelOutbound, wrapLegacyOutbound | NiceViper (CA-1) |
| `src/plugins/builtin/telegram/index.ts` | Return MessageSendResult from sendText, implement streaming + security adapters | TrueJaguar (CA-2) |
| `src/plugins/builtin/discord/index.ts` | Return MessageSendResult from sendText, implement streaming + security adapters | MintHawk (D1) |
| `src/plugins/builtin/webchat/` (ws-methods) | Return MessageSendResult from sendText (no streaming/security) | MintHawk (D1) |
| `src/plugins/builtin/feishu/index.ts` | Return MessageSendResult from sendText, implement security adapter | JadeStorm (F3a) |
| `src/plugins/builtin/feishu/bot.ts` | Migrate checkDmPolicy to allowlist.ts | JadeStorm (F3a) |

## 5. Acceptance Criteria

| ID | Criteria |
|---|---|
| CA-1-1 | `ChannelStreamingAdapter` interface in types.ts with createPlaceholder + editMessage + setTyping + config |
| CA-1-2 | `ChannelSecurityAdapter` interface in types.ts with dmPolicy + dmAllowFrom + supportsPairing |
| CA-1-3 | `ChannelOutbound.sendText` returns `Promise<MessageSendResult \| void>` |
| CA-1-4 | `wrapLegacyOutbound()` helper exported from types.ts |
| CA-1-5 | `ChannelPlugin` gains optional `streaming?` and `security?` fields |
| CA-1-6 | tsc 0 errors, all tests green |
| CA-1-7 | `\| void` removed from sendText after CA-2 + D1 complete (deadline) |
| CA-1-8 | Feishu `checkDmPolicy` migrated to `allowlist.ts` when F3a ships |

## 6. What We Explicitly Don't Do

Based on CA-0 evidence:

| Dropped | Reason |
|---|---|
| `ChannelDedupAdapter` | Only 1 implementor per method (Feishu inbound / Telegram outbound) |
| `ChannelInboundAdapter` | Download mechanisms too different (file_id vs messageResource) |
| `ChannelMessagingAdapter` | Target resolution and formatting are all channel-specific |

These stay as internal channel implementation details. If a third channel needs the same pattern, we revisit.
