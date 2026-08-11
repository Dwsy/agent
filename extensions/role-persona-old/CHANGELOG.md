# Changelog

## [Unreleased]

### Changed (第二轮并行完善)
- **配置热加载**：runtime 模块（auto-memory / external-readonly / injection / lifecycle / compaction）的模块级 config 常量快照全部改为调用点实时读取，`reloadConfig()` 即刻生效；force-keywords 正则按源字符串 memoize
- **memory/ 清理**：移除 `repairRoleMemory` 从未读取的 `force` 参数及三个调用点；移除 `parsePendingMemory` 恒为空的 `roleName` 参数；conflicts.ts 与 text.ts 的相似度实现差异标注为有意保留
- **文档同步**：README / ARCHITECTURE 按拆分后结构重写（runtime/ 16 模块、memory/ 14 子模块、工程设施、实测行数与命令表）

### Fixed (第二轮)
- `writeKnowledge({ global: false })` 且无 rolePath 时回退写全局目录却标 `source: "role"`，现返回真实来源
- frontmatter 序列化不转义引号/反斜杠、tags 含逗号或 `]` 破坏往返；现转义并保持旧磁盘格式可读

### Added (第二轮)
- `memory-api.test.ts`：pending 生命周期（添加→晋升→过期）、搜索驱动晋升阈值（0.5）、去重、reinforce 分层、repair 幂等，5 个行为测试
- 测试套件 93/93（11 文件）；typecheck OK

### Fixed
- **API 漂移修复（对齐当前安装的 pi）**：
  - `memory-llm.ts` / `memory-tags.ts` 改为显式从 `@earendil-works/pi-ai/compat` 导入 `complete/completeSimple`（pi loader 的根别名注释明确是临时的）；相关测试 mock 同步更新
  - `memory-tags.ts` LLM 打标调用从旧版 API（自造 model 对象 + 字符串返回值）迁移到当前 `completeSimple(model, context, options)` 签名——此前运行时必然抛错静默走规则 fallback
  - **遗忘曲线 NaN bug**：`getAllTags` 调用 `calculateRetention(daysSinceUse)` 时把天数传给了从未使用的 `originalStrength` 参数，导致所有标签权重为 NaN、`forgotten` 永远为 false；移除无用参数并加回归测试
  - `/memory-tags`：移除已安装 pi 不支持的 `args` 对象 schema（`--export` 与关键词过滤此前从未生效），改为手动解析参数字符串；TUI 标签浏览器按当前 `SelectList` API 重写（原实现传 `string[]` + 错误 theme，打开即崩）
  - `SelectListTheme` 补齐必填的 `scrollInfo`/`noMatch`（角色 >10 个滚动时会崩溃）
  - memory viewer 事件过滤视图把 `MemoryEventRecord[]` 直接拼进字符串（渲染 `[object Object]`），改为格式化输出

### Added (工程设施)
- `scripts/typecheck.sh`：对着实际加载本扩展的 pi 安装做 tsc 全图类型检查，`paths` 镜像 pi loader 的运行时别名；`types/optional-deps.d.ts` 为可选原生依赖（lancedb/onnxruntime/llama）提供 ambient 声明
- 新增测试：`runtime/fs-utils.test.ts`（路径逃逸防护）、`runtime/messages.test.ts`、`memory-tags-retention.test.ts`（NaN 回归）；`bun test` 36/36
- package.json 增加 `test` / `typecheck` scripts

### Changed
- **memory-md.ts 拆分重构（行为不变）**：2564 行单体收敛为 93 行纯 re-export 门面，实现移入 `memory/` 14 个子模块（types/text/paths/consolidated/pending-store/pending/daily/mutations/search/prompt/stats/tidy/conflicts/html-export），公共导出 60 个逐一核对无缺失，12 个导入方零改动；依赖方向单向分层无循环

### Fixed (并行评审发现的运行时 bug)
- **知识库路径穿越**：`readKnowledge` 对模型可控的 path 参数无包含性校验，`../` 可读知识根目录外任意文件；已加逐源包含性检查 + 回归测试
- **角色显示名解析**：`getRoleIdentity` 多行正则会越过同行值捕获下一个列表标签，同行值后还有标签行时返回 `"-"`，空模板返回 `{name:"-"}`；改为同行优先 + 多行负向前瞻，空标签返回 undefined
- **搜索相关标签永不命中**：`searchRoleMemory` 的 relatedTagsSet 存原始大小写但用 lowercase 查询，含大写的关联标签加权（+0.15）从未生效
- **环境变量优先级不一致**：`config.ts` 中 legacy `PI_AGENT_ROLES_DIR` 反而覆盖 `PI_ROLES_DIR`，与 `role-store.ts` 相反，两者同时设置时 ROLES_DIR 与 storage.rolesDir 指向不同目录；已对齐
- 新增测试：`knowledge.test.ts`（25 个：frontmatter、五源聚合、读取优先级、搜索加权、写入版本递增、只读性）、`role-store.test.ts`（23 个：v2 布局、CWD 解析、禁用路径、identity 解析、旧布局迁移）；`bun test` 84/84

