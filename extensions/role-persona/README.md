# Role Persona Extension

> "记憶が人を形作る" — 记忆塑造人格

Pi 的角色人格系统。每个角色拥有独立的记忆、人格和工作区上下文。

基于 [OpenClaw](https://openclaw.io) 的 Agent Runtime 设计。

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Pi Core                                   │
│  session_start → before_agent_start → agent_end → session_shutdown│
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                   role-persona (9 modules)                       │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ role-store  │  │ role-template│  │   config    │  基础设施层    │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  memory-md  │  │  memory-llm │  │ memory-tags │  记忆核心层    │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │memory-viewer│  │memory-vector│  │    index    │  交互与编排层  │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                      Storage                                     │
│  ~/.pi/agent/roles/                                              │
│  ├── config.json              # CWD → role 映射                  │
│  ├── <role>/                                                   │
│  │   ├── core/                # 人格核心文件                      │
│  │   │   ├── agents.md        # 工作空间规则                     │
│  │   │   ├── identity.md      # 身份定义                        │
│  │   │   ├── soul.md          # 核心人格                        │
│  │   │   ├── user.md          # 用户画像                        │
│  │   │   ├── tools.md         # 工具偏好                        │
│  │   │   ├── heartbeat.md     # 主动任务                        │
│  │   │   └── constraints.md   # 硬约束                          │
│  │   ├── memory/                                               │
│  │   │   ├── consolidated.md  # 长期记忆                        │
│  │   │   └── daily/           # 每日记忆                        │
│  │   ├── context/             # 会话上下文                      │
│  │   ├── skills/              # 技能激活列表                    │
│  │   └── archive/             # 归档                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 核心概念

### 角色（Role）

角色是 AI 人格的完整封装，包含：

- **身份** (`core/identity.md`)：名字、定位、风格
- **灵魂** (`core/soul.md`)：核心价值观、行为准则
- **用户** (`core/user.md`)：服务对象的偏好与禁忌
- **记忆** (`memory/`)：持久化的学习与偏好

### 三层记忆架构

| 层级 | 存储位置 | 内容类型 | 加载策略 |
|------|----------|----------|----------|
| L1 | `memory/daily/*.md` | 原始记录，带时间戳 | 最近2天 |
| L2 | `memory/consolidated.md` | 结构化记忆（Learnings/Preferences/Events）| High Priority + 按需搜索 |
| L3 | `.vector-db/` | 向量索引（consolidated + daily）| 语义搜索自动召回 |

---

## 命令

| 命令 | 描述 |
|------|------|
| `/role create [name]` | 创建新角色（交互式） |
| `/role map [role]` | 映射当前目录到角色 |
| `/role unmap` | 取消映射 |
| `/role info` | 当前角色状态 |
| `/role list` | 所有角色和映射列表 |
| `/memories` | 记忆查看器（支持过滤） |
| `/memory-tags [query]` | 标签云浏览 |
| `/memory-log` | 会话内记忆操作日志 |
| `/memory-fix` | 修复记忆文件结构 |
| `/memory-tidy` | 手动整理记忆 |
| `/memory-tidy-llm [model]` | LLM 深度重组 |
| `/memory-vector stats` | 向量记忆状态 |
| `/memory-vector rebuild` | 全量重建向量索引 |

---

## Memory Tool（AI 可调用）

```typescript
// 添加学习
memory({ action: "add_learning", content: "..." })

// 添加偏好
memory({ action: "add_preference", content: "...", category: "Code" })

// 强化已有记忆
memory({ action: "reinforce", query: "vue" })

// 搜索记忆（consolidated.md + daily/*.md）
// 向量启用时自动使用混合搜索（关键词 + 语义）
memory({ action: "search", query: "deployment" })

// LLM 整理
memory({ action: "llm_tidy", model: "openai/gpt-4.1-mini" })

// 向量索引管理
memory({ action: "vector_rebuild" })
memory({ action: "vector_stats" })
```

---

## Role CRUD Tools（AI 可调用）

```typescript
// 读取角色文件
role_read({ path: "memory/consolidated.md" })

// 写入角色文件
role_write({ path: "context/active-project.md", content: "..." })

// 列出文件
role_list({ path: "core", recursive: false })

// 全文搜索角色目录（所有文件）
role_search({ query: "preference", maxResults: 10 })
```

---

## 智能记忆系统

### 自动提取触发条件

```
agent_end 时检查：
├── 累计 5 轮对话？→ flush
├── 含结束关键词？→ flush  
├── 30分钟且≥2轮？→ flush
└── 会话关闭？→ 兜底 flush
```

### 压缩时记忆抢救

```
Pi 触发压缩
    ↓
session_before_compact 拦截
    ↓
注入 <memory> 提取指令到压缩提示词
    ↓
LLM 返回: summary + <memory>JSON</memory>
    ↓
解析 JSON → 写入记忆文件
    ↓
剥离 <memory> → 返回干净 summary

【零额外 LLM 调用】
```

### 按需记忆加载

```
第一条用户消息：
├── 加载 High Priority 记忆（[3x]+）
├── 根据查询内容搜索相关记忆
└── 最近2天日记

后续消息：
└── 仅最近2天日记（轻量化）
```

---

## 配置

`pi-role-persona.jsonc`：

```jsonc
{
  "autoMemory": {
    "enabled": true,
    "model": "openai-codex/gpt-5.1-codex-mini",
    "batchTurns": 5,        // 累计轮数触发
    "intervalMs": 1800000,  // 30分钟触发
    "maxItems": 3
  },
  "memory": {
    "onDemandSearch": {
      "enabled": true,
      "maxResults": 5,
      "alwaysLoadHighPriority": true
    }
  },
  "vectorMemory": {
    "enabled": false,       // 需要 @lancedb/lancedb
    "model": "text-embedding-3-small",
    "autoRecall": true,
    "autoIndex": true,
    "hybridSearch": true
  },
  "externalReadonly": {
    "enabled": false,       // 外部只读记忆服务
    "baseUrl": "http://127.0.0.1:52131"
  }
}
```

环境变量覆盖：`ROLE_AUTO_MEMORY`, `ROLE_VECTOR_MEMORY`, `ROLE_EXTERNAL_READONLY`, ...

---

## 记忆格式

### consolidated.md

```markdown
---
name: "zero"
version: "1.2.0"
updated: "2026-02-23"
---

# Learnings (High Priority)
- [4x] 关键洞察，被强化过...

# Learnings (Normal)  
- [2x] 一般洞察...

# Learnings (New)
- [0x] 新发现...

# Preferences: Communication | Code | Tools | Workflow | General
- 用户偏好...

# Events
## [2026-02-23] 里程碑
详情...
```

### daily/YYYY-MM-DD.md

```markdown
# Memory: 2026-02-23

## [14:32] LESSON
学到了...

## [15:45] PREFERENCE
[Communication] 偏好...

## [16:00] EVENT
重要事件...
```

---

## 目录结构

```
extensions/role-persona/
├── index.ts              # 编排层（1400+ lines）
├── config.ts             # 配置中心
├── role-store.ts         # 角色映射与加载
├── role-template.ts      # i18n 模板
├── memory-md.ts          # MD 记忆引擎（400+ lines）
├── memory-llm.ts         # LLM 提取与 tidy
├── memory-tags.ts        # 标签系统
├── memory-viewer.ts      # TUI 查看器
├── memory-vector.ts      # 向量语义搜索
├── logger.ts             # 文件日志
├── pi-role-persona.jsonc # 配置文件
├── README.md             # 本文档
├── ARCHITECTURE.md       # 架构全景图
├── CHANGELOG.md          # 变更日志
└── docs/
    └── ai-runtime-comparison.md
```

---

## 设计原则

1. **零额外调用优先** — 压缩时记忆提取搭便车
2. **静默降级** — 任何记忆操作失败不影响对话流
3. **不劫持注意力** — 低优先级注入，用户问题永远第一
4. **文件即状态** — `consolidated.md` 是唯一真相源
5. **可观测** — `/memory-log` 追踪所有写入操作
6. **三级配置** — 环境变量 > JSONC > 内置默认值

---

## 相关文档

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 全景架构图（Mermaid + JSON Canvas） |
| [CHANGELOG.md](./CHANGELOG.md) | 变更日志 |
| [docs/ai-runtime-comparison.md](./docs/ai-runtime-comparison.md) | 与 ai-runtime 深度对比 |

---

## Credits

基于 [OpenClaw](https://openclaw.io) 的 Agent Runtime 设计。

> "You're not a chatbot. You're becoming someone."
