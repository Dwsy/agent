# role-persona-cli → CLI/MCP 架构重构计划

> 日期: 2026-04-29
> 状态: Draft
> 范围: extensions.disabled/role-persona-cli/ (13,424 行, 25 文件)

---

## 一、现状审计

### 1.1 文件清单与职责

| 文件 | 行数 | 职责 | 依赖 pi API? |
|------|------|------|:---:|
| `index.ts` | 2,496 | **入口 + 编排 + 工具实现 + 命令实现 + TUI** | ✅ |
| `memory-md.ts` | 2,186 | 记忆 CRUD、解析、搜索、pending、consolidation | ❌ |
| `knowledge.ts` | 831 | 知识库 CRUD、搜索、多源聚合 | ❌ |
| `embedding-daemon.ts` | 822 | ONNX 守护进程服务器 (IPC) | ❌ |
| `memory-vector.ts` | 805 | 向量索引 + 混合搜索 + Embedding Provider 接口 | 部分 |
| `memory-tags.ts` | 771 | LLM 打标、标签云、遗忘曲线 | 部分 |
| `memory-llm.ts` | 726 | LLM 自动提取 + tidy | ✅ |
| `memory-export-html.ts` | 687 | HTML 导出 (树形导航) | ❌ |
| `config.ts` | 677 | 三级配置系统 (env/jsonc/default) | ❌ |
| `memory-viewer.ts` | 500 | TUI 记忆查看器 + HTTP server | ✅ |
| `logger.ts` | 478 | JSONL 结构化日志 | ❌ |
| `role-store.ts` | 458 | 角色 CRUD、CWD 映射、迁移 | ❌ |
| `embedding-minilm.ts` | 443 | ONNX Direct Provider (单进程) | ❌ |
| `role-template.ts` | 376 | i18n 角色模板 (zh/en) | ❌ |
| `tui-renderers.ts` | 326 | Tool 结果 TUI 渲染器 | ✅ |
| `embedding-minilm-daemon-client.ts` | 154 | Daemon Client Provider | ❌ |
| `spinner-utils.ts` | 14 | Spinner 帧默认值 | ❌ |
| 测试文件 (5) | 492 | 各种测试 | - |

### 1.2 Extension Points 清单

#### 事件 (pi.on)

| 事件 | 功能 | 纯逻辑? |
|------|------|:---:|
| `session_start` | 加载角色、迁移结构、初始化向量 | 需分离 |
| `resources_discover` | 暴露 skills 目录 | ✅ |
| `before_agent_start` | 注入 system prompt (角色+记忆+向量召回+外部只读) | 需分离 |
| `agent_end` | 自动记忆提取判断+调度 | 需分离 |
| `session_before_compact` | 拦截压缩，注入记忆提取指令 | 需分离 |
| `session_shutdown` | 刷写 pending 记忆 + 向量索引 | 需分离 |
| `turn_end` | 进化提醒 (每日反思) | 需分离 |

#### 工具 (pi.registerTool)

| 工具 | 动作数 | 功能 |
|------|--------|------|
| `memory` | 14 | add_learning, add_preference, update_learning, update_preference, delete_learning, delete_preference, reinforce, search, list, consolidate, repair, llm_tidy, vector_rebuild, vector_stats |
| `role_info` | 1 | 目录结构列表 |
| `knowledge` | 4 | list, search, read, write |

#### 命令 (pi.registerCommand)

| 命令 | 功能 |
|------|------|
| `/role info/create/map/unmap/list` | 角色管理 (5 子命令) |
| `/memories` | 查看记忆 (TUI/HTTP) |
| `/memory-log` | 会话记忆操作日志 |
| `/memory-fix` | 修复 consolidated.md |
| `/memory-tidy` | 手动整理 |
| `/memory-tidy-llm` | LLM 整理 |
| `/memory-vector rebuild/stats` | 向量管理 |
| `/memory-tags` | 标签云 |
| `/memory-conflicts` | 冲突检测 |
| `/memory-export` | HTML 导出 |
| `/memory-distill/stop` | 交互式蒸馏 |
| `/kb list/search/stats` | 知识库 |