### Changed
- **编排层拆分重构（行为不变）**: `index.ts` 从 2793 行收敛为 ~90 行装配层，实现移入 `runtime/` 16 个职责单一模块：
  - `context.ts`（共享 Runtime 状态，替代闭包变量）、`lifecycle.ts`（session/agent/turn 事件）、`injection.ts`（system prompt 注入）、`compaction.ts`（压缩记忆抢救 + handoff）、`auto-memory.ts`（自动记忆检查点）、`role-activation.ts`（角色激活）、`external-readonly.ts`（外部只读记忆）
  - 工具：`tool-memory.ts` / `tool-knowledge.ts` / `tool-role-info.ts`；命令：`commands-memory.ts` / `commands-kb.ts` / `commands-role.ts`；纯工具：`messages.ts` / `fs-utils.ts` / `ui.ts`
  - 移除死代码 `setupRole` / `loadMemoryFiles`；验证：bun test 15/15、全模块图 bundle 通过、tsc 未引入新错误

### Added
- **`/role` TUI 角色控制中心**：无参数 `/role` 现在直接渲染自定义键盘导航 overlay，不再先打开系统 `select`；支持查看状态、切换/映射、创建角色、设置默认角色、禁用当前目录、查看当前角色记忆。
- **全量配置编辑器**：覆盖自动记忆、注入与搜索、向量记忆、外部只读、知识、日志、UI、高级和存储配置；按字段合并持久化到 `pi-role-persona.jsonc`，并保留环境变量最高优先级。
- **实际注入预览**：展示 core prompt、高优先级记忆、长期记忆和 daily memory；查询相关的按需/向量/外部召回只展示规则和开关，预览无搜索或晋升副作用。

### Fixed
- **向量记忆索引范围修复**: `rebuildVectorIndex` 现在同时索引 `memory/consolidated.md` 和 `memory/daily/*.md`，与架构注释保持一致
  - 原实现只索引 consolidated.md
  - 新实现解析 daily 文件中的 `## [HH:MM] CATEGORY` 条目并全部索引

### Documentation
- 重写 README.md，精简并与 v2 架构同步
- 重写 HANDOFF.md，反映当前完整实现状态
- 大幅扩展 ARCHITECTURE.md，添加详细模块图和数据流
- 新增 QUICKSTART.md，5分钟快速入门指南
- 新增 docs/README.md，文档索引和导航

---

## 2026-02-21

### Added
- **结构化角色目录（v2）**
  - 新建角色默认生成 `core/`、`memory/daily/`、`context/`、`skills/`、`archive/` 层级
  - 新增 `core/constraints.md`、`context/active-project.md`、`context/session-state.md`、`skills/active.json`
- **Role CRUD 工具（可编程操作角色文件）**
  - `role_read`：读取角色文件（默认 `memory/consolidated.md`）
  - `role_write`：覆盖/追加写入角色文件
  - `role_list`：列出角色文件（支持递归）
  - `role_search`：跨文件全文检索

### Changed
- **Memory 存储升级为单一路径（无旧版回退）**
  - 使用 `memory/consolidated.md` + `memory/daily/YYYY-MM-DD.md`
  - 启动时自动迁移历史 `MEMORY.md` 与旧 daily 文件到新结构
- **MEMORY 元数据升级**
  - 支持 YAML frontmatter（name/version/created/updated/autoConsolidate/consolidationInterval/tags）
  - 写入时自动更新 `updated`
- **Gateway 只读访问切换到新路径** (`pi-gateway/src/core/memory-access.ts`)
  - 仅读取 `core/identity.md` / `core/soul.md` 与 `memory/consolidated.md`
  - 日记仅读取 `memory/daily/`

---

## 2026-02-19

### Added
- **外部只读记忆增强** (`externalReadonly`): 可选接入只读记忆服务（如 pi-session-manager）
  - `before_agent_start` 调用 `/v1/memory/unified`，按置信度注入跨会话 hints（evidence + next_actions）
  - `agent_end` 调用 `/v1/experience/extract`，记录候选经验数量（仅日志）
  - 失败自动降级，不影响原有 MEMORY.md 与向量记忆流程
