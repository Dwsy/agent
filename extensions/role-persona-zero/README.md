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
- **可编程工具**：`memory` / `role_info` / `knowledge`

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

`index.ts` 只剩装配（~90 行）：注册 `--nr` 禁用旗标，然后把 16 个 `runtime/` 模块拼起来。事件、工具、命令的实现全部在 `runtime/` 下。

```text
Pi Core (事件系统)
    ↓
index.ts (装配层 / composition root, ~90 行)
    ↓
runtime/ (编排实现, 16 个模块, ~3,000 行)
    ├─ context            共享 Runtime 状态
    ├─ lifecycle          session_start / resources_discover / agent_end / session_shutdown / turn_end
    ├─ injection          before_agent_start 系统提示注入
    ├─ compaction         session_before_compact 记忆抢救
    ├─ auto-memory        自动记忆检查点调度与 flush
    ├─ role-activation    角色激活流程
    ├─ external-readonly  外部只读记忆服务
    ├─ ui / messages / fs-utils
    ├─ tool-memory / tool-knowledge / tool-role-info
    └─ commands-memory / commands-kb / commands-role
    ↓
┌─────────────────────────────────────────────────────────┐
│ 基础设施                                                │
│ role-store   role-template   config   logger           │
├─────────────────────────────────────────────────────────┤
│ 记忆核心                                                │
│ memory-md (门面) → memory/ 15 个子模块                  │
│ memory-llm      memory-tags      memory-git            │
├─────────────────────────────────────────────────────────┤
│ 检索与交互                                              │
│ memory-vector  memory-viewer  tui-renderers            │
│ templates/viewer.{html,css,js}  (Web viewer)           │
├─────────────────────────────────────────────────────────┤
│ 知识层                                                  │
│ knowledge.ts (role / global / project / external)      │
└─────────────────────────────────────────────────────────┘
```

记忆核心同样拆过了：`memory-md.ts` 现在是 ~100 行的纯 re-export 门面，真正的实现在 `memory/` 下 15 个子模块（types / text / paths / pending-store / consolidated / pending / daily / mutations / search / prompt / stats / tidy / conflicts / export-data / html-export），依赖方向单向分层，外部调用方照旧 import `memory-md.ts` 即可。

## 记忆分层：不是两层，是一整套流水线

### L3 运行时层

- `memoryLog[]`：会话内操作日志，并同步写入 `.log/YYYY-MM-DD.jsonl`
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

## Web viewer

`/memories` 起一个只监听 `127.0.0.1` 的本地服务并打开浏览器，`/memory-export` 把同一套界面写成单文件 HTML。两者共用 `memory/export-data.ts` 一个数据构建器，界面共用 `templates/viewer.{html,css,js}`，不存在“服务端版和导出版长得不一样”的问题。

界面按记忆的分层组织：Overview 概览、Learnings / Preferences / Events / Daily / Pending 分区列表、Tags 标签词表；live 模式额外有 Logs（读 `.log/*.jsonl` 聚合）和 Role definition（直接编辑 `core/` `context/` `knowledge/` 下的 markdown，Read/Edit 双模式、脏标记、⌘S 保存、离开前确认）。

- 顶部过滤框支持普通子串和 `/regex/`，命中处高亮；分面 chip 按分区变化（learning 强度 / preference 分类 / 日期 / pending 状态 / 日志级别）
- 右侧详情面板显示完整正文与元数据，长文本不再被表格截断
- 键盘：`/` 聚焦过滤、`j/k` 或方向键选择、`1..9` 跳分区、`[`/`]` 切分面、`c` 复制、`d` 开关详情、`e` 编辑、`n` 新建、`t` 换主题、`r` 从磁盘重载、`?` 快捷键表
- 明暗主题跟随系统，可手动切换并记住选择；窄屏下侧栏变抽屉、详情变底部面板
- live 模式下每次请求都重新读盘，`r` 可在 agent 继续写记忆时刷新当前视图

### 直接改记忆

live 模式下 learning / preference / event / daily 都能在详情面板里改：编辑正文（preference 连带分类、event 连带标题与日期）、删除（二次确认，并说明会重写哪个文件）、learning 可 +1 次强化；pending 条目可一键晋升或丢弃；工具栏的 New 按钮在对应分区新建条目（daily 除外——日记由 agent 追加，viewer 只负责改和删）。每次写入后前端重新拉取 `/api/data`，所以你看到的永远是磁盘上的状态。

日记条目没有 id，用「日期 + 块序号」定位，并且请求里带上你当时看到的原文；对不上就拒绝写入。改写会保留原有时间戳与类型标记，只替换正文，并和其它记忆写入一样走 `writeCommittedMemoryFile`（Git 审计不断链）。

两条安全保证值得单独说：

