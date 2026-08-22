# 架构概览

## 模块依赖

```
Pi Core (事件系统)
    ↓
index.ts (装配层 / composition root, ~90L)
    ↓
runtime/ (编排实现, 16 模块, ~3,000L)
  事件: lifecycle / injection / compaction
  调度: auto-memory / role-activation / external-readonly
  工具: tool-search + tool-exec (注册) → tool-memory / tool-knowledge / tool-role-info (executor)
  命令: commands-memory / commands-kb / commands-role
  支撑: context / ui / messages / fs-utils
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ 基础设施                                                         │
│   role-store (~460L)  role-template (~380L)  config (~780L)      │
│   CWD→角色映射       i18n模板            配置加载/合并            │
├─────────────────────────────────────────────────────────────────┤
│ 记忆核心                                                         │
│   memory-md (~93L 门面) → memory/ (14 子模块, ~2,600L)           │
│   memory-llm (~1,080L)  memory-tags (~780L)  memory-git (~320L)  │
│   自动提取/tidy         LLM打标/标签云       写入即 Git 提交       │
├─────────────────────────────────────────────────────────────────┤
│ 向量嵌入层 (Embedding Providers)                                │
│   OpenAI              |  Local (PSM HTTP)                        │
│   text-embedding-3-*  |  :52131 向后兼容                         │
│   minilm-direct       |  minilm-daemon                          │
│   ONNX单进程 ~150MB   |  共享守护进程 ~150MB总                    │
│   384维, ~80MB模型     |  Unix Socket / Named Pipe IPC           │
├─────────────────────────────────────────────────────────────────┤
│ 交互层                                                           │
│   memory-viewer (~420L)  memory-vector (~850L)  logger (~540L)   │
│   TUI + HTTP 服务        LanceDB + HybridSearch  文件日志         │
│   templates/viewer.*     Web viewer（live/静态导出同一份实现）    │
└─────────────────────────────────────────────────────────────────┘
    ↓
~/.pi/roles/  (默认；PI_ROLES_DIR / storage.rolesDir 可覆盖，旧 ~/.pi/agent/roles 自动迁移)
├── config.json              # CWD→角色映射
└── <role>/
    ├── core/                # 人格定义
    ├── memory/              # 记忆存储
    ├── context/             # 会话上下文
    └── .vector-db/          # 向量索引 (LanceDB)

~/.pi/ (全局)
├── models/all-MiniLM-L6-v2/ # ONNX 模型文件
│   └── model.onnx (~80MB)
├── sockets/                 # Unix Socket (daemon IPC)
│   ├── embedding-daemon.sock
│   └── embedding-daemon.pid
└── embedding-daemon (进程)   # 共享 embedding 守护进程
```

## runtime/ 模块拆分

`index.ts` 不再持有任何实现，只做装配。所有会话状态收进 `runtime/context.ts` 的单一 `Runtime` 对象，模块间靠它共享。

| 模块 | 行数 | 职责 |
|------|------|------|
| `context.ts` | ~130 | Runtime 状态容器 + memoryLog 记录 |
| `lifecycle.ts` | ~200 | session_start / resources_discover / agent_end / session_shutdown / turn_end |
| `injection.ts` | ~180 | before_agent_start 系统提示注入 |
| `compaction.ts` | ~290 | session_before_compact 记忆抢救 + custom-compaction 交接 |
| `auto-memory.ts` | ~170 | 自动记忆检查点调度与 flush |
| `role-activation.ts` | ~120 | 角色激活流程 |
| `external-readonly.ts` | ~110 | 外部只读记忆服务（可选） |
| `ui.ts` | ~150 | TUI 可用性判断、notify、角色选择 UI |
| `messages.ts` | ~25 | 消息数组工具 |
| `fs-utils.ts` | ~65 | 路径规范化、角色目录内安全路径解析 |
| `tool-search.ts` | ~90 | `role_search` 工具（记忆+知识统一检索） |
| `tool-exec.ts` | ~160 | `role_exec` 工具（OP_CATALOG + 分发 + help 按需目录） |
| `tool-memory.ts` | ~510 | memory op executor（20 个 op，含 read / pending 审阅 / event 改删） |
| `tool-knowledge.ts` | ~170 | knowledge op executor（kb_list/kb_read/kb_write + search） |
| `tool-role-info.ts` | ~50 | role_info executor（只列目录，不读内容） |
| `commands-memory.ts` | ~530 | `/memories` `/memory-*` 全家桶 |
| `commands-kb.ts` | ~80 | `/kb` |
| `commands-role.ts` | ~280 | `/role` |

## memory/ 子模块拆分

`memory-md.ts` 是 ~93 行的纯 re-export 门面，调用方不用改 import。实现按单一职责拆进 `memory/`，依赖方向单向分层（下层不知道上层）：