### 1.3 核心问题

```
┌─────────────────────────────────────────────────────────┐
│                    当前架构 (扁平)                        │
│                                                          │
│  index.ts ────────────────────────────────────────────┐  │
│    ├── 事件处理器 (内联业务逻辑)                        │  │
│    ├── 工具实现 (14+4+1 = 19 个动作, 全部内联)          │  │
│    ├── 命令实现 (12 个命令, 全部内联)                    │  │
│    ├── TUI 选择器 (角色选择/创建 UI)                    │  │
│    └── 辅助函数 (~30 个, 混杂)                          │  │
│                                                         │
│  业务逻辑 ←→ Pi API ←→ TUI 渲染  (三者强耦合)           │
└─────────────────────────────────────────────────────────┘
```

**问题清单:**

| # | 问题 | 影响 |
|---|------|------|
| 1 | **God File**: index.ts 2496 行, 所有逻辑内联 | 不可测试、不可复用 |
| 2 | **Pi API 强耦合**: 业务逻辑直接依赖 ExtensionContext | 无法脱离 pi 运行 |
| 3 | **状态散落**: currentRole/currentRolePath 在闭包中 | 无法序列化/跨进程 |
| 4 | **TUI 硬编码**: 命令处理器直接操作 TUI 组件 | CLI/MCP 模式无法运行 |
| 5 | **无统一接口层**: 每个工具/命令独立实现 | 无法统一导出为 CLI/MCP |
| 6 | **记忆逻辑膨胀**: memory-md.ts 2186 行 | 职责过多 |

---

## 二、目标架构

### 2.1 三层分离

```
┌──────────────────────────────────────────────────────────────┐
│                    Transport Layer (传输层)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Pi Ext   │  │ CLI      │  │ MCP      │  │ HTTP Daemon  │ │
│  │ Adapter  │  │ (Bun)    │  │ Server   │  │ (Bun)        │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
│       │              │              │               │         │
│       └──────────────┴──────┬───────┴───────────────┘         │
│                             │                                 │
├─────────────────────────────┼─────────────────────────────────┤
│                    Service Layer (服务层)                      │
│                    (统一函数调用接口)                           │
│  ┌──────────────────────────┴──────────────────────────────┐  │
│  │                 RolePersonaService                       │  │
│  │                                                          │  │
│  │  role.*         memory.*        knowledge.*              │  │
│  │  ┌───────────┐  ┌────────────┐  ┌──────────────────┐    │  │
│  │  │ create    │  │ addLearning│  │ listKnowledge    │    │  │
│  │  │ list      │  │ addPref    │  │ searchKnowledge  │    │  │
│  │  │ resolve   │  │ search     │  │ readKnowledge    │    │  │
│  │  │ activate  │  │ list       │  │ writeKnowledge   │    │  │
│  │  │ map       │  │ consolidate│  └──────────────────┘    │  │
│  │  │ unmap     │  │ repair     │                           │  │
│  │  └───────────┘  │ tidy       │  embedding.*              │  │
│  │                  │ extract    │  ┌──────────────────┐    │  │
│  │                  │ vectorReb  │  │ embed            │    │  │
│  │                  │ vectorStat │  │ rebuildIndex     │    │  │
│  │                  └────────────┘  │ getStats         │    │  │
│  │                                  └──────────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                  │
├─────────────────────────────┼──────────────────────────────────┤
│                    Core Layer (核心层)                          │
│                    (纯函数, 零外部依赖)                         │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ role-store │  │ memory-md    │  │ knowledge             │  │
│  │ role-tpl   │  │ memory-tags  │  │ embedding-providers   │  │
│  │ config     │  │ memory-llm   │  │ embedding-daemon      │  │
│  │ logger     │  │ memory-vec   │  │ memory-export-html    │  │
│  └────────────┘  └──────────────┘  └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
role-persona/
├── package.json                  # Bun 项目
├── tsconfig.json
├── bun.lock
│
├── src/
│   ├── core/                     # 纯逻辑层 (零 pi 依赖)
│   │   ├── config.ts             # 配置系统 (精简: 解析 + 默认值)
│   │   ├── logger.ts             # JSONL 日志
│   │   ├── role-store.ts         # 角色 CRUD + CWD 映射
│   │   ├── role-template.ts      # i18n 模板
│   │   ├── memory-md.ts          # 记忆 CRUD + 解析 + 搜索
│   │   ├── memory-pending.ts     # Pending 层 (从 memory-md 拆出)
│   │   ├── memory-tags.ts        # 标签系统
│   │   ├── memory-export.ts      # HTML 导出
│   │   ├── knowledge.ts          # 知识库
│   │   ├── embedding-providers.ts # Provider 接口 + OpenAI/MiniLM/Daemon
│   │   ├── embedding-daemon.ts   # 守护进程服务器
│   │   └── types.ts              # 共享类型定义
│   │
│   ├── service/                  # 服务层 (统一函数接口)
│   │   ├── index.ts              # RolePersonaService 门面
│   │   ├── role-service.ts       # role.* 方法
│   │   ├── memory-service.ts     # memory.* 方法
│   │   ├── knowledge-service.ts  # knowledge.* 方法
│   │   ├── embedding-service.ts  # embedding.* 方法
│   │   └── auto-extract.ts       # 自动记忆提取编排
│   │
│   ├── transport/                # 传输层
│   │   ├── pi-adapter.ts         # Pi Extension 适配器 (向后兼容)
│   │   ├── cli.ts                # CLI 入口 (Bun)
│   │   ├── mcp-server.ts         # MCP Server (stdio/SSE)
│   │   ├── daemon.ts             # HTTP Daemon (Bun.serve)
│   │   └── tui-renderers.ts      # TUI 渲染器 (仅 pi adapter 使用)
│   │
│   └── bin/
│       ├── cli.ts                # CLI 入口 shebang
│       └── daemon.ts             # Daemon 入口
│
├── skills/                       # Pi 内嵌技能
├── tests/
│   ├── core/
│   └── service/
│
└── docs/
    ├── ARCHITECTURE.md
    └── MIGRATION.md
```

