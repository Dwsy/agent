# pi-gateway docs

## Structure

```
docs/
├── KANBAN.md              # Active task board
├── architecture/          # System architecture (living docs)
│   ├── ARCHITECTURE.md    # Module overview + dependency graph
│   ├── CORE-MODULES.md    # Core module details
│   ├── CRON-AND-CONFIG.md
│   ├── PLUGINS-AND-CHANNELS.md
│   ├── SECURITY.md        # 7-layer security model
│   └── TESTING.md
├── guides/                # User-facing documentation
│   ├── configuration.md   # All 13 config sections
│   ├── telegram.md        # Telegram setup + DM/group/streaming
│   ├── group-chat.md      # Group chat + role binding
│   └── agent-tools.md     # 6 gateway tools reference
├── prd/                   # Product requirements (per version)
│   ├── PRD-GATEWAY-V2.md
│   ├── PRD-GATEWAY-V3.md
│   ├── PRD-GATEWAY-V32.md
│   ├── PRD-GATEWAY-V33.md
│   ├── PRD-GATEWAY-V34.md
│   ├── PRD-GATEWAY-V35.md
│   ├── PRD-GATEWAY-V37.md
│   └── PRD-GATEWAY-V38.md
├── specs/                 # Implementation specs (task-level)
│   ├── T9-GROUP-CHAT-SPEC.md
│   ├── T10-MODEL-FAILOVER-SPEC.md
│   ├── T-COMMANDS-SPEC.md
│   └── ...
├── design/                # Architecture design docs + RFCs
│   ├── BG-001-TOOL-BRIDGE-DESIGN.md
│   ├── BG-004-HOT-RELOAD-DESIGN.md
│   ├── RFC-CHANNEL-ADAPTER.md
│   ├── CA-0-CHANNEL-PATTERN-COMPARISON.md
│   ├── CA-1-CHANNEL-ADAPTER-INTERFACE.md
│   └── ...
├── releases/              # Release notes + test reports
├── issues/                # Tracked issues
└── legacy/                # Historical analysis docs (read-only)
```

## Quick Links

- Current sprint: [KANBAN.md](KANBAN.md)
- Config reference: [guides/configuration.md](guides/configuration.md)
- Telegram setup: [guides/telegram.md](guides/telegram.md)
- Architecture: [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)
