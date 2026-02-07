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
│       pi-gateway (:18789)        │
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
pi-gw send --to <target> --message <m> # Send message
pi-gw config show                      # Show config
```

## Configuration

`pi-gateway.json` (JSON5, aligned with `openclaw.json` key structure):

```jsonc
{
  "gateway": { "port": 18789, "bind": "loopback" },
  "agent": {
    "model": "claude-kiro-local/claude-haiku-4-5-20251001",
    "appendSystemPrompt": "~/.pi/agent/APPEND_SYSTEM.md",
    "extensions": [
      "~/.pi/agent/extensions/role-persona/index.ts",
      "~/.pi/gateway/pi-extensions/auto-model-router/index.ts"
    ],
    "pool": { "min": 1, "max": 4 }
  },
  "channels": {
    "telegram": { "enabled": true, "botToken": "..." },
    "discord":  { "enabled": true, "token": "..." }
  }
}
```

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
pi-gw pairing approve telegram ABCD1234
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
      telegram.ts               Telegram channel (grammy)
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

## Extensibility (reserved)

- **Webhook**: `POST /hooks/wake` (aligned with OpenClaw)
- **Cron**: scheduled jobs via `jobs.json`
- **Sandbox**: `off | non-main | all` modes
- **Tool Policy**: `profile` + `allow/deny` + per-channel overrides

## Requirements

- Bun >= 1.0
- pi CLI (`npm install -g @mariozechner/pi-coding-agent`)
- A configured LLM provider (API key or OAuth via `pi /login`)

## License

MIT