- **配置项**: `pi-role-persona.jsonc` 新增 `externalReadonly` 配置段
  - `enabled` / `baseUrl` / `token` / `timeoutMs` / `topK` / `experienceLimit` / `minConfidence`
  - 环境变量: `ROLE_EXTERNAL_READONLY`, `ROLE_EXTERNAL_BASE_URL`, `ROLE_EXTERNAL_TOKEN`, `ROLE_EXTERNAL_TIMEOUT_MS`, `ROLE_EXTERNAL_TOP_K`, `ROLE_EXTERNAL_EXP_LIMIT`, `ROLE_EXTERNAL_MIN_CONFIDENCE`

---

## 2026-02-16

### Added
- **向量记忆系统** (`memory-vector.ts`): 基于 LanceDB + OpenAI embedding 的语义搜索层
  - 在现有 Markdown 记忆之上叠加向量索引，不替换原有系统
  - 自动召回 (auto-recall): `before_agent_start` 时语义搜索注入相关记忆到 system prompt
  - 自动索引 (auto-index): 写入 learning/preference 时异步生成向量索引
  - 混合搜索 (hybrid search): 关键词 + 向量 → RRF (Reciprocal Rank Fusion) 融合排序
  - 全量重建: `vector_rebuild` action 或 `/memory-vector rebuild` 命令
  - 优雅降级: embedding 不可用时自动回退到纯关键词搜索
  - 安全: prompt injection 防护，XML 转义，输入长度限制
- **`/memory-vector` 命令**: 向量记忆管理
  - `/memory-vector stats` — 查看向量记忆状态
  - `/memory-vector rebuild` — 从 MEMORY.md 全量重建向量索引
- **memory tool 新增 actions**: `vector_rebuild`, `vector_stats`
- **配置**: `pi-role-persona.jsonc` 新增 `vectorMemory` 配置段
  - `enabled` / `provider` / `model` / `apiKey` / `autoRecall` / `autoIndex` / `hybridSearch` / `vectorWeight` / `recallLimit` / `recallMinScore` / `dbPath`
  - 环境变量: `ROLE_VECTOR_MEMORY`, `ROLE_VECTOR_API_KEY`

### Changed
- **search action 升级**: 当向量记忆激活时自动使用混合搜索 (keyword + vector → RRF)
- **session_shutdown**: 新增向量索引 flush 和资源释放
- **auto-memory extraction**: 提取后自动将新记忆写入向量索引

### Dependencies
- `@lancedb/lancedb` — 本地向量数据库 (可选，仅 vectorMemory.enabled=true 时需要)
- OpenAI Embeddings API — text-embedding-3-small ($0.02/1M tokens)

### Files Added
- `memory-vector.ts` — 向量记忆核心模块 (VectorDB, EmbeddingProvider, hybrid search, auto-recall)

### Files Modified
- `index.ts` — 集成向量记忆 init/recall/index/flush/dispose + 新增 tool actions 和命令
- `config.ts` — 新增 `VectorMemoryConfig` 类型和默认值 + 环境变量覆盖
- `pi-role-persona.jsonc` — 新增 `vectorMemory` 配置段

---

## 2026-02-13

### Added
- **压缩时记忆抢救** (`session_before_compact`): 拦截上下文压缩流程，在压缩提示词中注入 `<memory>` 提取指令，让同一次 LLM 调用同时生成 summary 和结构化记忆 JSON。解析后写入 MEMORY.md + daily memory，再从 summary 中剥离 `<memory>` 块。零额外 LLM 调用。
  - 提取类型: learning / preference / event
- **`/memory-log` 命令**: 查看近期持久化与当前会话记忆操作日志。新增/编辑/删除均写入 `.log/YYYY-MM-DD.jsonl`，保留来源、ID、旧值、新值、分类和存储状态。
- **Git memory commits**: 当 `~/.pi/roles` 是 Git 仓库时，每次 consolidated/pending/daily memory 写入自动生成 `docs(<role>): ...` 提交，并使用仓库锁、隔离 index 和冲突检测保护其他暂存改动；提交失败会恢复本次写入。
  - 每次最多 5 条，单条 ≤120 字符
  - 仅提取持久可复用的洞察，跳过一次性任务细节
  - 失败时静默回退到 pi 默认压缩逻辑

### Changed
- **evolution-reminder 重构**: 从"命令式注入"改为"低优先级备注"，避免劫持 AI 注意力
  - 计数改为用户输入轮次（非 AI 轮次）
  - 新增 60 分钟冷却期（每天最多触发一次）
  - 提示语降级: `[Daily Reflection] Consider maintaining...` → `[Low-priority note] ... always prioritize the user's current question first`