```
types → text → paths → pending-store → consolidated → pending → daily
  → mutations → search → prompt / stats / tidy / conflicts / export-data → html-export
```

| 模块 | 行数 | 职责 |
|------|------|------|
| `types.ts` | ~90 | 数据类型与常量 |
| `text.ts` | ~85 | 文本规范化、tokenize、hashId、日期 |
| `paths.ts` | ~55 | 记忆文件路径 |
| `pending-store.ts` | ~110 | pending.md 读写（含 Git 提交） |
| `consolidated.ts` | ~620 | consolidated.md 解析/写入/修复（真相源） |
| `pending.ts` | ~150 | pending 增删、晋升、过期 |
| `daily.ts` | ~300 | daily/*.md 追加/解析/条目改删、每日摘要 |
| `mutations.ts` | ~370 | learning/preference/event 增删改 + 打标 |
| `search.ts` | ~290 | 关键词搜索打分、tag 加权、pending 自动晋升 |
| `prompt.ts` | ~145 | 注入用记忆块拼装、按需召回 |
| `stats.ts` | ~115 | 统计与列表 |
| `tidy.ts` | ~165 | 规则去重整理 + LLM tidy plan 应用 |
| `conflicts.ts` | ~160 | 记忆冲突检测 |
| `export-data.ts` | ~215 | Web viewer 数据契约（live/static 共用一个构建器） |
| `html-export.ts` | ~60 | 把 `templates/viewer.{html,css,js}` 装配成单文件文档 |

## 事件流水线

事件归属：`runtime/lifecycle.ts` 管 session_start / resources_discover / agent_end / session_shutdown / turn_end，`runtime/injection.ts` 管 before_agent_start，`runtime/compaction.ts` 管 session_before_compact。

### session_start
```
loadConfig → resolveRoleForCwd → loadRolePrompts(core/*.md) → migrateLegacyFiles
```

### before_agent_start
```
首条消息: High Priority [3x]+ + 按需搜索 + 长期记忆(带id) + 最近2天日记 + pending待审块 + 向量召回(可选)
后续消息: 长期记忆(带id) + 最近2天日记 + pending待审块
```

### agent_end
```
shouldFlush? (累计5轮 / 结束词 / 30分钟且≥2轮)
  → runAutoMemoryExtraction
  → learning 先进 pending.md，preference/event 写 consolidated.md，追加 daily/*.md
```

### session_before_compact (零额外调用)
```
注入提取指令 → LLM返回 summary + <memory>JSON</memory>
  → 解析JSON写入 → 返回干净summary
```

### session_shutdown
```
快速flush pending记忆 → flushVectorIndex → dispose资源
```

## 向量嵌入 Provider 架构

```
┌─────────────────────────────────────────────────────────────┐
│                   EmbeddingProvider 接口                      │
│         embed(text) → number[] (384/768/1536/3072维)          │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
       ┌───────┴───────┐              ┌───────┴───────┐
       │ 本地嵌入       │              │ 云端嵌入       │
       │ (无网络依赖)    │              │ (需 API Key)   │
       └───────┬───────┘              └───────┬───────┘
               │                              │
  ┌────────────┼────────────┐                  │
  │            │            │                  │
┌─┴──┐    ┌───┴───┐   ┌───┴──┐         ┌─────┴─────┐
│Direct│   │Daemon │   │Local │         │  OpenAI   │
│ ONNX │   │ Shared│   │ HTTP │         │text-emb-* │
│ 384d │   │ 384d  │   │ 768d │         │1536/3072d │
└──────┘   └───────┘   └──────┘         └───────────┘
  新增       新增        向后兼容         原有
  单进程     多进程共享   需要 PSM
  ~150MB     ~150MB总     ~435MB
```

**Provider 选择**: `config.vectorMemory.provider`

| Provider | 依赖 | 维度 | 内存 | 延迟 | 适用场景 |
|----------|------|------|------|------|----------|
| `openai` | OpenAI API | 1536 | 0 | 100ms | 最高质量 |
| `local` | pi-session-manager | 768 | 435MB | 30ms | 向后兼容 |
| `minilm-direct` | onnxruntime-node | 384 | 150MB | 15ms | 单进程快速 |
| `minilm-daemon` | onnxruntime-node | 384 | 150MB共享 | 20ms | 多会话推荐 |

## 三层记忆

```
L3 运行时: memoryLog[] + VectorDB + TagIndex (内存/索引)
    ↓
L2 结构化: consolidated.md (High Priority/Normal/New + Preferences)
    ↓
L1 原始: daily/YYYY-MM-DD.md (LESSON/PREFERENCE/EVENT)
```

## 命令映射

命令注册全部在 `runtime/commands-*.ts`，下面是各命令背后干活的模块。

| 命令 | 注册处 | 实现 |
|------|--------|------|
| `/role [tui\|info\|create\|map\|unmap\|list]` | commands-role | role-store / role-control-center |
| `/memories [tui]` `/memory-log` `/memory-fix` `/memory-tidy` | commands-memory | memory-md / memory-viewer |
| `/memory-tidy-llm` `/memory-distill[-stop]` | commands-memory | memory-llm |
| `/memory-tags [--export]` | commands-memory | memory-tags |
| `/memory-conflicts` `/memory-export` | commands-memory | memory/conflicts / memory/export-data + html-export |
| `/memory-vector stats/rebuild` | commands-memory | memory-vector |
| `/kb list/search/stats` | commands-kb | knowledge |

## Tool API

渐进式两工具（progressive disclosure）：schema 极简常驻，细节按需加载。

```typescript
role_search({ query, scope?: "all|memory|knowledge", limit? })   // 统一检索：记忆全层(混合)+知识库，结果带 [id:...]
role_exec({ op, args? })                                          // 所有操作：op 分发
role_exec({ op: "help" })                                         // 按需加载操作目录（分组 op + 参数规范）
role_exec({ op: "help", args: { topic: "edit_spec" } })           // 直接编辑记忆文件的格式规范
```

op 目录（单一事实源 `runtime/tool-exec.ts` 的 `OP_CATALOG`，help 文本与分发集合都由它派生）：memory 读（read/list）、memory 写（add_*/update_*/delete_*/reinforce）、pending 审阅（promote_pending/discard_pending，支持 ids 批量）、知识库（kb_list/kb_read/kb_write，惰性加载 knowledge.ts）、维护（consolidate/repair/llm_tidy/vector_*）、role_info。