### 2.3 设计原则

| 原则 | 说明 |
|------|------|
| **依赖方向** | transport → service → core (单向, 不可逆) |
| **core 零依赖** | 不 import pi API, 不 import pi-tui, 仅用 node:fs + node:path |
| **service 层无副作用** | 不直接操作 UI, 返回结构化结果 |
| **transport 层薄** | 只做参数转换 + 结果格式化, 不含业务逻辑 |
| **Bun 原生** | 使用 Bun.serve, Bun.file, Bun.spawn |

---

## 三、Service 接口设计

### 3.1 RolePersonaService

```typescript
// src/service/index.ts

export interface RolePersonaService {
  // ── 生命周期 ──
  init(cwd: string): Promise<InitResult>
  dispose(): Promise<void>

  // ── 角色管理 ──
  role: {
    list(): RoleInfo[]
    get(): ActiveRole | null
    create(name: string): RoleCreateResult
    activate(name: string): Promise<ActivateResult>
    map(cwd: string, roleName: string): MapResult
    unmap(cwd: string): UnmapResult
    resolve(cwd: string): RoleResolution
    getIdentity(rolePath: string): RoleIdentity | null
    getPrompts(rolePath: string): string
    getStructure(rolePath: string, subPath?: string): DirectoryListing
  }

  // ── 记忆管理 ──
  memory: {
    addLearning(content: string, opts?: AddOpts): Promise<MemoryResult>
    addPreference(content: string, category?: string, opts?: AddOpts): Promise<MemoryResult>
    updateLearning(needle: string, newText: string): UpdateResult
    updatePreference(needle: string, newText: string, category?: string): UpdateResult
    deleteLearning(needle: string): DeleteResult
    deletePreference(needle: string): DeleteResult
    reinforce(needle: string): ReinforceResult
    search(query: string, opts?: SearchOpts): Promise<MemorySearchMatch[]>
    list(): MemoryListResult
    consolidate(): ConsolidateResult
    repair(opts?: RepairOpts): RepairResult
    tidyLlm(model?: string): Promise<LlmTidyResult>
    exportHtml(outputPath?: string): string
    detectConflicts(): ConflictReport
    getLog(): MemoryLogEntry[]

    // ── Pending 层 ──
    pending: {
      list(): PendingMemoryRecord[]
      promote(id: string): PromoteResult
      discard(id: string): DiscardResult
      expire(days?: number): ExpireResult
      stats(): PendingStats
    }

    // ── 自动提取 ──
    autoExtract(messages: Message[], opts?: ExtractOpts): Promise<ExtractResult>
  }

  // ── 知识库 ──
  knowledge: {
    list(opts?: ListOpts): KnowledgeListResult
    search(query: string, opts?: SearchOpts): KnowledgeSearchResult[]
    read(path: string): KnowledgeEntry | null
    write(entry: KnowledgeWriteInput): KnowledgeWriteResult
  }

  // ── 向量记忆 ──
  embedding: {
    init(rolePath: string): Promise<boolean>
    isActive(): boolean
    rebuild(): Promise<RebuildResult>
    stats(): VectorStats | null
    search(query: string, limit?: number): Promise<VectorSearchResult[]>
    dispose(): void
  }

  // ── System Prompt 编排 ──
  buildSystemPrompt(basePrompt: string, messages: Message[]): Promise<string>
}
```

