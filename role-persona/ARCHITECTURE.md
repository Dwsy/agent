# role-persona

Role-based persona system for AI agents — memory, knowledge, and embedding management. Runs as a Pi extension, CLI, MCP server, or HTTP daemon.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Transport Layer                          │
│                                                              │
│  ┌────────────┐  ┌─────────┐  ┌────────────┐  ┌──────────┐ │
│  │ Pi Adapter │  │   CLI   │  │MCP Server  │  │  Daemon  │ │
│  │   532L     │  │  303L   │  │   221L     │  │   334L   │ │
│  └─────┬──────┘  └────┬────┘  └─────┬──────┘  └────┬─────┘ │
│        │              │              │               │       │
│        └──────────────┴──────┬───────┴───────────────┘       │
│                              │                               │
│                    cli-runner (185L)                          │
│                    daemon HTTP → subprocess                   │
├──────────────────────────────┼───────────────────────────────┤
│                     Service Layer (877L)                      │
│                     Zero Pi API dependency                    │
│  ┌───────────────────────────┴────────────────────────────┐  │
│  │              RolePersonaService                         │  │
│  │  role.*       memory.*        knowledge.*  embedding.*  │  │
│  └────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│                     Core Layer (10,071L)                      │
│                     Pure functions, zero external deps        │
│  ┌────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │role-store  │  │memory-md         │  │knowledge         │ │
│  │role-tpl    │  │memory-llm        │  │embedding-*       │ │
│  │config      │  │memory-tags       │  │memory-vector     │ │
│  │logger      │  │memory-export     │  │types             │ │
│  └────────────┘  └──────────────────┘  └──────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
role-persona/
├── package.json
├── tsconfig.json
├── bun.lock
├── docs/
│   ├── ARCHITECTURE.md          ← this file
│   └── REFACTOR-GUIDE.md        ← refactoring decisions
├── src/
│   ├── core/                    # Pure logic, zero Pi dependency
│   │   ├── types.ts             (591)  Shared type definitions
│   │   ├── config.ts            (677)  Three-tier config (env/jsonc/default)
│   │   ├── logger.ts            (478)  JSONL structured logging
│   │   ├── spinner-utils.ts     (14)   Spinner frame defaults
│   │   ├── role-store.ts        (458)  Role CRUD, CWD mapping, migration
│   │   ├── role-template.ts     (376)  i18n prompt templates (zh/en)
│   │   ├── memory-md.ts         (2185) Memory CRUD, parsing, search
│   │   ├── memory-llm.ts        (726)  LLM auto-extraction + tidy
│   │   ├── memory-extraction-rules.ts (50) Ephemeral/derivable filtering
│   │   ├── memory-tags.ts       (773)  LLM tagging, forgetting curve
│   │   ├── memory-vector.ts     (806)  LanceDB vector, hybrid search
│   │   ├── memory-export.ts     (687)  HTML export, tree navigation
│   │   ├── knowledge.ts         (831)  Multi-source knowledge CRUD
│   │   ├── embedding-minilm.ts  (443)  Direct ONNX provider
│   │   ├── embedding-daemon.ts  (822)  Shared ONNX daemon server
│   │   └── embedding-minilm-daemon-client.ts (154) Daemon client
│   │
│   ├── service/                 # Unified function-call facade
│   │   ├── context.ts           (65)   ServiceContext + helpers
│   │   ├── index.ts             (188)  RolePersonaService facade
│   │   ├── role-service.ts      (184)  role.* methods
│   │   ├── memory-service.ts    (306)  memory.* methods (14 actions)
│   │   ├── knowledge-service.ts (71)   knowledge.* methods
│   │   └── embedding-service.ts (63)   embedding.* methods
│   │
│   ├── transport/               # Runtime adapters
│   │   ├── pi-adapter.ts        (532)  Pi Extension wrapper
│   │   ├── cli-runner.ts        (185)  Daemon HTTP → subprocess
│   │   ├── http-client.ts       (52)   Daemon HTTP client
│   │   ├── daemon.ts            (334)  Bun.serve HTTP daemon
│   │   ├── mcp-server.ts        (221)  MCP Streamable HTTP
│   │   └── tui-renderers.ts     (326)  Pi TUI tool renderers
│   │
│   └── bin/
│       ├── cli.ts               (303)  CLI entry point
│       └── daemon.ts            (12)   Daemon entry point
│
└── tests/
    ├── cli.test.ts              (18)   CLI integration tests
    ├── mcp.test.ts              (7)    MCP protocol tests
    └── core.test.ts             (6)    Core unit tests
