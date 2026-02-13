# pi-gateway Documentation Index

> Lightweight multi-channel AI gateway — Telegram, Discord, Feishu, WebChat

---

## Getting Started

| Doc | Description |
|-----|-------------|
| [Configuration Guide](guides/configuration.md) | All 13 config sections with field tables + JSONC examples |
| [Telegram Setup](guides/telegram.md) | BotFather, DM/group, streaming, commands, media, multi-account |
| [Group Chat & Roles](guides/group-chat.md) | Per-group config, mention strategy, role binding, NO_REPLY |
| [Agent Tools Reference](guides/agent-tools.md) | send_media, send_message, message, cron, gateway, session_status |

## Architecture

| Doc | Description |
|-----|-------------|
| [Architecture Overview](architecture/ARCHITECTURE.md) | Module dependency graph, data flow |
| [Core Modules](architecture/CORE-MODULES.md) | RPC pool, session router, message pipeline |
| [Plugins & Channels](architecture/PLUGINS-AND-CHANNELS.md) | Channel plugin interface, Telegram/Discord/Feishu/WebChat |
| [Security](architecture/SECURITY.md) | 7-layer defense: auth, SSRF, exec guard, media validation |
| [Cron & Config](architecture/CRON-AND-CONFIG.md) | CronEngine, config loading, hot-reload |
| [Testing](architecture/TESTING.md) | Test strategy, BBD test suites |

## Design Documents

| Doc | Scope |
|-----|-------|
| [RFC: Channel Adapter](design/RFC-CHANNEL-ADAPTER.md) | Unified channel interface extraction |
| [CA-0: Channel Pattern Comparison](design/CA-0-CHANNEL-PATTERN-COMPARISON.md) | Cross-channel pattern analysis, 5→2 adapter cut |
| [CA-1: Channel Adapter Interface](design/CA-1-CHANNEL-ADAPTER-INTERFACE.md) | StreamingAdapter + SecurityAdapter specs |
| [BG-001: Tool Bridge](design/BG-001-TOOL-BRIDGE-DESIGN.md) | Auto-generate pi extension from registerTool plugins |
| [BG-004: Hot Reload](design/BG-004-HOT-RELOAD-DESIGN.md) | Scoped plugin reload, 5 tiers, file watcher |
| [Feishu Channel](design/FEISHU-CHANNEL-DESIGN.md) | Feishu integration: WebSocket, CardKit, DM policy |
| [Media Tool Architecture](design/MEDIA-TOOL-ARCHITECTURE.md) | send_media direct delivery, path validation |
| [Message Queue & Backpressure](design/MESSAGE-QUEUE-BACKPRESSURE-DESIGN.md) | Queue drop policies, priority dispatch |
| [Multi-Agent Routing](design/MULTI-AGENT-ROUTING-DESIGN.md) | Agent binding, prefix routing, delegation |
| [System Prompt Architecture](design/SYSTEM-PROMPT-ARCHITECTURE.md) | 3-layer prompt: base + channel + conditional |
| [Plugin Architecture](design/PLUGIN-ARCHITECTURE.md) | Plugin lifecycle, API surface |
| [Heartbeat & Cron](design/HEARTBEAT-CRON-DESIGN.md) | Heartbeat executor, cron announcer |
| [Steer & Interrupt](design/STEER-INTERRUPT-PRESEARCH.md) | Steer injection, interrupt handling |
| [Delegate to Agent](design/DELEGATE-TO-AGENT-DESIGN.md) | Cross-agent delegation design |
| [Telegram Media](design/TELEGRAM-MEDIA-FULL-DESIGN.md) | Telegram media send/receive full spec |

## Implementation Specs

| Spec | Version | Status |
|------|---------|--------|
| [T9: Group Chat](specs/T9-GROUP-CHAT-SPEC.md) | v3.9 | ✅ Done |
| [T10: Model Failover](specs/T10-MODEL-FAILOVER-SPEC.md) | v3.9 | ✅ Done |
| [T-Commands](specs/T-COMMANDS-SPEC.md) | v3.9 | ✅ Done |
| [S2: SSRF Guard](specs/S2-SSRF-GUARD-SPEC.md) | v3.4 | ✅ Done |
| [S3: Exec Allowlist](specs/S3-EXEC-ALLOWLIST-SPEC.md) | v3.4 | ✅ Done |
| [Server Refactor](specs/SERVER-REFACTOR-SPEC.md) | v3.3 | ✅ Done |
| [System Prompt Injection](specs/SYSTEM-PROMPT-INJECTION-SPEC.md) | v3.3 | ✅ Done |
| [Heartbeat/Cron Impl](specs/HEARTBEAT-CRON-IMPLEMENTATION-SPEC.md) | v3.2 | ✅ Done |
| [M4: Steer/Interrupt](specs/M4-STEER-INTERRUPT-IMPLEMENTATION.md) | v3.1 | ✅ Done |
| [P2: Extraction Plan](specs/P2-EXTRACTION-PLAN.md) | v3.4 | ✅ Done |

## Version History

| Version | PRD | Release Notes | Tests |
|---------|-----|---------------|-------|
| v3.8 | [PRD](prd/PRD-GATEWAY-V38.md) | See CHANGELOG.md | 723/723 |
| v3.7 | [PRD](prd/PRD-GATEWAY-V37.md) | See CHANGELOG.md | 703/703 |
| v3.5 | [PRD](prd/PRD-GATEWAY-V35.md) | See CHANGELOG.md | 568/568 |
| v3.4 | [PRD](prd/PRD-GATEWAY-V34.md) | See CHANGELOG.md | 531/531 |
| v3.3 | [PRD](prd/PRD-GATEWAY-V33.md) | [Release](releases/V33-TASK-DISPATCH.md) | 366/366 |
| v3.2 | [PRD](prd/PRD-GATEWAY-V32.md) | See CHANGELOG.md | 305/305 |
| v3.1 | [PRD](prd/PRD-GATEWAY-V3.md) | [Release](releases/V3.1-RELEASE-NOTES.md) | 240/240 |
| v2.0 | [PRD](prd/PRD-GATEWAY-V2.md) | [Release](releases/V2-RELEASE-NOTES.md) | — |

## Project Management

- [KANBAN Board](KANBAN.md) — Active sprint tasks
- [Issues](issues/) — Tracked investigations
- [Legacy](legacy/) — Historical analysis (read-only archive)
