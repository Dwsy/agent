# Group Chat & Role Guide

Configure pi-gateway for Telegram group chats — per-group roles, mention policies, access control, and silent mode.

## How Group Chat Works

When a message arrives from a group (or supergroup), the gateway:

1. Checks if the group is enabled and whether the sender is allowed.
2. Strips the `@bot` mention if `requireMention` is active.
3. Resolves a per-group role (or falls back to account/channel default).
4. Injects a context prefix so the agent knows who is speaking.
5. After the agent responds, checks for `[NO_REPLY]` — if present, the message is silently dropped.

## Configuration

Group settings live under `channels.telegram.groups` (or per-account under `channels.telegram.accounts.<id>.groups`).

### Basic Example

```jsonc
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "groups": {
        // Per-group config (key = Telegram chat ID)
        "-1001234567890": {
          "enabled": true,
          "requireMention": true,
          "role": "team-assistant",
          "groupPolicy": "open"
        },
        // Wildcard: applies to all groups without explicit config
        "*": {
          "enabled": true,
          "requireMention": true,
          "groupPolicy": "allowlist",
          "allowFrom": [123456789]
        }
      }
    }
  }
}
```

### Group Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the bot in this group |
| `requireMention` | `boolean` | `true` | Only respond when `@botusername` is mentioned |
| `role` | `string` | (account default) | Agent role for this group (maps to a role-persona) |
| `groupPolicy` | `"open" \| "allowlist" \| "disabled"` | `"open"` | Who can interact with the bot |
| `allowFrom` | `(string \| number)[]` | `[]` | Allowed sender IDs when policy is `allowlist` |
| `systemPrompt` | `string` | — | Override system prompt for this group |
| `skills` | `string[]` | — | Additional skills to load for this group |
| `topics` | `Record<string, TopicConfig>` | — | Per-topic overrides (for forum/supergroup topics) |

### Group Policy

- `"open"` — anyone in the group can talk to the bot.
- `"allowlist"` — only sender IDs listed in `allowFrom` are accepted. Use `"*"` in the array to allow everyone (equivalent to `"open"`).
- `"disabled"` — bot ignores all messages in this group.

Policy can also be set at the account level via `groupPolicy` and `groupAllowFrom`, which act as defaults when no per-group config exists.

## Mention Behavior

When `requireMention` is `true` (the default), the bot only processes messages that contain `@botusername`. The mention is stripped from the text before sending to the agent.

When `requireMention` is `false`, the bot processes every message in the group. Use this carefully — it can be noisy. Combine with the `[NO_REPLY]` mechanism (see below) to let the agent decide when to stay silent.

> **BotFather tip:** Send `/setprivacy` → Disable to your bot via BotFather. Without this, Telegram only forwards commands and @mentions to the bot — it won't see regular messages even if `requireMention` is `false`.

## Role Resolution

Roles are resolved with most-specific-first priority:

1. Per-group role: `groups["<chatId>"].role`
2. Wildcard group role: `groups["*"].role`
3. Per-account role: `accounts["<id>"].role`
4. Channel-level role: `channels.telegram.role`
5. Global default (from role-persona extension)

Each role maps to a directory under `~/.pi/agent/roles/<role>/` containing `SOUL.md`, `IDENTITY.md`, and `MEMORY.md`. This lets you give different groups different personalities and knowledge bases.

### Example: Different Roles per Group

```jsonc
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "groups": {
        "-100111": { "role": "dev-team", "requireMention": false },
        "-100222": { "role": "support", "requireMention": true },
        "-100333": { "role": "casual", "groupPolicy": "open" }
      }
    }
  }
}
```

## Context Injection

For non-DM messages, the gateway prepends metadata to the prompt so the agent knows the context:

```
[group:<chatId> | from:<senderName> | thread:<threadId>]
Hello, can you help me with this?
```

The `thread` field is included only for forum/topic messages. This prefix lets the agent:

- Identify who is speaking (useful when multiple people chat).
- Decide whether the message is relevant (for `[NO_REPLY]`).
- Maintain per-sender context within a shared session.

## Silent Mode (`[NO_REPLY]`)

In group chats, the agent can include `[NO_REPLY]` anywhere in its response to signal that it has nothing useful to add. The gateway detects this token and silently drops the message — nothing is sent to the group.

This only applies to non-DM chats. In DMs, `[NO_REPLY]` is treated as regular text.

### When is this useful?

- `requireMention: false` groups where the bot sees every message but should only respond when relevant.
- Multi-bot groups where the agent should defer to another bot.
- Conversations where the agent determines the question was directed at a human, not the bot.

### How to configure the agent

Add instructions in the group's `systemPrompt` or role `SOUL.md`:

```
You are in a group chat. Not every message is directed at you.
If a message doesn't need your response, reply with exactly [NO_REPLY].
Do not explain why you're not responding — just output [NO_REPLY].
```

## Topic / Forum Support

Telegram supergroups with topics enabled (forums) send a `message_thread_id`. The gateway maps this to `source.topicId` and includes it in the context prefix.

Per-topic config is supported under `groups["<chatId>"].topics`:

```jsonc
{
  "groups": {
    "-1001234567890": {
      "role": "general",
      "topics": {
        "42": {
          "role": "code-review",
          "requireMention": false,
          "groupPolicy": "allowlist",
          "allowFrom": [111, 222]
        }
      }
    }
  }
}
```

Topic config fields mirror group config (`requireMention`, `role`, `groupPolicy`, `enabled`, `allowFrom`, `skills`, `systemPrompt`).

## Session Scoping

Group chats use the session key format `telegram:<accountId>:<chatId>:<agentId>`. This means:

- Each group gets its own session (conversation history).
- Different groups don't share context.
- The agent's memory within a group persists across gateway restarts (when `session.continueOnRestart` is enabled — see [Configuration Guide](./configuration.md)).

## Quick Reference

| Scenario | Config |
|----------|--------|
| Bot responds only when @mentioned | `requireMention: true` (default) |
| Bot sees all messages, decides relevance | `requireMention: false` + `[NO_REPLY]` in system prompt |
| Restrict to specific users | `groupPolicy: "allowlist"`, `allowFrom: [id1, id2]` |
| Disable bot in a group | `enabled: false` or `groupPolicy: "disabled"` |
| Different personality per group | Set `role` per group |
| Override prompt for one group | Set `systemPrompt` per group |