```

## Design Principles

| Principle | Description |
|-----------|-------------|
| **Dependency direction** | transport → service → core (one-way, never reversed) |
| **Core has zero deps** | No Pi API, no Pi TUI, only node:fs + node:path |
| **Service is side-effect free** | Returns structured results, never touches UI |
| **Transport is thin** | Parameter conversion + result formatting only |
| **CLI-first** | All operations go through CLI as the single source of truth |
| **Daemon-aware** | CLI prefers warm daemon HTTP over cold subprocess |

## Runtime Modes

### 1. Pi Extension (backward compatible)

```typescript
// extensions/role-persona/index.ts
export { default } from "role-persona/src/transport/pi-adapter.ts";
```

The adapter delegates all operations to the CLI via `cli-runner.ts`:
- If daemon is running → HTTP call (~5ms)
- If daemon is not running → subprocess spawn (~250ms)

Zero imports from service/core layers.

### 2. CLI

```bash
# Direct execution (no daemon)
role-persona --direct memory search "query"

# Daemon-aware (auto-detects running daemon)
role-persona memory search "query"

# Daemon lifecycle
role-persona daemon start --background
role-persona daemon status
role-persona daemon stop
```

All commands output JSON to stdout:
```json
{ "ok": true, "data": {...}, "message": "Human summary" }
{ "ok": false, "error": "Description" }
```

Use `--human` for text output.

### 3. MCP Server (Streamable HTTP)

```bash
bun src/transport/mcp-server.ts
# → http://localhost:3939/mcp (Streamable HTTP, SSE)
```

Protocol: MCP spec 2025-03-26
Transport: `WebStandardStreamableHTTPServerTransport`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | JSON-RPC (initialize, tools/call, tools/list) |
| `/mcp` | GET | SSE stream for server-initiated messages |
| `/mcp` | DELETE | Session termination |
| `/health` | GET | Health check |

4 tools: `memory`, `knowledge`, `role_info`, `role_management`

### 4. HTTP Daemon

```bash
bun src/bin/daemon.ts                 # foreground
bun src/bin/daemon.ts --background    # detach
```

Features:
- PID file at `~/.pi/role-persona-daemon.pid` (single instance)
- Port file at `~/.pi/role-persona-daemon.port`
- Graceful shutdown on SIGTERM/SIGINT
- Warm service: stays in memory, no cold start

20 REST endpoints mirroring the Service facade 1:1.

## Service Interface

```typescript
interface RolePersonaService {
  init(cwd: string): Promise<InitResult>
  dispose(): Promise<void>

  role: {
    list(): string[]
    get(): ActiveRole | null
    create(name: string): RoleCreateResult
    activate(name: string): ActiveRole
    map(cwd: string, roleName: string): MapResult
    unmap(cwd: string): UnmapResult
    resolve(cwd: string): RoleResolution
    getIdentity(rolePath: string): RoleIdentity | null
    getPrompts(rolePath: string): string
    getStructure(rolePath: string, subPath?: string): DirectoryListing
  }

  memory: {
    addLearning(content: string): Promise<MemoryResult>
    addPreference(content: string, category?: string): MemoryResult
    updateLearning(needle: string, newText: string): UpdateResult
    updatePreference(needle: string, newText: string): UpdateResult
    deleteLearning(needle: string): DeleteResult
    deletePreference(needle: string): DeleteResult
    reinforce(needle: string): ReinforceResult
    search(query: string): Promise<MemorySearchMatch[]>
    list(): MemoryListResult
    consolidate(): ConsolidateResult
    repair(force?: boolean): RepairResult
    tidyLlm(model?: string): Promise<LlmTidyResult>
    exportHtml(outputPath?: string): string
    detectConflicts(): ConflictReport
    autoExtract(messages: Message[]): Promise<ExtractResult | null>
    pending: { list, promote, discard, expire, stats }
    vector: { rebuild, stats, isActive }
  }

