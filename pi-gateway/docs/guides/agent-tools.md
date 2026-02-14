# Agent Tools Guide

pi-gateway registers a set of tools that the pi agent can call during conversations. These tools let the agent interact with the gateway — sending messages, managing cron jobs, querying session status, and more.

Tools are registered automatically when pi runs under the gateway (via `PI_GATEWAY_URL` and `PI_GATEWAY_INTERNAL_TOKEN` environment variables). No manual setup needed.

## Tools Overview

| Tool | Description |
|------|-------------|
| `send_media` | Send files (images, audio, documents, video) to the current chat |
| `send_message` | Send text messages outside the normal response flow |
| `cron` | Manage scheduled tasks (add/remove/pause/resume/run/wake) |
| `message` | React, edit, delete, pin messages or read chat history |
| `gateway` | View config, reload config, restart gateway |
| `session_status` | Query token usage, model, cost, context utilization |

---

## send_media

Send a file to the current chat. The file is delivered directly to the channel (Telegram/Discord/WebChat).

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | File path — relative (`./output.png`) or absolute (`/tmp/xxx.png`) |
| `caption` | string | no | Caption text sent with the media |
| `type` | string | no | `photo`, `audio`, `document`, or `video`. Auto-detected from extension if omitted |

**Notes:**
- SVG files are not supported as images on Telegram — convert to PNG first
- Telegram image formats: jpg, jpeg, png, gif, webp, bmp

**Example:**
```json
{ "path": "./chart.png", "caption": "Monthly report" }
```

---

## send_message

Send a text message to the current chat, outside the normal response flow. Useful for sending additional messages or threaded replies.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | yes | Message text to send |
| `replyTo` | string | no | Message ID to reply to (creates a threaded reply) |
| `parseMode` | string | no | `Markdown`, `HTML`, or `plain` (default: channel default) |

**Example:**
```json
{ "text": "Task completed!", "replyTo": "12345" }
```

---

## cron

Manage gateway scheduled tasks (cron jobs) and send wake events.

**Actions:** `list`, `add`, `remove`, `pause`, `resume`, `run`, `wake`, `update`, `runs`, `status`

### Schedule Types

| Kind | Expression | Example |
|------|-----------|---------|
| `cron` | Standard cron expression | `0 */6 * * *` |
| `every` | Interval shorthand | `30m`, `2h`, `1d` |
| `at` | One-shot ISO 8601 datetime | `2026-02-13T10:00:00Z` |

### Execution Modes

| Mode | Description |
|------|-------------|
| `isolated` (default) | Runs in an independent session |
| `main` | Injects as system event into the main session |

### Delivery Modes

| Mode | Description |
|------|-------------|
| `announce` (default) | Retell result via main session |
| `direct` | Send raw output to channel |
| `silent` | Log only, no delivery |

### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | yes | Action to perform |
| `id` | string | varies | Job ID (required for add/remove/pause/resume/run/update) |
| `schedule` | object | add only | `{ kind, expr, timezone? }` |
| `task` | string | add/wake | Task description or wake text |
| `mode` | string | no | `isolated` or `main` |
| `delivery` | string | no | `announce`, `direct`, or `silent` |
| `deleteAfterRun` | boolean | no | Remove job after first execution |
| `wakeMode` | string | no | `now` or `next-heartbeat` (wake action only) |

### Examples

```jsonc
// List all jobs
{ "action": "list" }

// Add hourly backup check
{ "action": "add", "id": "backup", "schedule": { "kind": "every", "expr": "1h" }, "task": "Run backup check" }

// Add daily cron with timezone
{ "action": "add", "id": "morning", "schedule": { "kind": "cron", "expr": "0 9 * * *", "timezone": "Asia/Shanghai" }, "task": "Morning briefing" }

// One-shot reminder (auto-delete)
{ "action": "add", "id": "remind-1", "schedule": { "kind": "at", "expr": "2026-02-13T10:00:00Z" }, "task": "Meeting reminder", "deleteAfterRun": true }

// Pause/resume/remove
{ "action": "pause", "id": "morning" }
{ "action": "resume", "id": "morning" }
{ "action": "remove", "id": "backup" }

// Trigger immediately
{ "action": "run", "id": "backup" }

// Wake — inject system event
{ "action": "wake", "task": "Check email for urgent items", "wakeMode": "now" }
```

---

## message

Perform actions on existing chat messages.

**Actions:** `react`, `edit`, `delete`, `pin`, `read`

### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | yes | `react`, `edit`, `delete`, `pin`, or `read` |
| `messageId` | string | varies | Target message ID (required for react/edit/delete/pin) |
| `emoji` | string or string[] | react only | Emoji to react with |
| `text` | string | edit only | New message text |
| `remove` | boolean | no | Remove reaction instead of adding (react only) |
| `unpin` | boolean | no | Unpin instead of pin (pin only) |
| `chatId` | string | read only | Chat ID to read history from |
| `limit` | number | no | Max messages to return (read only, default: 20) |
| `before` | string | no | Message ID cursor for pagination (read only) |

### Examples

```jsonc
// React with emoji
{ "action": "react", "messageId": "12345", "emoji": "👍" }

// Edit a message
{ "action": "edit", "messageId": "12345", "text": "Updated text" }

// Delete a message
{ "action": "delete", "messageId": "12345" }

// Pin a message
{ "action": "pin", "messageId": "12345" }

// Read chat history
{ "action": "read", "chatId": "67890", "limit": 10 }
```

---

## gateway

Manage the gateway itself — view configuration, hot-reload, or restart.

**Actions:** `config.get`, `reload`, `restart`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | yes | `config.get`, `reload`, or `restart` |

- `config.get` — returns the current gateway configuration (secrets redacted)
- `reload` — hot-reload configuration from disk without restarting
- `restart` — restart the gateway process (requires `gateway.commands.restart: true` in config)

### Examples

```jsonc
{ "action": "config.get" }
{ "action": "reload" }
{ "action": "restart" }
```

---

## session_status

Query the current session's runtime status. Returns model info, token usage, cost, and context window utilization.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionKey` | string | no | Session key to query. Defaults to current session |

**Response includes:**
- Model ID and context window size
- Token usage (input/output) and context utilization percentage
- Estimated cost
- Message count and streaming state

### Example

```jsonc
{ "sessionKey": "agent:default:telegram:dm:12345" }
```

**Sample output:**
```
Model: anthropic/claude-sonnet-4
Context: 42.3% (85k/200k)
Tokens: 85k in / 12k out
Cost: $0.1234
Messages: 15
Streaming: false
```

---

## Environment Variables

These are set automatically by the gateway when spawning pi processes:

| Variable | Description |
|----------|-------------|
| `PI_GATEWAY_URL` | Gateway HTTP base URL (e.g., `http://127.0.0.1:52134`) |
| `PI_GATEWAY_INTERNAL_TOKEN` | Shared secret for authenticating back to gateway |
| `PI_GATEWAY_SESSION_KEY` | Current session key (set dynamically by RPC pool) |

Tools are only registered when both `PI_GATEWAY_URL` and `PI_GATEWAY_INTERNAL_TOKEN` are present.
