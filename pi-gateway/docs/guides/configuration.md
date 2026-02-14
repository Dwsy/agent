# Configuration Guide

pi-gateway uses a JSONC config file (`pi-gateway.jsonc`) with comment support and trailing commas. Changes are hot-reloaded automatically.

## Config File Resolution

Searched in order (first match wins):

1. `$PI_GATEWAY_CONFIG` env var
2. `./pi-gateway.jsonc` → `./pi-gateway.json`
3. `~/.pi/gateway/pi-gateway.jsonc` → `~/.pi/gateway/pi-gateway.json`

```bash
cp pi-gateway.jsonc.example pi-gateway.jsonc
```

Port can also be overridden at runtime with `PI_GATEWAY_PORT` (takes precedence over config file):

```bash
PI_GATEWAY_PORT=52134 bun run src/server.ts
```

## `gateway` — Server

```jsonc
{
  "gateway": {
    "port": 52134,
    "bind": "loopback",       // "loopback" | "lan" | "auto"
    "logLevel": "info",       // "debug" | "info" | "warn" | "error"
    "auth": {
      "mode": "token",        // "off" | "token" | "password"
      "token": "my-secret"    // auto-generated if omitted
    }
  }
}
```

## `agent` — Pi RPC Agent

```jsonc
{
  "agent": {
    "model": "provider/model-name",   // split on first "/" → --provider + --model
    "thinkingLevel": "off",           // "off" | "low" | "medium" | "high"
    "messageMode": "steer",           // "steer" | "follow-up" | "interrupt"
    "pool": { "min": 1, "max": 4, "idleTimeoutMs": 300000 },
    "tools": {
      "profile": "coding",            // "minimal" | "coding" | "messaging" | "full"
      "allow": [], "deny": []         // whitelist/blacklist override
    },
    "modelFailover": {
      "primary": "claude-sonnet-4",
      "fallbacks": ["claude-haiku-4"],
      "maxRetries": 1, "cooldownMs": 60000
    }
  }
}
```

Message modes: `steer` steers the running agent, `follow-up` queues until done, `interrupt` aborts and restarts.

### System prompt & capabilities

```jsonc
{
  "agent": {
    "systemPrompt": "~/prompts/system.md",       // replace default
    "appendSystemPrompt": "~/APPEND_SYSTEM.md",  // append to default
    "skillsBase": ["~/.pi/agent/skills"],         // lowest priority
    "skillsGateway": ["~/.pi/gateway/skills"],    // mid priority
    "extensions": ["~/.pi/gateway/pi-extensions/auto-model-router/index.ts"],
    "promptTemplates": ["~/.pi/gateway/prompts"],
    "gatewayPrompts": {
      "identity": true, "channel": true, "media": true,
      "heartbeat": false, "cron": false, "delegation": false
    }
  }
}
```

Skill/extension precedence: role capabilities > gateway > base. Same path deduped (first wins).

## `session` — Session Scope

```jsonc
{ "session": { "dmScope": "main", "continueOnRestart": true } }
```

| Scope | Behavior |
|-------|----------|
| `main` | All DMs share one session |
| `per-peer` | One session per user across channels |
| `per-channel-peer` | One session per user per channel |

## `channels` — Channels

```jsonc
{
  "channels": {
    "telegram": { "enabled": true, "botToken": "...", "dmPolicy": "allowlist", "allowFrom": [123] },
    "discord":  { "enabled": false, "token": "..." },
    "webchat":  { "enabled": true, "mediaMaxMb": 10 }
  }
}
```

DM policies: `pairing` (8-char code approval), `allowlist` (ID list), `open` (anyone, needs `allowFrom: ["*"]`), `disabled`.

See [Telegram Guide](./telegram.md) and [Group Chat Guide](./group-chat.md) for channel-specific details.

## `roles` — Role Binding

```jsonc
{
  "roles": {
    "workspaceDirs": { "mentor": "~/workspace/mentor" },
    "capabilities": {
      "mentor": {
        "skills": ["~/.pi/gateway/skills/mentor"],
        "extensions": ["~/.pi/gateway/pi-extensions/mentor-tools/index.ts"]
      }
    }
  }
}
```

Gateway sets RPC process CWD per role so `role-persona` auto-loads IDENTITY/SOUL/USER/MEMORY.

## `queue` — Message Queue

```jsonc
{
  "queue": {
    "maxPerSession": 15, "globalMaxPending": 100,
    "collectDebounceMs": 1500,
    "mode": "collect",           // "collect" batches rapid messages; "individual" processes each
    "dropPolicy": "summarize",   // "summarize" | "old" | "new"
    "priority": { "dm": 10, "group": 5, "webhook": 3, "allowlistBonus": 2 },
    "dedup": { "enabled": true, "cacheSize": 1000, "ttlMs": 60000 }
  }
}
```

## `agents` — Multi-Agent (v3)

```jsonc
{
  "agents": {
    "default": "main",
    "list": [
      { "id": "main", "workspace": "~/ws/main", "model": "claude-sonnet-4", "role": "coding" },
      { "id": "docs", "workspace": "~/ws/docs", "model": "claude-haiku-4",
        "delegation": { "allowAgents": ["main"], "maxConcurrent": 2, "maxDepth": 1 } }
    ],
    "bindings": [
      { "agentId": "docs", "match": { "channel": "telegram", "peer": { "kind": "group", "id": "-100123" } } }
    ]
  },
  "delegation": {
    "timeoutMs": 120000, "maxTimeoutMs": 600000,
    "onTimeout": "abort", "maxDepth": 1, "maxConcurrent": 2
  }
}
```

Bindings route messages to agents by channel/peer/guild. Unmatched → `agents.default`.

## `heartbeat` — Periodic Check-in

```jsonc
{
  "heartbeat": {
    "enabled": true, "every": "30m",
    "activeHours": { "start": "08:00", "end": "23:00", "timezone": "Asia/Shanghai" },
    "prompt": "Read HEARTBEAT.md. Reply HEARTBEAT_OK if nothing needs attention.",
    "skipWhenBusy": true, "ackMaxChars": 300
  }
}
```

Agent replies `HEARTBEAT_OK` when idle. Longer replies are forwarded to the user.

## `cron` — Scheduled Jobs

```jsonc
{
  "cron": {
    "enabled": true,
    "jobs": [
      {
        "id": "daily-report",
        "schedule": { "kind": "cron", "expr": "0 9 * * *", "timezone": "Asia/Shanghai" },
        "payload": { "text": "Generate daily status report" },
        "mode": "isolated",       // "isolated" | "main"
        "delivery": "announce"    // "announce" | "direct" | "silent"
      },
      {
        "id": "one-shot",
        "schedule": { "kind": "at", "expr": "2026-03-01T10:00:00" },
        "payload": { "text": "Deadline reminder" },
        "deleteAfterRun": true
      }
    ]
  }
}
```

Schedule kinds: `cron` (standard expr), `at` (ISO datetime), `every` (duration like `"30m"`).

## `plugins` / `hooks` / `logging` / `media`

```jsonc
{
  "plugins": { "dirs": ["./plugins/my-plugin"], "disabled": [], "config": { "myPlugin": {} } },
  "hooks":   { "enabled": false, "token": "secret", "path": "/hooks" },
  "logging": { "file": false, "level": "info", "retentionDays": 7 },
  "media":   { "workspaceOnly": false }
}
```

## Full Example

See [`pi-gateway.jsonc.example`](../../pi-gateway.jsonc.example) for a complete annotated config.