  knowledge: {
    list(category?: string): KnowledgeListResult
    search(query: string, opts?): KnowledgeSearchResultItem[]
    read(path: string): KnowledgeReadResult | null
    write(entry: KnowledgeWriteInput): KnowledgeWriteResult
  }

  embedding: {
    init(rolePath: string): Promise<boolean>
    isActive(): boolean
    rebuild(): Promise<RebuildResult>
    stats(): Promise<VectorStats | null>
  }
}
```

## Extension Points (Pi Adapter)

### Events

| Event | Purpose |
|-------|---------|
| `session_start` | Load role based on CWD mapping, init vector memory |
| `resources_discover` | Expose skills directory |
| `before_agent_start` | Inject role prompts + memory into system prompt |
| `agent_end` | Auto-memory extraction checkpoint |
| `session_before_compact` | Extract memories before context compaction |
| `session_shutdown` | Flush pending memories + vector index |
| `turn_end` | Evolution reminder (daily reflection nudge) |

### Tools

| Tool | Actions | Description |
|------|---------|-------------|
| `memory` | 14 | add_learning, add_preference, update_learning, update_preference, delete_learning, delete_preference, reinforce, search, list, consolidate, repair, llm_tidy, vector_rebuild, vector_stats |
| `knowledge` | 4 | list, search, read, write |
| `role_info` | 1 | Directory structure listing |

### Commands

| Command | Description |
|---------|-------------|
| `/role info\|create\|map\|unmap\|list` | Role management |
| `/memories` | View role memory |
| `/memory-log` | Session memory operation log |
| `/memory-fix` | Repair consolidated.md |
| `/memory-tidy` | Manual maintenance |
| `/memory-tidy-llm` | LLM-powered tidy |
| `/memory-vector stats\|rebuild` | Vector memory management |
| `/memory-tags` | Tag cloud browser |
| `/memory-conflicts` | Conflict detection |
| `/memory-export` | HTML export |
| `/memory-distill\|stop` | Interactive distillation |
| `/kb list\|search\|stats` | Knowledge base |

## Data Layout

```
~/.pi/roles/
├── config.json              # CWD → role mapping
├── knowledge/               # Global knowledge base
└── <role>/
    ├── core/                # Persona definitions
    │   ├── agents.md
    │   ├── identity.md
    │   ├── soul.md
    │   ├── user.md
    │   ├── tools.md
    │   ├── heartbeat.md
    │   └── constraints.md
    ├── memory/
    │   ├── consolidated.md  # Long-term memory (structured markdown)
    │   └── daily/           # Daily logs
    │       └── YYYY-MM-DD.md
    ├── knowledge/           # Role-specific knowledge
    ├── context/             # Session context
    ├── skills/              # Role skills
    └── .vector-db/          # LanceDB vector index

~/.pi/
├── role-persona-daemon.pid  # Daemon PID file
├── role-persona-daemon.port # Daemon port file
└── sockets/                 # Embedding daemon IPC
```

## Testing

```bash
bun test
# 31 pass, 0 fail, 90 assertions, ~6s
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| CLI | 18 | All commands, JSON output, error handling |
| MCP | 7 | Streamable HTTP, initialize, tools, sessions |
| Core | 6 | Types, extraction rules, config |

## Statistics

| Layer | Files | Lines | Pi Dependency |
|-------|-------|-------|---------------|
| Core | 18 | 10,071 | No |
| Service | 6 | 877 | No |
| Transport | 8 | 1,965 | pi-adapter only |
| Tests | 3 | 419 | No |
| **Total** | **35** | **13,332** | **1 file** |

## Refactored From

Original: `extensions.disabled/role-persona-cli/` (13,424 lines, single-file god object)

Key improvements:
- `index.ts` 2,496 lines → `pi-adapter.ts` 532 lines (79% reduction)
- Zero service/core imports in Pi adapter (CLI subprocess delegation)
- 4 runtime modes vs original 1
- 31 automated tests vs original 0
- Full daemon mode with single-instance PID management