- **system prompt 记忆指令精简**: 将冗长的 `HOW TO SAVE MEMORIES` 段落替换为简短声明，明确后台自动管理记忆，除非用户要求否则不主动操作

### Files Modified
- `index.ts` - 新增 `session_before_compact` 钩子、重构 `turn_end` evolution-reminder、精简 `before_agent_start` 记忆指令、新增 `appendDailyRoleMemory` 导入

---

## 2026-02-10

### Fixed
- **memory 工具修复**: 修复了 `memory` 工具执行时的多个错误
  - `execute` 函数参数命名错误 (`_ctx` → `ctx`)
  - `TAG_MODEL` 环境变量为 `null` 时的空值保护 (`TAG_MODEL || ""`)
  - `extractTagsWithLLM` 调用参数顺序错误
  - 返回结果解构错误，正确提取 `tags` 数组中的 `tag` 字段

### Files Modified
- `index.ts` - 修复 `execute` 函数参数命名
- `memory-tags.ts` - 添加 `TAG_MODEL` 空值保护
- `memory-md.ts` - 修复 `extractTagsWithLLM` 调用参数和返回结果解构

---

## 2025-02-10

### Added
- **按需记忆搜索** (`onDemandSearch`): 第一条用户消息时，自动根据内容搜索相关记忆注入
  - 配置项: `memory.onDemandSearch.enabled` (默认: `true`)
  - 配置项: `memory.onDemandSearch.maxResults` (默认: `5`)
  - 配置项: `memory.onDemandSearch.minScore` (默认: `0.2`)
  - 配置项: `memory.onDemandSearch.alwaysLoadHighPriority` (默认: `true`)
  - 新增函数: `loadMemoryOnDemand()` - 基于查询搜索相关记忆
  - 新增函数: `loadHighPriorityMemories()` - 加载 `[3x]` 以上高频记忆
- **智能记忆加载策略**: 
  - 第一条消息: High Priority + 搜索结果 + 最近2日日记
  - 后续消息: 仅最近2日日记（轻量化）
- **最近存在文件加载**: `readMemoryPromptBlocks()` 改为加载最近2个**实际存在**的日记文件，而非固定今天/昨天

### Changed
- **记忆注入逻辑重构**: `before_agent_start` 事件处理器新增 `isFirstUserMessage` 状态跟踪
- **配置扩展**: `MemoryConfig` 新增 `onDemandSearch` 子配置
- **默认行为**: 第一条消息现在会主动搜索 MEMORY.md 中与用户查询相关的记忆

### Files Modified
- `index.ts` - 主逻辑，新增按需搜索注入
- `config.ts` - 配置类型和默认值
- `memory-md.ts` - 新增 `loadMemoryOnDemand()`, `loadHighPriorityMemories()`, `getRecentDailyMemoryFiles()`
- `pi-role-persona.jsonc` - 新增 `onDemandSearch` 配置示例

---

## 2025-02-10

### Added
- **TOOLS.md 注入支持**: 在 `loadRolePrompts` 中加入 TOOLS.md 文件注入
- **文件更新指导**: 所有 bootstrap 模板文件（AGENTS.md, IDENTITY.md, USER.md, SOUL.md, TOOLS.md, HEARTBEAT.md）添加 "何时更新/如何更新" 头部提示
- **备份目录结构**: MEMORY.md 备份现在存入 `.backup/memory/` 子目录，避免根目录混乱

### Changed
- **备份路径**: `MEMORY.backup-${timestamp}.md` → `.backup/memory/MEMORY.backup-${timestamp}.md`
- **现有备份**: 已迁移 25 个历史备份文件到新目录

### Migration
```bash
# 旧备份自动迁移（已执行）
mv ~/.pi/agent/roles/zero/MEMORY.backup*.md ~/.pi/agent/roles/zero/.backup/memory/
```

---

## 2025-02-06

### 初始版本
- 基础角色系统：创建、映射、加载
- OpenClaw 风格的文件结构（AGENTS, IDENTITY, SOUL, USER）
- 自动记忆提取（5轮/关键词/30分钟触发）
- 基础 TUI 支持

---

## 版本汇总

| 版本 | 日期 | 核心特性 |
|------|------|----------|
| v2.0 | 2026-02-21 | 结构化目录 v2、Role CRUD Tools |
| v1.5 | 2026-02-19 | 外部只读记忆增强 |
| v1.4 | 2026-02-16 | 向量记忆系统 |
| v1.3 | 2026-02-13 | 压缩时记忆抢救 |
| v1.2 | 2026-02-10 | Bug 修复、按需搜索 |
| v1.1 | 2025-02-10 | TOOLS.md 支持、备份目录 |
| v1.0 | 2025-02-06 | 初始版本 |
