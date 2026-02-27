# Role Persona Extension

> "記憶が人を形作る" — Pi 角色人格系统

每个角色独立记忆、人格和工作区上下文。

## 快速开始

```bash
/role create my-assistant && cd ~/project && /role map my-assistant
# 编辑 ~/.pi/agent/roles/my-assistant/core/identity.md
```

## 角色结构

```
~/.pi/agent/roles/<name>/
├── core/           # 人格定义
│   ├── identity.md soul.md user.md constraints.md
│   └── heartbeat.md tools.md
├── memory/         # 记忆系统
│   ├── consolidated.md  # L2 长期记忆（真相源）
│   └── daily/*.md       # L1 原始记录
└── .vector-db/     # L3 语义索引（可选）
```

## 命令

| 命令 | 用途 |
|------|------|
| `/role create/map/unmap/info/list` | 角色管理 |
| `/memories` `/memories --export` | 记忆查看（TUI / 浏览器）|
| `/memory-fix/tidy/tidy-llm` | 记忆维护 |
| `/memory-vector stats/rebuild` | 向量索引 |

## AI Tools

```typescript
// 记忆操作
memory({ action: "add_learning|add_preference|reinforce|search|llm_tidy|vector_rebuild" })

// 角色文件
role_read({ path: "memory/consolidated.md" })
role_write({ path: "context/active.md", content: "..." })
role_list({ path: "core" })
role_search({ query: "preference" })
```

## 智能记忆

### 自动触发
```
agent_end: 累计5轮 / 含结束词 / 30分钟且≥2轮 / 会话关闭
```

### 压缩抢救（零额外调用）
```
session_before_compact → 注入提取指令 → LLM顺带返回<memory>JSON</memory> → 写入
```

### 加载策略
```
首条消息: High Priority [3x]+ + 搜索 + 最近2天
后续消息: 仅最近2天
```

## 配置

```jsonc
{
  "autoMemory": { "enabled": true, "model": "...", "batchTurns": 5, "intervalMs": 1800000 },
  "memory": { "onDemandSearch": { "enabled": true, "maxResults": 5 } },
  "vectorMemory": { "enabled": false, "model": "text-embedding-3-small", "hybridSearch": true }
}
```

优先级：环境变量 (`ROLE_*`) > JSONC > 默认值

## 记忆格式

```markdown
---
name: "zero" version: "1.2.0" updated: "2026-02-23"
---
# Learnings (High Priority|Normal|New)
- [Nx] 洞察内容

# Preferences: Communication|Code|Tools|Workflow|General
- 偏好内容

# Events
## [YYYY-MM-DD] 标题
详情
```

## 架构

```
Pi Core (事件)
    ↓
index.ts (编排: session_start → agent_end → ...)
    ↓
┌─────────────────────────────────────┐
│ 基础设施: role-store template config │
│ 记忆核心: memory-md llm tags         │
│ 交互层:   viewer vector logger       │
└─────────────────────────────────────┘
```

详细架构: [ARCHITECTURE.md](./ARCHITECTURE.md) | 变更日志: [CHANGELOG.md](./CHANGELOG.md)

## 原则

1. 零额外调用（压缩搭便车）
2. 静默降级（失败不影响对话）
3. 文件即状态（consolidated.md 是真相源）
4. 可观测（`/memory-log` 追踪）

---

Based on [OpenClaw](https://openclaw.io) Agent Runtime
