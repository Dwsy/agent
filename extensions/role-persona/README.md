# Role Persona Extension

> "記憶が人を形作る" — Pi 角色人格与持久记忆系统

每个角色拥有独立的人格文件、记忆层、知识库视角和工作区映射。
这不是一个单纯的 `README + MEMORY.md` 小玩具。它现在是一个分层记忆运行时。

## 它解决什么问题

- 给不同项目或身份绑定不同角色
- 让角色拥有可持续的人格上下文，而不是每次会话都失忆
- 把原始会话事实、结构化经验、待验证候选记忆、向量检索和知识库分层管理
- 让记忆写入、召回、整理、验证、搜索形成闭环

## 核心能力

- **角色映射**：按 CWD 自动绑定角色
- **结构化人格文件**：`core/*.md` 注入系统上下文
- **分层记忆系统**：`daily` / `pending` / `consolidated` / `tags` / `vector`
- **自动记忆提取**：会话结束、压缩前、手动工具都可入库
- **待验证记忆层**：自动提取结果先进入 `pending.md`
- **按需召回**：首条消息按查询加载高优记忆 + 搜索结果 + 最近日记
- **向量记忆**：LanceDB + embedding + hybrid search
- **标签系统**：LLM 自动打标、标签关联、遗忘曲线
- **知识系统**：role/global/project/external 多源知识检索
- **可编程工具**：`memory` / `role_*` / `knowledge`

## 快速开始

```bash
/role create my-assistant
cd ~/project
/role map my-assistant

# 然后编辑角色人格
# ~/.pi/roles/my-assistant/core/identity.md
```

## 目录结构

```text
~/.pi/roles/
├── config.json                   # CWD → 角色映射
└── <role>/
    ├── core/                     # 人格与约束
    │   ├── agents.md
    │   ├── identity.md
    │   ├── soul.md
    │   ├── user.md
    │   ├── tools.md
    │   ├── heartbeat.md
    │   └── constraints.md
    ├── memory/
    │   ├── consolidated.md       # L2 结构化长期记忆（主真相源）
    │   ├── pending.md            # 待验证候选记忆
    │   └── daily/
    │       └── YYYY-MM-DD.md     # L1 原始会话记录
    ├── context/                  # 活跃项目/会话状态
    ├── skills/                   # 角色启用技能清单
    ├── archive/                  # 归档
    └── .vector-db/               # L3 向量索引（可选）
```

## 架构总览

```text
Pi Core (事件系统)
    ↓
index.ts (编排层)
    ├─ session_start
    ├─ before_agent_start
    ├─ agent_end
    ├─ session_before_compact
    └─ session_shutdown
    ↓
┌─────────────────────────────────────────────────────────┐
│ 基础设施                                                │
│ role-store   role-template   config   logger           │
├─────────────────────────────────────────────────────────┤
│ 记忆核心                                                │
│ memory-md    memory-llm      memory-tags               │
├─────────────────────────────────────────────────────────┤
│ 检索与交互                                              │
│ memory-vector  memory-viewer  tui-renderers            │
├─────────────────────────────────────────────────────────┤
│ 知识层                                                  │
│ knowledge.ts (role / global / project / external)      │
└─────────────────────────────────────────────────────────┘
```

## 记忆分层：不是两层，是一整套流水线

### L3 运行时层

- `memoryLog[]`：会话内操作日志
- `TagIndex`：标签索引、关联图、遗忘曲线
- `VectorDB`：语义检索索引

### Pending 验证层

- 文件：`memory/pending.md`
- 作用：存放自动提取但**尚未被真实使用验证**的记忆
- 状态：
  - `○` pending — 等待验证
  - `✓` promoted — 已晋升到 consolidated
  - `✗` discarded — 已丢弃/过期

### L2 结构化层

- 文件：`memory/consolidated.md`
- 作用：长期、去重、可复用记忆
- 结构：
  - `# Learnings (High Priority)` → `used >= 3`
  - `# Learnings (Normal)` → `used 1-2`
  - `# Learnings (New)` → `used = 0`
  - `# Preferences:*`
  - `# Events`

### L1 原始层

- 文件：`memory/daily/YYYY-MM-DD.md`
- 作用：保留每日原始事实流，不强行去重，不假装高级

## 真实验证机制

这是当前 README 之前最脱节的地方。真实逻辑如下。

### 自动提取不会直接进入长期记忆

`auto-extract` 和 `compaction rescue` 提取出的 learning，默认先进 `pending.md`，而不是直接写入 `consolidated.md`。

### 为什么这么做

因为自动提取很容易把这些垃圾塞进长期记忆：

- 一次性任务流水
- 当天临时状态
- 只对当前会话有意义的噪音
- "已修复/已完成/已验证" 这种没迁移价值的废话

