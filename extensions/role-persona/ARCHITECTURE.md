# 架构概览

## 模块依赖

```
Pi Core (事件系统)
    ↓
index.ts (编排层: session_start → before_agent_start → agent_end → session_shutdown)
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ 基础设施                                                         │
│   role-store (210L)  role-template (370L)  config (272L)         │
│   CWD→角色映射       i18n模板            三级配置                │
├─────────────────────────────────────────────────────────────────┤
│ 记忆核心                                                         │
│   memory-md (1111L)  memory-llm (417L)  memory-tags (682L)       │
│   解析/写入/搜索     自动提取/tidy      LLM打标/标签云            │
├─────────────────────────────────────────────────────────────────┤
│ 向量嵌入层 (Embedding Providers)                                │
│   OpenAI              |  Local (PSM HTTP)                        │
│   text-embedding-3-*  |  :52131 向后兼容                         │
│   minilm-direct (NEW) |  minilm-daemon (NEW)                     │
│   ONNX单进程 ~150MB   |  共享守护进程 ~150MB总                    │
│   384维, ~80MB模型     |  Unix Socket / Named Pipe IPC           │
├─────────────────────────────────────────────────────────────────┤
│ 交互层                                                           │
│   memory-viewer (214L)  memory-vector (595L)  logger (77L)       │
│   TUI查看器             LanceDB + HybridSearch  文件日志          │
└─────────────────────────────────────────────────────────────────┘
    ↓
~/.pi/agent/roles/
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

## 事件流水线

### session_start
```
loadConfig → resolveRoleForCwd → loadRolePrompts(core/*.md) → migrateLegacyFiles
```

### before_agent_start
```
首条消息: High Priority [3x]+ + 按需搜索 + 最近2天日记 + 向量召回(可选)
后续消息: 仅最近2天日记
```

### agent_end
```
shouldFlush? (累计5轮 / 结束词 / 30分钟且≥2轮)
  → runAutoMemoryExtraction → 写入 consolidated.md + daily/*.md
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

| 命令 | 模块 |
|------|------|
| `/role create/map/unmap/info/list` | role-store |
| `/memories` `/memory-log` `/memory-fix` `/memory-tidy` | memory-md/viewer |
| `/memory-tidy-llm` | memory-llm |
| `/memory-tags` | memory-tags |
| `/memory-vector stats/rebuild` | memory-vector |

## Tool API

```typescript
memory({ action: "add_learning|add_preference|reinforce|search|llm_tidy|vector_rebuild" })
role_read({ path }) / role_write({ path, content }) / role_list({ path }) / role_search({ query })
```

## 新增文件 (all-MiniLM-L6-v2 Integration)

| 文件 | 行数 | 用途 |
|------|------|------|
| `embedding-minilm.ts` | ~240 | Direct ONNX Provider (单进程) |
| `embedding-daemon.ts` | ~560 | 跨平台守护进程服务器 |
| `embedding-minilm-daemon-client.ts` | ~150 | Daemon Client Provider |
| `docs/all-minilm-embedding-design.md` | - | 设计文档 |
| `docs/IMPLEMENTATION-PLAN.md` | - | 实现计划 |

## 源码规模

```
index.ts (1446) + memory-md (1111) + memory-tags (682) + memory-vector (595) +
config (272) + role-store (210) + memory-viewer (214) + memory-llm (417) +
role-template (370) + logger (77) +
embedding-minilm (240) + embedding-daemon (560) + embedding-minilm-daemon-client (150)
≈ 6,350 lines
```
