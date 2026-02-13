# CA-0: Channel Pattern Comparison — Telegram vs Feishu vs Discord vs WebChat

**Purpose:** Evidence base for CA-1 Channel Adapter interface design
**Author:** NiceViper (architecture)
**Date:** 2026-02-12

---

## 1. Dedup

Two distinct dedup patterns exist across channels:

### Inbound Dedup (prevent processing same message twice)

| | Feishu | Telegram | Discord | WebChat |
|---|---|---|---|---|
| **Need** | ✅ WebSocket reconnect replays | ❌ grammy handles | ❌ discord.js handles | ❌ N/A |
| **Impl** | `Map<messageId, ts>` 30min TTL, 1000 cap, 5min cleanup | — | — | — |
| **Location** | `feishu/bot.ts` top-level | — | — | — |

### Outbound Dedup (prevent echo of own messages)

| | Telegram | Discord | Feishu | WebChat |
|---|---|---|---|---|
| **Need** | ✅ bot sees own messages in groups | ❌ | ❌ | ❌ |
| **Impl** | `Map<chatId:msgId, expiry>` 3min TTL | — | — | — |
| **Location** | `telegram/sent-message-cache.ts` | — | — | — |

**Conclusion:** Only Feishu needs inbound dedup (SDK limitation). Only Telegram needs outbound dedup (bot API quirk). These are channel-specific, not shared patterns. A `ChannelDedupAdapter` would have exactly one implementor per method — **not worth abstracting**.

**Recommendation:** Drop `ChannelDedupAdapter` from CA-1. Keep dedup as internal channel implementation detail.

---

## 2. Streaming (Live Message Editing)

Three distinct streaming models:

### Model A: Edit-in-place (Telegram)

```
sendMessage(spinner) → get replyMsgId
  → onThinkingDelta → update contentSequence → editMessageText(rendered)
  → onStreamDelta   → update contentSequence → editMessageText(rendered)
  → onToolStart     → append to contentSequence → editMessageText(rendered)
  → respond(final)  → editMessageText(final) + send overflow chunks
```

Key details:
- `contentSequence: {type: "tool"|"thinking"|"text", content}[]` — ordered content buffer
- `buildLiveText()` renders sequence to formatted text (tool lines + thinking blockquote + text)
- `pushLiveUpdate()` with `editThrottleMs` (default 1000ms) + `editInFlight` mutex + 429 backoff
- `streamStartChars` (default ~800) — minimum chars before first edit
- Spinner animation (⠋⠙⠹...) while waiting for first content
- Final reply: edit first chunk, send remaining as new messages

### Model B: Edit-in-place (Discord)

```
reply(spinner) → get replyMsg
  → onThinkingDelta → update contentSequence → editReply(rendered)
  → onStreamDelta   → update contentSequence → editReply(rendered)
  → onToolStart     → append to contentSequence → editReply(rendered)
  → respond(final)  → editReply(final) + send overflow
```

