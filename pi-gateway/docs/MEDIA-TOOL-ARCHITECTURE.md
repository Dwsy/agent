# Media Tool Architecture: OpenClaw Analysis + pi-gateway Proposal

> TL;DR: OpenClaw uses a unified `message` tool with `action=send` + `media`/`buffer`/`filePath` params for outbound media, and channel plugins for inbound media processing. pi-gateway should implement a focused `send_media` tool that wraps the existing MEDIA: directive parsing + media-security validation, giving agents a structured tool call instead of text-based directives.

## 1. OpenClaw's Approach

### 1.1 The `message` Tool (Unified)

OpenClaw has a single `message` tool (`src/agents/tools/message-tool.ts`) that handles ALL outbound messaging — text, media, reactions, polls, threads, moderation, presence, etc.

For media specifically, the `action=send` schema includes:

```typescript
// Media-related params in the send schema
media: string       // Media URL or local path (not data: URLs)
buffer: string      // Base64 payload for attachments (or data: URL)
filename: string    // Explicit filename
contentType: string // MIME type
mimeType: string    // Alias for contentType
caption: string     // Caption text
path: string        // File path (alias)
filePath: string    // File path (alias)
asVoice: boolean    // Send as voice message
gifPlayback: boolean // Animate as GIF
```

**Key insight:** The agent calls `message({ action: "send", media: "./output.png", caption: "Here's the chart" })` — a structured tool call, not a text directive.

### 1.2 Inbound Media Flow

Inbound media is handled by channel plugins, NOT tools:

1. Channel plugin downloads media (photo/video/doc/audio/voice)
2. Media understanding pipeline runs (vision, STT)
3. `buildInboundMediaNote(ctx)` generates `[media attached: ...]` text
4. Media reply hint injected into message body (Layer 3, per-message)
5. Agent receives the enriched message

### 1.3 The `cron` Tool (Structured)

For comparison, OpenClaw's cron tool uses structured actions:

```typescript
cron({ action: "add", job: { schedule: "30m", text: "Check disk" } })
cron({ action: "list" })
cron({ action: "remove", jobId: "abc123" })
```

This is the same pattern — structured tool calls instead of slash commands or text directives.

### 1.4 Why Tools > Text Directives

| Aspect | MEDIA: directive | Tool call |
|---|---|---|
| Validation | Post-hoc regex parsing | Schema validation at call time |
| Error handling | Silent failure (treated as text) | Structured error response |
| Type safety | None | TypeBox schema |
| Discoverability | Agent must read prompt docs | Tool description + schema |
| Multi-file | Multiple MEDIA: lines | Single call with array |
| Metadata | No caption/type control | caption, contentType, asVoice |
| Testability | String parsing tests | Tool execution tests |

## 2. pi-gateway Proposal

### 2.1 Design Principle

pi-gateway uses RPC isolation — tools are registered in the pi CLI process, not the gateway. We have two options:

**Option A: Gateway-side tool (via pi extension)**
- Register a custom tool in a pi extension that calls back to the gateway via HTTP/WS
- Pro: Full control over schema and execution
- Con: Requires extension development + gateway API endpoint

**Option B: Prompt-guided tool usage (via existing pi tools)**
- Agent uses `bash` or `write` to create files, then MEDIA: directive to send
- Pro: No new code
- Con: Still relies on text directives

**Option C: Gateway intercepts tool results (hybrid)**
- Keep MEDIA: parsing for backward compat
- Add a gateway pi extension that registers `send_media` tool
- Tool calls gateway HTTP API to send media
- Pro: Best of both worlds
- Con: Most complex

**Recommendation: Option C (hybrid)** — Add `send_media` tool via extension, keep MEDIA: as fallback.

### 2.2 Proposed `send_media` Tool Schema

```typescript
{
  name: "send_media",
  description: "Send a file (image, audio, document) to the current chat. Path must be relative to workspace.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path (e.g., ./output.png)" },
      caption: { type: "string", description: "Optional caption text" },
      type: { 
        type: "string", 
        enum: ["photo", "audio", "document", "video"],
        description: "Media type. Auto-detected from extension if omitted."
      }
    },
    required: ["path"]
  }
}
```

### 2.3 Proposed `send_message` Tool Schema (Future)

For parity with OpenClaw's `message` tool, a broader tool:

```typescript
{
  name: "send_message",
  description: "Send a message to a specific channel or the current chat.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["send", "react", "reply"] },
      message: { type: "string" },
      media: { type: "string", description: "Relative file path for attachment" },
      caption: { type: "string" },
      channel: { type: "string", description: "Target channel (telegram/discord/webchat)" },
      target: { type: "string", description: "Target user/group ID" },
      replyTo: { type: "string", description: "Message ID to reply to" },
      emoji: { type: "string", description: "Emoji for react action" }
    },
    required: ["action"]
  }
}
```

### 2.4 Implementation Architecture

```
pi agent process
  └── send_media tool (registered via gateway extension)
        │
        ├── validateMediaPath(path)     ← reuse existing security
        ├── signMediaToken(path)        ← reuse existing HMAC
        │
        └── HTTP POST gateway:18789/api/media/send
              │
              ├── sessionKey (from tool context)
              ├── path (validated)
              ├── caption
              ├── type (auto-detected)
              │
              └── Gateway routes to channel plugin
                    ├── Telegram: sendPhoto/sendDocument/sendAudio
                    ├── Discord: channel.send({ files: [...] })
                    └── WebChat: WS media event
```

### 2.5 Gateway Extension (pi extension)

```typescript
// extensions/gateway-tools/index.ts
export default {
  name: "gateway-tools",
  tools: [{
    name: "send_media",
    description: "Send a file to the current chat via pi-gateway.",
    parameters: { /* schema above */ },
    async execute(toolCallId, args) {
      const { path, caption, type } = args;
      // Call gateway API
      const res = await fetch(`http://localhost:${GATEWAY_PORT}/api/media/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SESSION_TOKEN}` },
        body: JSON.stringify({ sessionKey: SESSION_KEY, path, caption, type })
      });
      return await res.json();
    }
  }]
};
```

### 2.6 Migration Path

| Phase | Change | MEDIA: directive |
|---|---|---|
| v3.3 | Add `/api/media/send` endpoint | Keep as-is |
| v3.3 | Create gateway-tools extension with `send_media` | Keep as fallback |
| v3.3 | Update MEDIA_SEGMENT prompt to mention `send_media` tool | Keep syntax docs |
| v3.4 | Add `send_message` tool (broader messaging) | Deprecate MEDIA: |
| v4.0 | Remove MEDIA: directive parsing | Removed |

### 2.7 What NOT to Copy from OpenClaw

- ❌ Unified `message` tool with 30+ actions — too complex for pi-gateway's scope
- ❌ Channel-specific action schemas (bluebubbles group actions, etc.) — we have 3 channels
- ❌ Gateway tool (self-update, config apply) — different architecture
- ❌ Sessions spawn/send/history tools — pi-gateway uses RPC pool, not embedded sessions

## 3. Immediate Next Steps

1. Add `POST /api/media/send` endpoint to `server.ts` (reuses `validateMediaPath` + channel routing)
2. Create `extensions/gateway-tools/` pi extension with `send_media` tool
3. Update `MEDIA_SEGMENT` prompt to mention `send_media` as preferred method
4. Write BBD tests for the new endpoint + tool
5. Keep MEDIA: directive as fallback (no breaking change)