### 晋升条件

pending 记忆通过以下方式被验证并晋升：

1. **搜索命中并足够相关**
   - `memory({ action: "search", query: "..." })`
   - score ≥ 0.5 时自动 promote / reinforce
2. **显式 reinforce**
   - `memory({ action: "reinforce", content: "..." })`
3. **人工维护/整理**
   - 通过 `memory-organize` 工作流或直接工具操作

### 过期机制

- 长期未被使用的 pending 条目会过期
- 已无价值的候选记忆会标记为 `✗`

### 流转图

```text
auto extract / compaction
        ↓
   memory/pending.md [○]
        ↓
   used in relevant context?
      ├─ no  → expire/discard [✗]
      └─ yes → promote to consolidated [✓]
```

## 事件流水线

### `session_start`

- 加载配置
- 根据 CWD 解析角色
- 迁移旧目录布局
- 加载 `core/*.md` 提示块

### `before_agent_start`

首条消息：
- High Priority 记忆
- 按需搜索结果
- 最近 2 天 daily
- 向量召回（可选）
- 外部只读记忆（可选）

后续消息：
- 仅加载最近 2 天 daily

### `agent_end`

满足任一条件时触发自动提取：

- 累计轮次达到阈值
- 命中结束关键词
- 时间间隔达到阈值且消息数足够

然后：
- 调用 LLM 提取 learning / preference
- 应用过滤规则
- learning 先进 `pending.md`
- preference / event 写入对应层
- 追加 daily
- 异步更新 tags / vector index

### `session_before_compact`

上下文压缩前插入 `<memory>...</memory>` 提取指令：

- 同一次 LLM 调用同时返回 summary + memory JSON
- 从 summary 中剥离 memory block
- 零额外调用抢救上下文记忆

### `session_shutdown`

- 快速 flush pending 相关状态
- flush vector index
- dispose 运行时资源

## 自动提取不是瞎提取

提取后还要过过滤器。

系统会过滤明显的临时任务观察，比如：

- "已完成..."
- "已修复..."
- "已实现..."
- "已删除..."
- "已验证..."

原因很简单：

这些通常是任务流水，不是长期经验。
把这种东西堆进长期记忆，只会把系统搞成电子垃圾场。

## 标签系统

`memory-tags.ts` 不是装饰品，它是召回质量的重要部分。

### 功能

- LLM 自动从记忆文本提取 3-8 个 tags
- 建立标签共现关联图
- 维护 learned vocabulary
- 用遗忘曲线衰减标签强度
- 支持标签云与相关标签提升

### 搜索加权

- 精确 tag 匹配：`+0.3`
- 相关 tag 匹配：`+0.15`

这让不同措辞但语义相关的记忆更容易浮上来。

## 向量记忆

`memory-vector.ts` 在 Markdown 真相源之上叠加语义索引，不替代原系统。

### 特性

- LanceDB 本地索引
- OpenAI Embedding provider
- 本地 embedding provider（可接 pi-session-manager）
- Hybrid Search：keyword + vector
- RRF 融合排序
- auto-recall：在 `before_agent_start` 注入相关语义记忆
- auto-index：写入记忆后异步更新索引
- rebuild：从 `consolidated.md + daily/*.md` 全量重建
- graceful degradation：embedding 不可用时回退关键词搜索

### 数据源

向量索引并不只索引 `consolidated.md`。
当前实现会索引：

- `memory/consolidated.md`
- `memory/daily/*.md`

这点以前文档写错过，已经修正。

## 知识系统

除了记忆，还有 `knowledge.ts` 管理的知识层。

### 来源优先级

1. role knowledge（可写）
2. global knowledge（可写）
3. project `docs/knowledge/`（只读）
4. external sources（只读）
5. skills 目录（作为可搜索能力说明）

### 用途区分

- **Memory**：关于“这个角色学到了什么”
- **Knowledge**：关于“系统/项目/领域有哪些可复用知识”

别把两者混成一锅粥。那是烂设计。

## 工具 API

### `memory`

常用 actions：

```ts
memory({ action: "search", query: "pending verification" })
memory({ action: "list" })
memory({ action: "add_learning", content: "声明完成前验证铁律" })
memory({ action: "add_preference", category: "Workflow", content: "先检索后修改" })
memory({ action: "reinforce", content: "声明完成前验证铁律" })
memory({ action: "consolidate" })
memory({ action: "repair" })
memory({ action: "llm_tidy" })
memory({ action: "vector_rebuild" })
memory({ action: "vector_stats" })
```

能力覆盖：

- learning / preference 增删改查
- search + auto-reinforce + pending auto-promote
- 结构修复
- 规则去重
- LLM 整理
- 向量索引重建/状态查看