### 3.2 核心类型

```typescript
// src/core/types.ts

export interface ActiveRole {
  name: string
  path: string
  identity: RoleIdentity | null
  isFirstRun: boolean
}

export interface InitResult {
  role: ActiveRole | null
  resolution: RoleResolution
  migration: MigrationResult
}

export interface MemoryResult {
  stored: boolean
  id?: string
  reason?: string
  duplicate?: boolean
  tags?: string[]
}

export interface MemorySearchMatch {
  kind: "learning" | "preference" | "event"
  id?: string
  text: string
  category?: string
  used?: number
  score?: number
}

export interface Message {
  role: "user" | "assistant" | "system"
  content: Array<{ type: string; text?: string }>
}

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>
  details?: Record<string, any>
  isError?: boolean
}

// 所有 service 方法返回 ToolCallResult 兼容格式
// 这样 CLI/MCP/Pi 三端可以统一消费
```

### 3.3 方法实现示例

```typescript
// src/service/memory-service.ts

import { addRoleLearningWithTags, searchRoleMemory, ... } from "../core/memory-md.ts"
import { queueVectorIndex, hybridSearch, ... } from "../core/memory-vector.ts"

export function createMemoryService(ctx: ServiceContext) {
  return {
    async addLearning(content: string, opts?: AddOpts): Promise<MemoryResult> {
      const { rolePath, roleName } = ctx.requireActiveRole()
      const result = await addRoleLearningWithTags(rolePath, roleName, content, {
        appendDaily: true,
        ...opts,
      })
      if (result.stored && result.id && ctx.config.vectorMemory?.autoIndex) {
        queueVectorIndex(result.id, content, "learning")
      }
      return result
    },

    async search(query: string, opts?: SearchOpts): Promise<MemorySearchMatch[]> {
      const { rolePath, roleName } = ctx.requireActiveRole()
      if (ctx.embeddingActive && ctx.config.vectorMemory?.hybridSearch) {
        return hybridSearch(rolePath, roleName, query)
      }
      return searchRoleMemory(rolePath, roleName, query)
    },
    // ...
  }
}
```

---

## 四、Transport 层设计

### 4.1 CLI (Bun)

```bash
# 角色管理
role-persona role list
role-persona role create <name>
role-persona role info
role-persona role map <role>
role-persona role unmap

# 记忆管理
role-persona memory add-learning "content"
role-persona memory add-preference "content" --category Code
role-persona memory search "query"
role-persona memory list
role-persona memory consolidate
role-persona memory repair
role-persona memory tidy [--llm] [--model provider/model]
role-persona memory export [--output path.html]
role-persona memory conflicts
role-persona memory log

# 知识库
role-persona knowledge list
role-persona knowledge search "query"
role-persona knowledge read <path>
role-persona knowledge write --title "..." --content "..." [--category ...]

# 向量
role-persona embedding stats
role-persona embedding rebuild

# 守护进程
role-persona daemon start [--port 3939]
role-persona daemon stop
role-persona daemon status

# 系统
role-persona init
role-persona prompt  # 输出完整 system prompt
```

