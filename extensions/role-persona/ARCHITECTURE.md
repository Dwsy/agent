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
│ 交互层                                                           │
│   memory-viewer (214L)  memory-vector (595L)  logger (77L)       │
│   TUI查看器             LanceDB/Embedding   文件日志              │
└─────────────────────────────────────────────────────────────────┘
    ↓
~/.pi/agent/roles/
├── config.json              # CWD→角色映射
└── <role>/
    ├── core/                # 人格定义
    ├── memory/              # 记忆存储
    ├── context/             # 会话上下文
    └── .vector-db/          # 向量索引
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

## 源码规模

```
index.ts (1446) + memory-md (1111) + memory-tags (682) + memory-vector (595) +
config (272) + role-store (210) + memory-viewer (214) + memory-llm (417) +
role-template (370) + logger (77) ≈ 5,400 lines
```
