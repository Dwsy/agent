# Plugin Architecture: pi Extensions vs Gateway Plugins

## Two Plugin Systems, Two Responsibilities

pi-gateway intentionally separates concerns between two plugin systems:

### pi Extensions (Core — Agent Capabilities)

**Location**: `~/.pi/agent/extensions/`
**Runtime**: Inside the `pi --mode rpc` process
**Access**: Direct `AgentSession`, system prompt, tools, memory

Use pi extensions for:
- Agent personality and memory (role-persona)
- Custom tools the agent can invoke (bash, read, write, etc.)
- System prompt injection and modification
- Agent lifecycle hooks (before_agent_start, tool_call, agent_end)
- Sub-agent orchestration
- Anything that changes **what the agent can do or how it thinks**

Examples: `role-persona`, `subagent`, `games`, `plan-mode`, `git-commit`

### Gateway Plugins (Periphery — External Connectivity)

**Location**: `~/.pi/gateway/plugins/` or `src/plugins/builtin/`
**Runtime**: Inside the gateway process (Bun)
**Access**: Message routing, HTTP/WS, channel APIs, session metadata

Use gateway plugins for:
- Messaging channel integrations (Telegram, Discord, WebChat)
- HTTP endpoints for external systems
- WebSocket RPC methods for custom UIs
- Slash commands that bypass the LLM (quick status, toggles)
- Background services (monitoring, metrics)
- Anything that manages **how messages flow in and out**

Examples: `telegram`, `discord`, `webchat`

## Relationship

```
                    Gateway Plugins              pi Extensions
                    (外围连接层)                  (核心能力层)
                    ──────────────               ─────────────
User → Telegram ──→ telegram.ts ──→ Gateway ──→ pi --mode rpc ──→ role-persona
                    (message routing)            (stdin/stdout)    (prompt/memory)
                                                                   tool execution
                                                                   agent lifecycle
```

Gateway plugins decide **who talks to the agent and how**.
pi extensions decide **what the agent is and what it can do**.

## When to Use Which

| Need | Use |
|------|-----|
| Add a new chat platform (WeChat, Slack, etc.) | Gateway plugin |
| Give the agent a new tool (web search, database query) | pi extension |
| Add an HTTP webhook endpoint | Gateway plugin |
| Modify the system prompt | pi extension |
| Implement rate limiting on messages | Gateway plugin |
| Add memory/personality system | pi extension |
| Serve a custom dashboard | Gateway plugin |
| Intercept and transform tool results | pi extension |

## Key Principle

> **pi extensions are the brain. Gateway plugins are the nervous system.**
>
> Don't put brain logic in the nervous system.