### 4.2 MCP Server

```typescript
// src/transport/mcp-server.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export function createMcpServer(service: RolePersonaService): McpServer {
  const server = new McpServer({
    name: "role-persona",
    version: "1.0.0",
  })

  // Tool: memory (14 actions → 1 MCP tool with action enum)
  server.tool(
    "memory",
    "Manage role memory (learnings, preferences, search, maintenance)",
    {
      action: z.enum(["add_learning", "add_preference", "search", ...]),
      content: z.string().optional(),
      // ...
    },
    async (params) => {
      const result = await service.memory[mapAction(params.action)](...)
      return { content: result.content }
    }
  )

  // Tool: knowledge (4 actions)
  server.tool("knowledge", ...)

  // Tool: role_info
  server.tool("role_info", ...)

  // Resource: role files
  server.resource("role-files", "role://files", async () => { ... })

  return server
}

// 启动: stdio 模式
// role-persona mcp --transport stdio
// role-persona mcp --transport sse --port 3939
```

### 4.3 HTTP Daemon

```typescript
// src/transport/daemon.ts

export function createDaemon(service: RolePersonaService, port = 3939) {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      const body = await req.json().catch(() => ({}))

      // POST /api/role/*
      // POST /api/memory/*
      // POST /api/knowledge/*
      // POST /api/embedding/*
      // GET  /api/health

      const [_, resource, action] = url.pathname.split("/")
      const handler = routeMap[resource]?.[action]
      if (!handler) return Response.json({ error: "Not found" }, { status: 404 })

      const result = await handler(body)
      return Response.json(result)
    },
  })
}
```

### 4.4 Pi Extension Adapter (向后兼容)

```typescript
// src/transport/pi-adapter.ts

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent"
import { createService } from "../service/index.ts"
import { registerToolRenderers } from "./tui-renderers.ts"

export default function rolePersonaExtension(pi: ExtensionAPI) {
  registerToolRenderers(pi)
  const service = createService()

  // ── 事件薄包装 ──
  pi.on("session_start", async (_event, ctx) => {
    const result = await service.init(ctx.cwd)
    if (result.role) {
      ctx.ui?.setStatus("role", result.role.identity?.name || result.role.name)
    }
  })

  pi.on("before_agent_start", async (event, ctx) => {
    const prompt = await service.buildSystemPrompt(event.systemPrompt, event.messages)
    return { systemPrompt: prompt }
  })

  pi.on("agent_end", async (event, ctx) => {
    // 委托给 service 层的自动提取
    await service.memory.autoExtract(event.messages)
  })

  // ── 工具薄包装 ──
  pi.registerTool({
    name: "memory",
    description: "...",
    parameters: memorySchema,
    async execute(_id, params) {
      const action = params.action as string
      switch (action) {
        case "add_learning":
          return toToolResult(await service.memory.addLearning(params.content))
        case "search":
          return toToolResult(await service.memory.search(params.query || params.content))
        // ... 每个 action 只需 1-2 行
      }
    },
    ...memoryToolRenderers,
  })

  // ── 命令薄包装 ──
  pi.registerCommand("role", {
    description: "...",
    handler: async (args, ctx) => {
      const [cmd, ...rest] = (args || "").trim().split(/\s+/)
      switch (cmd) {
        case "list":
          return sendResult(pi, service.role.list())
        case "create":
          return sendResult(pi, service.role.create(rest[0]))
        // ...
      }
    },
  })
}
```

**关键点:** Pi adapter 变成约 **300-400 行**的薄适配层, 而不是 2496 行的 god file。

---

## 五、拆分计划

### Phase 1: 类型提取 + Core 层独立