1. **精确 id，不做模糊回退**。底层的 `updateRoleLearning` 等函数在 id 落空时会退化成文本子串匹配（这对 LLM 工具是对的），但对已经知道 id 的界面是危险的——可能改到另一条相似记忆。所以服务端在调用前先校验该 id 确实存在，落空就返回 409 让你重新加载。
2. **并发写入被拒绝**。`saveRoleMemory` 带 `expectedHash`，agent 在你编辑期间写过同一个文件时写入会被拒，界面提示重新加载而不是覆盖。

表单有未保存改动时，切分区、切分面或选中别的条目都会先确认；显式点 Cancel 或按 Esc 则直接丢弃（那是你主动要的）。

所有改动都会以 `source: "viewer"` 记进 JSONL 审计日志，`/memory-log` 里和工具、压缩抢救的操作并排显示。

数据接口只有四个：`GET /api/data`（重建快照）、`GET /api/logs`（日志聚合）、`GET|PUT /api/core?file=`（角色定义读写，路径被限制在 `core/` `context/` `knowledge/` 三个目录内的 `.md`）、`POST /api/memory`（记忆增删改，action 为 create/update/delete/reinforce/promote/discard）。

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

渐进式两工具设计:schema 只有 `role_search({ query, scope?, limit? })` 和 `role_exec({ op, args })`,详细的操作目录与参数规范不常驻上下文,通过 `role_exec({ op: "help" })` 按需加载。旧的 `memory` / `knowledge` / `role_info` 三工具已删除。

模型是记忆的第一编辑者:注入到上下文的每条记忆都带 `[id:...]`,看到过时/错误条目直接用该 id 改删,不需要先 search 一轮。后台提取只是安全网。

### `role_search`

统一检索记忆(全层,向量可用时混合检索,高分命中自动 reinforce/promote)与知识库:

```ts
role_search({ query: "pending verification" })
role_search({ query: "clean architecture", scope: "knowledge" })   // scope: all|memory|knowledge
```

### `role_exec`

所有操作走 op 分发,`help` 返回完整目录:

```ts
role_exec({ op: "help" })                                          // 按需加载操作目录
role_exec({ op: "help", args: { topic: "edit_spec" } })            // 直接编辑文件的格式规范
role_exec({ op: "read", args: { section: "pending" } })            // 全量带 id 视图
role_exec({ op: "add_learning", args: { content: "声明完成前验证铁律" } })
role_exec({ op: "add_preference", args: { content: "先检索后修改", category: "Workflow" } })
role_exec({ op: "update_learning", args: { id: "a1b2c3d4e5", content: "新表述" } })
role_exec({ op: "update_event", args: { id: "...", category: "新标题", date: "2026-08-13" } })
role_exec({ op: "promote_pending", args: { ids: ["...", "..."] } })  // 审阅后台提取的候选
role_exec({ op: "kb_read", args: { path: "design-systems/glassmorphism.md" } })
role_exec({ op: "kb_write", args: { title: "RRF Hybrid Search", category: "retrieval", content: "..." } })
role_exec({ op: "role_info", args: { path: "core", recursive: true } })
role_exec({ op: "llm_tidy" })   // consolidate / repair / vector_rebuild / vector_stats 同理
```

能力覆盖:

- learning / preference / event 全量增删改查(events 精确 id 匹配)
- read 带 id 全量视图 + section 过滤
- pending 候选人工审阅:promote / discard,支持 ids 批量
- 知识库 kb_list / kb_read / kb_write
- 结构修复、规则去重、LLM 整理、向量索引重建/状态查看
- 所有变更走 Git 提交与 JSONL 审计,向量索引自动同步

## 命令

| 命令 | 用途 |
|------|------|
| `/role` | 直接打开自定义角色 TUI 控制中心（非系统 select）：状态、切换/映射、创建、默认角色、禁用、注入预览、记忆查看与全量配置 |
| `/role create/map/unmap/info/list` | 兼容的命令行角色管理入口 |
| `/memories` | 查看记忆（默认起本地 HTTP 服务并打开浏览器；`/memories tui` 用终端查看器） |
| `/memory-export [path]` | 导出为单文件 HTML 快照（与 `/memories` 同一套界面，去掉需要服务端的功能） |
| `/memory-log` | 查看近期持久化与当前会话记忆操作日志 |
| `/memory-fix` | 修复结构问题 |
| `/memory-tidy` | 规则整理/去重 |
| `/memory-tidy-llm` | LLM 深度整理 |
| `/memory-tags [--export] [keyword]` | 标签查看/标签云 |
| `/memory-conflicts` | 检测记忆冲突 |
| `/memory-distill` / `/memory-distill-stop` | 交互式记忆→知识蒸馏模式开关 |
| `/memory-vector stats/rebuild` | 向量记忆管理 |
| `/kb list/search/stats` | 知识库查看与搜索 |

## 配置

主配置文件：`~/.pi/roles/pi-role-persona.jsonc`（`PI_ROLES_DIR` / `PI_AGENT_ROLES_DIR` 可覆盖目录）

优先级：

```text
env ROLE_* > pi-role-persona.jsonc > defaults
```