### `role_read` / `role_write` / `role_list` / `role_search`

```ts
role_read({ path: "memory/consolidated.md" })
role_write({ path: "context/active-project.md", mode: "overwrite", content: "..." })
role_list({ path: "core", recursive: true })
role_search({ path: ".", query: "constraint" })
```

### `knowledge`

```ts
knowledge({ action: "search", query: "clean architecture", scope: "fullstack" })
knowledge({ action: "read", path: "design-systems/glassmorphism.md" })
knowledge({ action: "write", title: "RRF Hybrid Search", category: "retrieval", content: "..." })
```

## 命令

| 命令 | 用途 |
|------|------|
| `/role create/map/unmap/info/list` | 角色管理 |
| `/memories` | 查看记忆 |
| `/memories --export` | 导出浏览器记忆视图 |
| `/memory-log` | 查看会话内记忆操作日志 |
| `/memory-fix` | 修复结构问题 |
| `/memory-tidy` | 规则整理/去重 |
| `/memory-tidy-llm` | LLM 深度整理 |
| `/memory-tags` | 标签查看/标签云 |
| `/memory-vector stats/rebuild` | 向量记忆管理 |

## 配置

主配置文件：`extensions/role-persona/pi-role-persona.jsonc`

优先级：

```text
env ROLE_* > pi-role-persona.jsonc > defaults
```

### 关键配置块

```jsonc
{
  "autoMemory": {
    "enabled": true,
    "model": "openai/gpt-4.1-mini",
    "batchTurns": 5,
    "intervalMs": 1800000,
    "maxItems": 8,
    "tagModel": "openai/gpt-4.1-mini"
  },
  "memory": {
    "onDemandSearch": {
      "enabled": true,
      "maxResults": 5,
      "minScore": 0.2,
      "alwaysLoadHighPriority": true
    }
  },
  "vectorMemory": {
    "enabled": false,
    "provider": "openai",
    "model": "text-embedding-3-small",
    "hybridSearch": true,
    "autoRecall": true,
    "autoIndex": true
  },
  "externalReadonly": {
    "enabled": false,
    "baseUrl": "http://127.0.0.1:3000",
    "topK": 5,
    "minConfidence": 0.6
  }
}
```

## 记忆文件格式

### `memory/consolidated.md`

```markdown
---
name: "zero"
version: "4.0.0"
created: "2026-02-21"
updated: "2026-04-17"
autoConsolidate: true
consolidationInterval: "7d"
tags: ["clean-architecture", "memory-management"]
---

# Learnings (High Priority)
- [6x] 声明完成前验证铁律：运行命令→读取输出→确认结果→才能声明

# Learnings (Normal)
- [2x] 软删除优先

# Learnings (New)
- [0x] 标签系统闭环是快速 win

# Preferences: Workflow
- 先检索、再修改、后验证

# Events
## [2026-04-17] 某次关键变更
详情...
```

### `memory/pending.md`

```markdown
---
role: "zero"
updated: "2026-04-17"
---

# Pending Memories

- [○] [auto] 某条自动提取的学习
  id: abc123def0
  created: 2026-04-17
```

## 文档与源码入口

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 架构概览
- [CHANGELOG.md](./CHANGELOG.md) — 变更历史
- [CONFIG-MIGRATION.md](./CONFIG-MIGRATION.md) — 配置迁移
- [comparison-analysis.html](./comparison-analysis.html) — 方案/设计比较分析
- [project-analysis.html](./project-analysis.html) — 项目分析可视化
- `skills/memory-recall/SKILL.md` — 召回工作流
- `skills/memory-organize/SKILL.md` — 整理与 pending 管理

## 设计原则

1. **文件即状态**：Markdown 仍然是核心真相源
2. **先验证再沉淀**：自动提取先走 pending，不直接污染长期记忆
3. **静默降级**：向量、外部服务、LLM 标签失败都不应打断主流程
4. **分层而不是混堆**：daily / pending / consolidated / knowledge 各干各的
5. **零额外调用优先**：compaction rescue 复用已有 LLM 调用
6. **可观测**：`/memory-log`、viewer、tag cloud、vector stats 都能看状态

## 什么时候该看哪个文件

- 想看主流程：`index.ts`
- 想看记忆真相源与 pending：`memory-md.ts`
- 想看自动提取：`memory-llm.ts`
- 想看标签与遗忘曲线：`memory-tags.ts`
- 想看语义检索：`memory-vector.ts`
- 想看知识层：`knowledge.ts`
- 想看角色目录与迁移：`role-store.ts`

---

Based on [OpenClaw](https://openclaw.io) Agent Runtime