| 任务 | 文件 | 预估 |
|------|------|------|
| 创建 `src/core/types.ts` | 新建 | 100 行 |
| 迁移 `config.ts` → `src/core/config.ts` | 修改 | 10 行 |
| 迁移 `logger.ts` → `src/core/logger.ts` | 修改 | 5 行 |
| 迁移 `role-store.ts` → `src/core/role-store.ts` | 修改 | 10 行 |
| 迁移 `role-template.ts` → `src/core/role-template.ts` | 无改动 | 0 |
| 迁移 `spinner-utils.ts` → `src/core/spinner-utils.ts` | 无改动 | 0 |
| 从 `memory-md.ts` 拆出 `memory-pending.ts` | 重构 | 200 行 |
| 迁移 `memory-md.ts` → `src/core/memory-md.ts` | 修改 | 20 行 |
| 迁移 `memory-tags.ts` → `src/core/memory-tags.ts` | 修改 | 10 行 |
| 迁移 `memory-export-html.ts` → `src/core/memory-export.ts` | 无改动 | 0 |
| 迁移 `knowledge.ts` → `src/core/knowledge.ts` | 修改 | 10 行 |
| 迁移 `embedding-*.ts` → `src/core/embedding-*.ts` | 修改 | 20 行 |

### Phase 2: Service 层

| 任务 | 文件 | 预估 |
|------|------|------|
| `ServiceContext` + `createService()` | `src/service/index.ts` | 80 行 |
| `role-service.ts` (从 index.ts 提取) | 新建 | 150 行 |
| `memory-service.ts` (从 index.ts 提取) | 新建 | 250 行 |
| `knowledge-service.ts` (从 index.ts 提取) | 新建 | 100 行 |
| `embedding-service.ts` (从 index.ts 提取) | 新建 | 80 行 |
| `auto-extract.ts` (从 index.ts 提取) | 新建 | 200 行 |

### Phase 3: Transport 层

| 任务 | 文件 | 预估 |
|------|------|------|
| `pi-adapter.ts` (重写 index.ts) | 重写 | 400 行 |
| `tui-renderers.ts` (保留) | 迁移 | 0 |
| `cli.ts` (新) | 新建 | 300 行 |
| `mcp-server.ts` (新) | 新建 | 200 行 |
| `daemon.ts` (新) | 新建 | 150 行 |

### Phase 4: 验证 + 迁移

| 任务 | 说明 |
|------|------|
| 单元测试 | core 层模块独立可测 |
| 集成测试 | service 层端到端 |
| Pi 兼容性 | pi-adapter 通过原有功能验证 |
| CLI 验证 | 全部命令可执行 |
| MCP 验证 | Claude/Cursor 可连接 |

---

## 六、迁移策略

### 6.1 渐进式迁移 (不破坏现有功能)

```
Week 1: Phase 1 — Core 层独立 (纯移动+小修改)
Week 2: Phase 2 — Service 层抽取 (从 index.ts 拆业务逻辑)
Week 3: Phase 3 — Transport 层 (CLI + MCP + Daemon)
Week 4: Phase 4 — 验证 + 文档 + 切换
```

### 6.2 关键约束

- **向后兼容**: pi-adapter 必须保持所有现有 extension points 功能
- **渐进切换**: 可以同时存在旧 index.ts 和新架构, 逐步迁移
- **测试先行**: core 层每个模块都有独立的可执行测试
- **Bun 原生**: CLI/daemon 使用 Bun runtime, 不需要 Node.js

---

## 七、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| Pi API 兼容性 | 中 | pi-adapter 保持与原 index.ts 完全相同的 API 行为 |
| memory-md.ts 拆分引入 bug | 中 | 拆分前先写集成测试覆盖现有行为 |
| MCP 协议变化 | 低 | 使用官方 SDK, 薄封装 |
| 性能退化 | 低 | service 层是零开销抽象 (函数调用) |
| Bun 兼容性 | 低 | 核心层已用 node:fs/path, Bun 完全兼容 |

---

## 八、预期收益

| 指标 | 现状 | 目标 |
|------|------|------|
| index.ts 行数 | 2,496 | ~400 (pi-adapter) |
| 可独立测试模块 | 0 | 12+ (core 层全部) |
| 运行模式 | 仅 Pi Extension | Pi + CLI + MCP + Daemon |
| 最大文件行数 | 2,496 | ~400 |
| 业务逻辑复用 | 不可 | service 层可被任何 transport 调用 |