自主编辑设计：注入的记忆块每条带 `[id:...]`（结构化渲染，不再 dump 原文件），模型看到问题条目可直接改删；`read` 提供全量带 id 视图（section 过滤）；后台/压缩提取的 pending 候选注入待审块，由模型裁决。所有变更同步向量索引并写审计日志。

## 新增文件 (all-MiniLM-L6-v2 Integration)

| 文件 | 行数 | 用途 |
|------|------|------|
| `embedding-minilm.ts` | ~440 | Direct ONNX Provider (单进程) |
| `embedding-daemon.ts` | ~820 | 跨平台守护进程服务器 |
| `embedding-minilm-daemon-client.ts` | ~155 | Daemon Client Provider |
| `docs/all-minilm-embedding-design.md` | - | 设计文档 |
| `docs/IMPLEMENTATION-PLAN.md` | - | 实现计划 |

## 工程设施

- **测试**：`bun test`（`npm run test`）。当前 116 tests / 14 files 全绿，覆盖 knowledge、role-store、memory-git、memory 核心 API（pending 生命周期/搜索晋升/去重/reinforce/repair）、LLM 提取/编辑、tag 遗忘、viewer 数据契约与 HTTP 接口、runtime 的 fs-utils 与 messages。
- **类型检查**：`bash scripts/typecheck.sh`（`npm run typecheck`）。脚本定位实际安装的 `pi` 二进制，把 pi loader 运行时的 import 别名镜像成 tsc `paths`（`@earendil-works/pi-ai` → compat 入口、`@sinclair/typebox` → pi 内置 typebox），对 `index.ts + runtime/ + types/` 做全图 `tsc --noEmit`——类型检查和运行时解析走同一套包。
- **可选原生依赖打桩**：`types/optional-deps.d.ts` 把 `@lancedb/lancedb` / `onnxruntime-node` / `node-llama-cpp` 声明为 `any`，typecheck 不需要装原生二进制。
- **pi-ai 导入约定**：`complete` / `completeSimple` 显式从 `@earendil-works/pi-ai/compat` 导入。pi loader 目前把根路径也临时别名到 compat，但那是过渡行为，补全类调用不依赖它。

## 源码规模

按 `wc -l` 实测（不含测试文件，行数有并行改动，取约数）：

```
装配层:   index.ts (~90) + memory-md.ts 门面 (~100)
编排层:   runtime/ 16 模块 ≈ 3,000
记忆核心: memory/ 15 子模块 ≈ 2,800
Web viewer: templates/viewer.html (~120) + viewer.css (~790) + viewer.js (~1,290)
单文件:   memory-llm (~1,080) + memory-vector (~850) + knowledge (~840) +
          memory-tags (~805) + config (~780) + role-control-center (~670) +
          logger (~540) + memory-viewer (~460) + role-store (~460) +
          role-template (~380) + tui-renderers (~330) + memory-git (~320) +
          memory-extraction-rules (~50)
嵌入层:   embedding-daemon (~820) + embedding-minilm (~440) +
          embedding-minilm-daemon-client (~155)
≈ 15,000 lines
```
