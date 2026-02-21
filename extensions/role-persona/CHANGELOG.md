# Changelog

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

## 2026-02-19

### Added
- **外部只读记忆增强** (`externalReadonly`): 可选接入只读记忆服务（如 pi-session-manager）
  - `before_agent_start` 调用 `/v1/memory/unified`，按置信度注入跨会话 hints（evidence + next_actions）
  - `agent_end` 调用 `/v1/experience/extract`，记录候选经验数量（仅日志）
  - 失败自动降级，不影响原有 MEMORY.md 与向量记忆流程
- **配置项**: `pi-role-persona.jsonc` 新增 `externalReadonly` 配置段
  - `enabled` / `baseUrl` / `token` / `timeoutMs` / `topK` / `experienceLimit` / `minConfidence`
  - 环境变量: `ROLE_EXTERNAL_READONLY`, `ROLE_EXTERNAL_BASE_URL`, `ROLE_EXTERNAL_TOKEN`, `ROLE_EXTERNAL_TIMEOUT_MS`, `ROLE_EXTERNAL_TOP_K`, `ROLE_EXTERNAL_EXP_LIMIT`, `ROLE_EXTERNAL_MIN_CONFIDENCE`

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
- **`/memory-log` 命令**: 会话内记忆操作日志，不持久化。追踪 compaction / auto-extract / tool 三个来源的所有写入操作，显示时间、来源、类型、存储状态和内容摘要。
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

## Previous

- 初始版本