无参数 `/role` 会直接渲染自定义键盘导航 overlay（不会先进入系统 `select`），并可在 TUI 中编辑全部配置字段。修改按字段合并写入配置文件，不会覆盖未编辑字段；环境变量仍具有最高优先级。部分启动期常量、角色存储目录和向量后端设置需执行 `/reload` 或重启后完全生效。

“查看当前实际注入内容”会展示角色 core prompt、高优先级记忆、长期记忆和启用的 daily memory。按需关键词召回、向量召回和外部只读记忆依赖下一条用户查询，因此界面只展示其真实开关与规则，不执行搜索或伪造结果。

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
- [6x] 声明完成前验证铁律：运行命令→读取输出→确认结果→才能声明 <!-- tags: verification, workflow | src: compaction | seen: 2026-04-17 -->

# Learnings (Normal)
- [2x] 软删除优先

# Learnings (New)
- [0x] 标签系统闭环是快速 win <!-- tags: memory -->

# Preferences: Workflow
- 先检索、再修改、后验证 <!-- tags: workflow -->

# Events
## [2026-04-17] 某次关键变更
详情...
```

条目末尾的 HTML 注释是机器维护的元数据：`tags`（逗号分隔）、`src`（来源）、`seen`（最后一次被强化的日期）。用注释是因为它在任何 markdown 渲染里都不可见、解析上不会和正文歧义，而且人在编辑原始文件时一眼能看出这段不归自己管。没有元数据的旧条目照常解析，只是这些字段为空。

### `memory/daily/YYYY-MM-DD.md`

```markdown
# Memory: 2026-04-17

## [09:14] EVENT

当天发生的事，可以有多行。

## [14:02] LESSON

从这件事里学到的东西。
```

每个 `##` 块是一条独立条目，viewer 用「日期 + 块序号」定位它，改写时保留原有时间戳与类型标记。

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
- `runtime/` — 事件、工具、命令的编排实现（16 个模块）
- `memory/` — 记忆核心实现（15 个子模块，经 `memory-md.ts` 门面导出）
- `templates/viewer.{html,css,js}` — Web viewer 的唯一实现
- `skills/memory-recall/SKILL.md` — 召回工作流
- `skills/memory-organize/SKILL.md` — 整理与 pending 管理

## 开发与验证

```bash
bun test                  # 或 npm run test；当前 116 tests / 14 files 全绿
bash scripts/typecheck.sh # 或 npm run typecheck；对着实际安装的 pi 做全图 tsc 检查
```

`scripts/typecheck.sh` 会定位 `pi` 二进制所在的安装目录，把 pi loader 运行时的 import 别名镜像成 tsc `paths`，所以类型检查和运行时解析走同一套包。可选原生依赖（lancedb / onnxruntime / llama）由 `types/optional-deps.d.ts` 打桩，不用装原生二进制也能跑。

导入约定：`complete` / `completeSimple` 必须显式从 `@earendil-works/pi-ai/compat` 导入——pi loader 把根路径 `@earendil-works/pi-ai` 也临时指向 compat，但那是过渡行为，补全类调用别依赖它。

## 设计原则

1. **文件即状态**：Markdown 仍然是核心真相源
2. **先验证再沉淀**：自动提取先走 pending，不直接污染长期记忆
3. **静默降级**：向量、外部服务、LLM 标签失败都不应打断主流程
4. **分层而不是混堆**：daily / pending / consolidated / knowledge 各干各的
5. **零额外调用优先**：compaction rescue 复用已有 LLM 调用
6. **可观测**：`/memory-log`、JSONL 审计日志、viewer、tag cloud、vector stats 都能看状态
7. **Git 审计**：当 `storage.rolesDir`（默认 `~/.pi/roles`）是 Git 仓库时，每次 consolidated/pending/daily memory 写入都会生成一个 `docs(<role>): ...` 提交；使用仓库锁与隔离 index，不会带走其他已暂存改动，冲突或提交失败会拒绝本次写入并恢复文件。

## 什么时候该看哪个文件

- 想看模块怎么拼起来：`index.ts`（就 ~90 行）
- 想看主流程：`runtime/lifecycle.ts` + `runtime/injection.ts`
- 想看记忆真相源（consolidated 解析/写入/修复）：`memory/consolidated.ts`
- 想看 pending 验证与晋升：`memory/pending.ts`
- 想看记忆搜索打分：`memory/search.ts`
- 想看注入用的记忆块拼装：`memory/prompt.ts`
- 想看自动提取：`memory-llm.ts` + `runtime/auto-memory.ts`
- 想看压缩期记忆抢救：`runtime/compaction.ts`
- 想看标签与遗忘曲线：`memory-tags.ts`
- 想看语义检索：`memory-vector.ts`
- 想看知识层：`knowledge.ts`
- 想看角色目录与迁移：`role-store.ts`
- 想看记忆写入的 Git 提交机制：`memory-git.ts`
- 想看 Web viewer：`memory/export-data.ts`（数据契约）+ `templates/viewer.js`（界面）

---

Based on [OpenClaw](https://openclaw.io) Agent Runtime
