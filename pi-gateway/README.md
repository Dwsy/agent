# pi-gateway

Local AI Gateway for pi agent — Telegram, Discord, WebChat, and more.

Aligned with [OpenClaw](https://github.com/openclaw/openclaw) architecture. Powered by [pi-mono](https://github.com/badlogic/pi-mono) RPC mode. Built with Bun + Lit.

## Quick Start

```bash
cd pi-gateway
bun install
bun run src/cli.ts gateway --port 18800
# Open http://localhost:18800
```

## Architecture

```
Telegram / Discord / WebChat
         │
         ▼
┌──────────────────────────────────┐
│       pi-gateway (:52134)        │
│  Bun HTTP + WebSocket server     │
│                                  │
│  Plugin System → Session Router  │
│  → Message Queue → RPC Pool      │
└────────────────┬─────────────────┘
                 │
         pi --mode rpc
         (JSON Lines stdin/stdout)
```

- **Gateway**: single-port HTTP + WebSocket multiplexed server (aligned with OpenClaw Gateway)
- **RPC Pool**: manages `pi --mode rpc` subprocesses (configurable min/max/idle timeout)
- **Session Router**: `agent:{agentId}:{channel}:{scope}:{id}` key format (aligned with OpenClaw)
- **Plugin System**: `GatewayPluginApi` interface with 14 hooks + 8 registration methods (aligned with OpenClaw `OpenClawPluginApi`)
- **Web UI**: Lit components via CDN importmap, zero build step

## CLI

```bash
pi-gw gateway [--port N] [--verbose]   # Start gateway
pi-gw doctor                           # Health check
pi-gw send --to <target> --message <m> # Send message (telegram:<chatId> or telegram:<accountId>:<chatId>[:topic:<tid>])
pi-gw config show                      # Show config
```

## Configuration

`pi-gateway.jsonc` (JSONC, aligned with `openclaw.json` key structure):

```jsonc
{
  "gateway": { "port": 52134, "bind": "loopback" },
  "agent": {
    "model": "claude-kiro-local/claude-haiku-4-5-20251001",
    "runtime": {
      "agentDir": "~/.pi/gateway/runtime-agent",
      "packageDir": "~/.pi/gateway/runtime-package"
    },
    "appendSystemPrompt": "~/.pi/agent/APPEND_SYSTEM.md",
    "skillsBase": ["~/.pi/agent/skills"],
    "skillsGateway": ["~/.pi/gateway/skills"],
    "extensions": [
      "~/.pi/agent/extensions/role-persona/index.ts",
      "~/.pi/gateway/pi-extensions/auto-model-router/index.ts"
    ],
    "pool": { "min": 1, "max": 4 }
  },
  "roles": {
    "mergeMode": "append",
    "capabilities": {
      "mentor": {
        "skills": ["~/.pi/gateway/skills/mentor"],
        "extensions": ["~/.pi/gateway/pi-extensions/mentor-tools/index.ts"],
        "promptTemplates": ["~/.pi/gateway/prompts/mentor"]
      }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "...",
      "dmPolicy": "pairing",
      "accounts": {
        "default": { "enabled": true },
        "work": {
          "enabled": true,
          "botToken": "...",
          "webhookUrl": "https://example.com/telegram/work",
          "webhookSecret": "replace-me"
        }
      }
    },
    "discord":  { "enabled": true, "token": "..." }
  }
}
```

Layered capability precedence:
- `skills`: `roles.capabilities[role].skills` -> `agent.skillsGateway` -> `agent.skillsBase`
- `extensions`: `roles.capabilities[role].extensions` -> `agent.extensions`
- `promptTemplates`: `roles.capabilities[role].promptTemplates` -> `agent.promptTemplates`

For same absolute path, first one wins (role/gateway priority).

## Plugin System

Plugins register via `GatewayPluginApi` (aligned 1:1 with OpenClaw):

```typescript
export default function myPlugin(api: GatewayPluginApi) {
  api.registerChannel(myChannel);       // Bot channel
  api.registerTool(myTool);             // Agent tool
  api.registerHook(["agent_end"], h);   // Lifecycle hook
  api.registerHttpRoute("GET", "/x", h); // HTTP endpoint
  api.registerGatewayMethod("my.rpc", h); // WS method
  api.registerCommand("ping", h);       // Slash command (no LLM)
  api.registerService(myBgService);     // Background service
  api.on("message_received", h);        // Shorthand hook
}
```

### Available Hooks (14, aligned with OpenClaw PluginHookName)

| Hook | Description |
|------|-------------|
| `before_agent_start` | Inject context before agent run |
| `agent_end` | Inspect final messages after run |
| `message_received` | Inbound message from channel |
| `message_sending` | Outbound before send (modifiable) |
| `message_sent` | Outbound after send |
| `before_tool_call` | Intercept tool parameters |
| `after_tool_call` | Intercept tool results |
| `tool_result_persist` | Transform tool result before persist |
| `session_start` / `session_end` | Session lifecycle |
| `before_compaction` / `after_compaction` | Context compaction |
| `gateway_start` / `gateway_stop` | Gateway lifecycle |

## Security

Aligned with OpenClaw DM policies:

| Policy | Behavior |
|--------|----------|
| `pairing` | Unknown sender gets 8-char code, admin approves via CLI |
| `allowlist` | Only configured user IDs can interact |
| `open` | Anyone can interact |
| `disabled` | Ignore all DMs |

```bash
pi-gw pairing approve telegram ABCD1234 --account default
```

## role-persona Integration

Each channel/group can bind to a role. Gateway sets the RPC process CWD so pi's role-persona extension auto-loads the matching role (IDENTITY / SOUL / USER / MEMORY).

```jsonc
{
  "channels": {
    "telegram": {
      "role": "mentor",
      "groups": { "123": { "role": "architect" } }
    }
  }
}
```

## Web UI

Lit-based SPA served from Gateway, zero build:

- **Chat**: WebChat with streaming, typing indicator, abort
- **Sessions**: Active sessions list with status
- **Plugins**: Loaded channels and tools
- **Health**: RPC pool / queue / session stats

## Project Structure

```
src/
  cli.ts                        CLI entry point
  server.ts                     Gateway core (HTTP+WS+plugins+pipeline)
  core/
    types.ts                    Core types (RPC/Session/WS protocol)
    config.ts                   Config system (aligned with openclaw.json)
    rpc-client.ts               Single pi --mode rpc process wrapper
    rpc-pool.ts                 RPC process pool manager
    session-router.ts           Session key routing + role CWD binding
    message-queue.ts            Per-session serial message queue
    utils.ts                    Message chunking, formatting
  plugins/
    types.ts                    GatewayPluginApi interface
    hooks.ts                    Hook registry and dispatch
    loader.ts                   Plugin discovery and loading
    builtin/
      telegram.ts               Telegram builtin entry (thin wrapper)
      telegram/                 Telegram channel modules (multi-account, media, webhook/polling)
      discord.ts                Discord channel (discord.js)
      webchat.ts                WebChat channel (Gateway WS)
  security/
    allowlist.ts                DM access control (4 policies)
    pairing.ts                  DM pairing system (8-char codes)
  web/
    index.html                  SPA entry (Lit via CDN)
    style.css                   Dark theme styles
    app.js                      Lit components (5 panels)
```

## Cron 定时任务

Aligned with OpenClaw delivery model — isolated execution via RPC pool, direct channel delivery.

```jsonc
{
  "cron": {
    "enabled": true,
    "jobs": [
      {
        "id": "daily-report",
        "schedule": { "kind": "cron", "expr": "0 9 * * *", "timezone": "Asia/Shanghai" },
        "task": "Generate daily status report.",
        "delivery": "announce"
      }
    ]
  }
}
```

Schedule types: `cron` (cron expr), `every` (interval: "30m"), `at` (one-shot ISO 8601).

Delivery: `announce` (direct channel outbound.sendText), `silent` (record only).

Runtime guards: concurrency lock, error backoff (30s→1h), missed job recovery on startup.

API: HTTP (`/api/cron/jobs`), WebSocket (`cron.*`), Telegram/Discord (`/cron`).

Architecture: `docs/architecture/CRON-AND-CONFIG.md` | Visual: `docs/architecture/cron-architecture.html`

## Extensibility

- **Webhook**: `POST /hooks/wake` (aligned with OpenClaw)
- **Sandbox**: `off | non-main | all` modes
- **Tool Policy**: `profile` + `allow/deny` + per-channel overrides

## Documentation

- `docs/architecture/CRON-AND-CONFIG.md` — Cron 引擎架构与 Config 体系参考
- `docs/architecture/cron-architecture.html` — Cron 架构可视化（Mermaid 图表）
- `docs/FEATURE-REALITY-CHECK.md` — 功能现实校验（实现状态与已知限制）
- `docs/PLUGIN-ARCHITECTURE.md` — Gateway 插件与 pi Extensions 职责边界
- `docs/TELEGRAM-GAP-ANALYSIS.md` — Telegram 能力差距分析
- `docs/GATEWAY-EXTENSIBILITY-DEEP-AUDIT.md` — 双层扩展能力深度审计报告
- `docs/GATEWAY-EXTENSIBILITY-REMEDIATION-BACKLOG.md` — 可直接开发的整改任务清单

## Requirements

- Bun >= 1.0
- pi CLI (`npm install -g @mariozechner/pi-coding-agent`)
- A configured LLM provider (API key or OAuth via `pi /login`)

## License

MIT
