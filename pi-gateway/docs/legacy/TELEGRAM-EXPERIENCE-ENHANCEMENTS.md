# Telegram Experience Enhancements

**Owner:** KeenDragon
**Date:** 2026-02-11
**Status:** Implemented, pending e2e verification (server restart)

## 1. Streaming Optimization

### Problem
editMessageText throttled at 1000ms (1 edit/sec). 429 errors silently ignored, causing stale messages.

### Solution
- `editThrottleMs` reduced to 500ms (`config-compat.ts`)
- Adaptive 429 backoff: reads `err.parameters.retry_after` (seconds) from Telegram API, adds as extra throttle
- Gradual recovery: -100ms per successful edit, floor at 0 (base throttle 500ms always applies)

### Why adaptive backoff?
Fixed backoff either over-throttles (slow recovery) or under-throttles (repeated 429). Telegram's `retry_after` tells us exactly how long to wait. Gradual recovery (-100ms/success) avoids oscillation.

## 2. Thinking Blockquote Display (方案 B)

### Problem
Users see no thinking process. Agent appears to "do nothing" for seconds before responding.

### Solution
- New `onThinkingDelta` callback in `InboundMessage` interface (`types.ts`)
- `server.ts` accumulates `thinking_delta` events and calls `onThinkingDelta(accumulated, delta)`
- `handlers.ts` renders thinking as `<blockquote>💭 {text}</blockquote>` in live updates
- Text truncated to last 300 chars (Chinese needs more chars for meaningful context than English)
- First `text_delta` splices thinking from `contentSequence` — replaced by actual response
- Final `respond()` skips any remaining thinking entries

### Why splice on first text_delta (not thinking_end)?
Smoother UX. User sees thinking → text starts → thinking disappears immediately. Waiting for thinking_end would show both simultaneously during the gap.

### Why 300 chars?
200 was too short for Chinese (each char carries more meaning than English letters). 300 gives ~150 Chinese characters, enough for a meaningful thinking snippet.

## 3. /model Command

### Problem
Users couldn't discover or switch models from Telegram. `/model` existed in `forwardCommand` but had no Telegram entry point.

### Solution
- `bot.command("model", handler)` registered in `commands.ts`
- No args → `getAvailableModels()` → `groupModelsByProvider()` → inline keyboard (provider list → paginated model list → select)
- With args (`/model provider/modelId`) → direct `setModel()`
- `model-buttons.ts` already had keyboard builders + `callback_query:data` handler — only needed the command entry point
- Added to `LOCAL_COMMANDS` and `localCommands` Set

## 4. pi_ Command Prefix

### Problem
Telegram command names only support `[a-z0-9_]`. User wanted `pi:compact` format but colons are invalid.

### Decision
Use `pi_` prefix (underscore). `registerNativeCommands` prepends `pi_` to all pi commands. `tryHandleRegisteredCommand` strips `pi_` before forwarding to RPC (`/pi_compact` → `/compact`).

### Dedup logic
`registerNativeCommands` skips pi commands whose base name matches a LOCAL_COMMAND (e.g., `model` is local, so `pi_model` is not registered).

## 5. Reply Context — Bot Self-Skip

### Problem
When user replies to bot's own message, the quoted text is noise — agent already has that context in its conversation history.

### Solution
Check `msg.reply_to_message.from.is_bot && from.id === bot.botInfo.id`. If true, skip the `[Reply to]` prefix.

## 6. WebChat Message Rendering

### Changes
- Replaced hand-written regex markdown renderer with `marked@12` + `highlight.js@11.9` (CDN via importmap)
- `renderToolCall(name, args)` — collapsible `<details>` panel with tool-specific summaries (read→path, bash→command)
- `<think>` blocks in historical messages converted to `<details class="thinking-panel">` by marked layer
- Streaming thinking handled by KeenUnion's component layer (dynamic open/close state)

### Why two thinking paths?
Streaming needs dynamic state (open while thinking, close when done) — component layer handles this. Historical messages are static text — marked layer's `<think>` → `<details>` conversion handles this. Two paths, no overlap.

## 7. Content Type Enhancements

### Forward context
Extracts sender name from `forward_origin.sender_user` / `forward_from` / `forward_from_chat`, prepends `[Forwarded from {name}]`.

### Document handling
`resolveImagesFromMessage` returns `{ images, documentContext? }`. Text-based files (text/*, json, xml) decoded to UTF-8, truncated at 10K chars. Binary files get metadata-only context.

### Voice
Honest reply: "语音消息暂不支持，请发送文字。" Waiting for Groq Whisper STT integration.

## Configuration Reference

```jsonc
{
  "telegram": {
    "accounts": [{
      "stream": {
        "editThrottleMs": 500  // was 1000, adaptive backoff on 429
      },
      "groups": {
        "*": {
          "requireMention": true,  // only respond to @bot messages in groups
          "groupPolicy": "open"    // "open" | "disabled" | "allowlist"
        }
      }
    }]
  }
}
```

## Files Modified

| File | Changes |
|------|---------|
| `src/plugins/builtin/telegram/handlers.ts` | thinking render, 429 backoff, reply bot skip, model in localCommands |
| `src/plugins/builtin/telegram/commands.ts` | /model command, LOCAL_COMMANDS, pi_ prefix, dedup |
| `src/plugins/builtin/telegram/config-compat.ts` | editThrottleMs 500ms |
| `src/core/types.ts` | onThinkingDelta callback |
| `src/server.ts` | thinking_delta forwarding, pi_ prefix stripping |
| `src/web/app.js` | marked/hljs integration, tool call rendering |
| `src/web/index.html` | importmap additions |
| `src/web/style.css` | thinking-panel, tool-call CSS |
