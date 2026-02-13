# Telegram Guide

Connect pi-gateway to Telegram so you can chat with your AI agent from any Telegram client.

## Prerequisites

- pi-gateway installed and running (see [Quick Start](../../README.md#quick-start))
- A Telegram account

## 1. Create a Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, follow the prompts to pick a name and username.
3. Copy the bot token (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`).

Optional BotFather settings:

- `/setprivacy` → Disable — required if you want the bot to see all messages in groups (not just commands and @mentions).
- `/setjoingroups` → Enable — if you plan to add the bot to group chats.

## 2. Minimal Configuration

Add the token to `pi-gateway.jsonc`:

```jsonc
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "allowlist",
      "allowFrom": [YOUR_TELEGRAM_USER_ID]
    }
  }
}
```

To find your user ID, message [@userinfobot](https://t.me/userinfobot) on Telegram.

You can also use an environment variable for the token — the gateway resolves `${TELEGRAM_BOT_TOKEN}` from `process.env` at startup.

## 3. DM Access Policies

Control who can DM your bot:

| Policy | Behavior |
|--------|----------|
| `pairing` | Unknown senders get an 8-char code. Admin approves via CLI. |
| `allowlist` | Only user IDs in `allowFrom` can interact. |
| `open` | Anyone can chat (requires `allowFrom: ["*"]`). |
| `disabled` | Ignore all DMs. |

### Pairing flow

1. Unknown user messages the bot.
2. Bot replies with a code: `Send this code to the admin: ABCD1234`
3. Admin approves:
   ```bash
   pi-gw pairing approve telegram ABCD1234
   ```
4. User is added to the allowlist permanently.

## 4. Streaming

The bot edits its message in real-time as the agent generates output.

```jsonc
{
  "channels": {
    "telegram": {
      "streamMode": "partial",
      "draftChunk": {
        "minChars": 40,
        "maxChars": 3000,
        "breakPreference": "newline"
      }
    }
  }
}
```

| `streamMode` | Behavior |
|--------------|----------|
| `off` | Send the full reply once complete. |
| `partial` | Edit the message progressively as tokens arrive. |
| `block` | Send in block chunks (less edits, fewer 429s). |

The gateway has built-in adaptive backoff — if Telegram returns 429 (rate limit), it reads `retry_after` and recovers gradually.

## 5. Commands

The bot auto-registers slash commands with Telegram. Available out of the box:

| Command | Description |
|---------|-------------|
| `/help` | Show help (paginated) |
| `/new` | Reset the current session |
| `/stop` | Abort the current agent output |
| `/model` | View or switch the active model |
| `/status` | Session status (role, messages, model, context %) |
| `/context` | Detailed context window usage with progress bar |
| `/queue [mode]` | View or change message handling mode (`steer` / `follow-up` / `interrupt`) |
| `/cron` | Manage scheduled tasks (list / pause / resume / remove / run) |
| `/skills` | Browse and invoke registered skills |
| `/sessions` | List all active sessions |
| `/resume <n>` | Switch to a different session by number or key |
| `/refresh` | Re-sync command list from the pi agent |
| `/media` | Show media send instructions |
| `/photo <url\|path> [caption]` | Send an image |
| `/audio <url\|path> [caption]` | Send an audio file |

Pi-native commands (from extensions/skills) are also registered with a `pi_` prefix, e.g. `/pi_compact`, `/pi_role`.

## 6. Sending Media

Two ways to send files:

**Slash commands** (from Telegram):
```
/photo https://example.com/chart.png My chart
/audio /tmp/recording.mp3 Meeting notes
```

**In-reply directives** (the agent can embed these in its response):
```
[photo] https://example.com/img.png | caption text
[audio] /tmp/output.mp3 | caption text
```

The agent also has a `send_media` tool that sends files programmatically — see [Agent Tools](./agent-tools.md).

## 7. Voice Messages (Audio STT)

The bot can transcribe voice messages and voice notes using Groq Whisper or OpenAI Whisper:

```jsonc
{
  "channels": {
    "telegram": {
      "audio": {
        "provider": "groq",
        "apiKey": "${GROQ_API_KEY}",
        "language": "en"
      }
    }
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `provider` | `"groq"` | `"groq"` or `"openai"` |
| `model` | auto | `whisper-large-v3-turbo` (Groq) or `whisper-1` (OpenAI) |
| `apiKey` | — | API key for the STT provider |
| `language` | — | ISO 639-1 code (e.g. `"en"`, `"zh"`) for better accuracy |
| `timeoutSeconds` | `30` | Transcription timeout |

When configured, voice messages are transcribed to text and sent to the agent as a normal message.

## 8. Multi-Account

Run multiple bot accounts from a single gateway. Each account can have its own token, policies, and role:

```jsonc
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${DEFAULT_BOT_TOKEN}",
      "dmPolicy": "allowlist",
      "allowFrom": [111111],
      "accounts": {
        "work": {
          "enabled": true,
          "botToken": "${WORK_BOT_TOKEN}",
          "dmPolicy": "pairing",
          "role": "work-assistant"
        },
        "public": {
          "enabled": true,
          "botToken": "${PUBLIC_BOT_TOKEN}",
          "dmPolicy": "open",
          "allowFrom": ["*"]
        }
      }
    }
  }
}
```

Top-level fields serve as defaults. Per-account fields override them. The implicit `default` account uses the top-level `botToken`.

## 9. Webhook Mode

By default the bot uses long polling. For production deployments behind a reverse proxy, switch to webhooks:

```jsonc
{
  "channels": {
    "telegram": {
      "webhookUrl": "https://your-domain.com/telegram/default",
      "webhookSecret": "replace-with-a-strong-secret",
      "webhookPath": "/telegram/default"
    }
  }
}
```

The gateway registers the webhook with Telegram on startup. Ensure your server is reachable at the configured URL over HTTPS.

Per-account webhook URLs are supported — set `webhookUrl` and `webhookSecret` inside the account block.

## 10. Proxy

If your server can't reach `api.telegram.org` directly:

```jsonc
{
  "channels": {
    "telegram": {
      "proxy": "http://127.0.0.1:7890"
    }
  }
}
```

## 11. Other Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mediaMaxMb` | number | `10` | Max upload size in MB |
| `replyToMode` | `"off"` \| `"first"` \| `"all"` | `"first"` | Whether bot replies quote the user's message |
| `reactionLevel` | `"off"` \| `"ack"` \| `"minimal"` \| `"extensive"` | `"off"` | Bot emoji reactions on incoming messages |
| `reactionNotifications` | `"off"` \| `"own"` \| `"all"` | `"all"` | Which reaction events to forward to the agent |
| `linkPreview` | boolean | — | Enable/disable link previews in bot messages |
| `textChunkLimit` | number | — | Max chars per message chunk (Telegram has a 4096 char limit) |
| `chunkMode` | `"length"` \| `"newline"` | — | How to split long messages: by char count or at newlines |
| `messageMode` | `"steer"` \| `"follow-up"` \| `"interrupt"` | `"steer"` | How new messages are handled when the agent is already running |

## 12. Group Chats

Groups have their own configuration layer. See [Group Chat & Role Guide](./group-chat.md) for full details.

Quick example:

```jsonc
{
  "channels": {
    "telegram": {
      "groups": {
        "-1001234567890": {
          "requireMention": true,
          "role": "team-helper",
          "groupPolicy": "open"
        }
      }
    }
  }
}
```

## Full Example

```jsonc
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "pairing",
      "allowFrom": [123456789],
      "streamMode": "partial",
      "replyToMode": "first",
      "mediaMaxMb": 10,
      "audio": {
        "provider": "groq",
        "apiKey": "${GROQ_API_KEY}",
        "language": "en"
      },
      "groups": {
        "-1001234567890": {
          "requireMention": true,
          "role": "team-helper",
          "groupPolicy": "open"
        }
      }
    }
  }
}
```