Key details:
- Same `contentSequence` pattern as Telegram
- Same `buildLiveText()` + `pushLiveUpdate()` pattern
- `editThrottleMs` default 500ms (faster than Telegram's 1000ms)
- `editCutoffChars` default 1800 — stops editing when text exceeds limit
- No spinner animation, no streamStartChars gate
- Simpler error handling (no 429 backoff logic)

### Model C: WS Push (WebChat)

```
chat.send → dispatch
  → respond(final) → ws.send({ event: "chat.reply", payload: { text, images } })
  → setTyping(bool) → ws.send({ event: "chat.typing", payload: { typing } })
```

Key details:
- No `onStreamDelta`/`onThinkingDelta`/`onToolStart` callbacks registered
- No message editing — single final reply via WebSocket event
- `setTyping` is the only live feedback
- Media handled separately via `processWebChatMediaDirectives`

### Model D: Card Patch (Feishu — v2 planned)

```
sendCard(placeholder) → get messageId
  → onStreamDelta → PATCH /im/v1/messages/:id (card JSON update)
  → respond(final) → PATCH final card content
```

Key details:
- Not yet implemented (F3a scope)
- Uses card JSON, not plain text — different API shape from Telegram/Discord
- 24h update window limit
- No equivalent of `editMessageText` for plain text messages

### Pattern Comparison

| Aspect | Telegram | Discord | WebChat | Feishu (planned) |
|---|---|---|---|---|
| **Mechanism** | editMessageText | editReply | WS event push | card PATCH |
| **Content buffer** | contentSequence | contentSequence | none | TBD |
| **Throttle** | 1000ms + 429 backoff | 500ms | N/A | TBD |
| **Cutoff** | 4096 chars (API limit) | 1800 chars | N/A | TBD |
| **Spinner** | ✅ animated | ❌ | ❌ | TBD |
| **Callbacks used** | all 4 | all 4 | respond + setTyping | TBD |

**Conclusion:** Telegram and Discord share the `contentSequence + buildLiveText + pushLiveUpdate` pattern. WebChat is fundamentally different (push, not edit). Feishu will be different again (card JSON, not text).

**Recommendation:** A `ChannelStreamingAdapter` can capture the Telegram/Discord shared pattern but should NOT try to unify WebChat or Feishu. Interface:

```typescript
interface ChannelStreamingAdapter {
  /** Edit an existing message (for live streaming updates) */
  editMessage(target: string, messageId: string, text: string, opts?: EditOpts): Promise<void>;
  /** Show typing indicator */
  setTyping?(target: string, active: boolean): Promise<void>;
  /** Streaming config */
  config?: {
    editThrottleMs?: number;
    editCutoffChars?: number;
    streamStartChars?: number;
  };
}
```

WebChat and Feishu don't implement this — they handle streaming in their own dispatch callbacks.

---

## 3. Security (DM/Group Policy)

### DM Policy

| | Telegram | Discord | Feishu | WebChat |
|---|---|---|---|---|
| **Impl** | `isSenderAllowed()` from `security/allowlist.ts` | `isSenderAllowed()` from `security/allowlist.ts` | `checkDmPolicy()` in `feishu/bot.ts` | ❌ (auth-only) |
| **Policies** | pairing/allowlist/open/disabled | pairing/allowlist/open/disabled | open/allowlist | N/A |
| **Pairing** | ✅ 8-char code | ✅ 8-char code | ❌ not yet | N/A |
| **Persisted** | `~/.pi/gateway/credentials/` | `~/.pi/gateway/credentials/` | ❌ config-only | N/A |

**Key finding:** Telegram and Discord already share `security/allowlist.ts`. Feishu reimplemented a simpler version inline. This is a real candidate for standardization.

### Group Policy

| | Telegram | Feishu | Discord | WebChat |
|---|---|---|---|---|
| **Impl** | handler-internal | `checkGroupPolicy()` in bot.ts | handler-internal | N/A |
| **Policies** | allowlist (per-group config) | disabled/open/allowlist | guild-level config | N/A |
| **Mention filter** | ❌ | ✅ `requireMention` | ❌ | N/A |

**Conclusion:** DM policy is already shared (allowlist.ts) for Telegram/Discord. Feishu should migrate to it. Group policy varies too much to abstract — Telegram uses per-group config objects, Feishu uses flat allowlist + mention filter.

**Recommendation:** `ChannelSecurityAdapter` should standardize DM policy (delegate to `allowlist.ts`) but leave group policy as channel-internal:

```typescript
interface ChannelSecurityAdapter {
  /** DM policy for this channel (delegates to shared allowlist.ts) */
  dmPolicy: DmPolicy;
  dmAllowFrom?: string[];
  /** Optional: channel-specific pairing support */
  supportsPairing?: boolean;
}
```

---

## 4. Outbound (sendText / sendMedia)

### sendText Return Value

| | Telegram | Discord | Feishu | WebChat |
|---|---|---|---|---|
| **Returns** | `void` | `void` | `void` | `void` (WS push) |
| **Has messageId** | ✅ (from bot.api.sendMessage) | ✅ (from channel.send) | ✅ (from im.message.create) | ❌ |
| **Callers consume return** | ❌ (0/4 call sites) | ❌ | ❌ | N/A |

**Conclusion:** All channels CAN return messageId but none do. MintHawk confirmed 0/4 call sites consume the return value. Migration is safe — `void → MessageSendResult` is covariant at call sites.

**Recommendation:** Change sendText to return `Promise<MessageSendResult>`. Use 3-step migration:
1. Type: `Promise<MessageSendResult | void>` (union, backward compat)
2. Migrate all 4 channels
3. Remove `| void`

### sendMedia

| | Telegram | Discord | Feishu | WebChat |
|---|---|---|---|---|
| **Impl** | `sendMediaViaAccount` (photo/audio/video/doc/animation) | `AttachmentBuilder` | `uploadImage/uploadFile → sendImage/sendFile` | WS `media_event` |
| **Returns** | `MediaSendResult` | `MediaSendResult` | `MediaSendResult` | N/A |
| **Kind detection** | Extension-based | Extension-based | Extension-based | N/A |

Already standardized via `MediaSendResult`. No changes needed.

---

## 5. Inbound (Media Download)

| | Telegram | Feishu | Discord | WebChat |
|---|---|---|---|---|
| **Impl** | `downloadTelegramFile` (photo/video/doc/audio/voice) | `resolveInboundMedia` (image from message content) | ❌ not implemented | Base64 from client |
| **Priority** | photo(largest) > video > video_note > doc > audio > voice | image keys from content JSON | — | — |
| **Output** | `ImageContent[]` | `ImageContent[]` | — | `ImageContent[]` |

**Conclusion:** Telegram and Feishu both produce `ImageContent[]` but the download mechanisms are completely different (Telegram file_id API vs Feishu messageResource API). Not worth abstracting.

**Recommendation:** Drop `ChannelInboundAdapter` from CA-1. Keep media download as internal channel implementation.

---

## 6. Messaging (Target Resolution / Formatting)

| | Telegram | Discord | Feishu | WebChat |
|---|---|---|---|---|
| **Target format** | `chatId` or `accountId:chatId` | `channelId` | `oc_xxx`/`ou_xxx`/`on_xxx` | WS client | 
| **Target parsing** | `parseTelegramTarget()` | direct | `resolveReceiveIdType()` | N/A |
| **Outbound format** | HTML (markdownToTelegramHtml) | plain/markdown | post JSON / card JSON | plain |
| **Chunking** | `splitTelegramText(4096)` | `splitMessage(2000)` | `chunkText(4000)` | none |

**Conclusion:** Target resolution and formatting are channel-specific. The only shared pattern is chunking (split text at limit), but the limits and split strategies differ.

**Recommendation:** `ChannelMessagingAdapter` adds complexity without value. Drop from CA-1. Keep `outbound.maxLength` for chunking hints.

---

## 7. Summary: What to Keep in CA-1

| Adapter | RFC Proposal | Evidence | CA-1 Decision |
|---|---|---|---|
| `ChannelStreamingAdapter` | ✅ | Telegram + Discord share pattern | ✅ Keep (optional) |
| `ChannelSecurityAdapter` | ✅ | DM policy already shared | ✅ Keep (simplified) |
| `ChannelDedupAdapter` | ✅ | Only 1 implementor per method | ❌ Drop |
| `ChannelInboundAdapter` | ✅ | Download mechanisms too different | ❌ Drop |
| `ChannelMessagingAdapter` | ✅ | All channel-specific | ❌ Drop |
| `sendText → MessageSendResult` | ✅ | 0/4 callers consume, safe migration | ✅ Keep |

**Final CA-1 interface (evidence-based):**

```typescript
interface ChannelPlugin {
  id: string;
  meta: ChannelPluginMeta;
  capabilities: ChannelCapabilities;

  // Core (required)
  outbound: ChannelOutbound;  // sendText returns MessageSendResult
  init(api: GatewayPluginApi): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;

  // Optional adapters (evidence-based)
  streaming?: ChannelStreamingAdapter;  // Telegram + Discord
  security?: ChannelSecurityAdapter;    // Telegram + Discord + Feishu
}
```

Two adapters instead of five. Evidence-based, not speculative.
