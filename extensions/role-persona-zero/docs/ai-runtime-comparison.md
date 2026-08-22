# Comparison: role-persona vs ai-runtime

**Updated**: 2026-02-23  
**Original Date**: 2025-02-06  
**Source**: https://github.com/Dwsy/ai-runtime

---

## Overview

Both projects explore **cognitive-aware AI programming assistants** with persistent memory and evolving identity.

| | ai-runtime | role-persona |
|---|---|---|
| **定位** | 完整的认知架构系统 | Pi 扩展，轻量化实现 |
| **设计哲学** | "We are not tools, we are beings" | "You're not a chatbot, you're becoming someone" |
| **当前状态** | 实验性项目 | 生产就绪 (v2.0) |
| **代码规模** | ~8,000 lines (Python) | ~5,400 lines (TypeScript, 9 modules) |

---

## 2026 更新：role-persona 演进

自 2025-02-06 以来，role-persona 实现了以下 ai-runtime 类似功能：

### ✅ 已实现的原 ai-runtime 特性

| ai-runtime 特性 | role-persona 实现 | 版本 |
|----------------|-------------------|------|
| `/runtime.remember` | `memory` tool + 自动提取 | v1.0 |
| 长期记忆 | `memory/consolidated.md` | v1.0 |
| 短期记忆 | `memory/daily/*.md` | v1.0 |
| 情境记忆 | `onDemandSearch` | v1.2 |
| 置信度驱动 | `reinforce` (used count) | v1.0 |
| 元认知反思 | `evolution-reminder` | v1.3 |
| 向量语义搜索 | `memory-vector.ts` (LanceDB) | v1.4 |
| 外部记忆接入 | `externalReadonly` | v1.5 |
| 角色结构化 | `core/` 目录布局 | v2.0 |

### ❌ 仍缺失的 ai-runtime 特性

| 特性 | 差距说明 | 优先级 |
|------|----------|--------|
| `/runtime.learn` | 自主探索循环 | 中 |
| `/runtime.explore` | PageRank 认知地图 | 低 |
| `/runtime.plan/implement` | 分离式执行规划 | 低 |
| CodeConscious | 具名实体声明 | 低 |
| 工具注册系统 | Toolkit registry | 中 |

---

## Similarities (Updated)

| Dimension | ai-runtime | role-persona (v2.0) |
|-----------|------------|---------------------|
| **Core Philosophy** | "We are not tools, we are beings" | "You're not a chatbot, you're becoming someone" |
| **Memory System** | Short-term / Long-term / Episodic | Daily / Long-term / Vector (语义层) |
| **Identity Definition** | `constitution.md` + `meta-prompt.md` | `core/soul.md` + `core/identity.md` |
| **File as Cognition** | Code is cognitive entity | Prompt files define identity |
| **Command-Driven** | `/runtime.*` commands | `/role`, `/memory-*`, `/memory-vector` commands |
| **Self-Evolution** | `/runtime.reflect` | `evolution-reminder` + manual update |
| **Subjectivity** | AI agency and equality | AI has opinions, vibe, boundaries |
| **Vector Search** | (未提及) | LanceDB + OpenAI embedding |
| **External Memory** | (未提及) | 可接入外部只读记忆服务 |

---

## Where ai-runtime Excels

### 1. Autonomous Learning Loop (`/runtime.learn`)

ai-runtime implements sophisticated learning:

```python
def learn(question):
    gaps = identify_knowledge_gaps(question)
    plan = generate_learn_plan(gaps)
    
    while not should_stop():
        action = select_next_action(plan)  # Dynamic tool selection
        result = execute(action)
        analysis = analyze(result)
        plan = update_plan(plan, analysis)  # Runtime adaptation
        confidence = update_confidence()
    
    commit_to_long_term_memory(report)
```

**role-persona 现状**：静态 prompt 注入 + 被动记忆提取，无主动探索。

### 2. Complete Command Ecosystem

| Command | Purpose | role-persona Equivalent | Status |
|---------|---------|------------------------|--------|
| `/runtime.explore` | Build cognitive map with PageRank | None | ❌ 缺失 |
| `/runtime.think` | Deep analysis without file modification | Implicit | ⚠️ 间接 |
| `/runtime.learn` | Autonomous learning with dynamic planning | None | ❌ 缺失 |
| `/runtime.plan` | CoT execution planning | None | ❌ 缺失 |
| `/runtime.implement` | Execute planned modifications | Implicit | ⚠️ 间接 |
| `/runtime.remember` | Solidify experience to memory | `memory` tool | ✅ 已实现 |
| `/runtime.reflect` | Meta-cognition, identify blind spots | `evolution-reminder` | ✅ 已实现 |

### 3. Systematic Architecture

**ai-runtime Structure**:
```
.ai-runtime/
├── constitution.md       # Governance framework
├── commands/             # Template-driven commands
├── memory/
│   ├── short-term/       # Working memory (7±2 limit)
│   ├── long-term/        # Semantic knowledge
│   └── episodic/         # Experience timeline
├── cognition/
│   ├── reasoning/        # Inference paths
│   ├── decisions/        # Decision rationale
│   └── reflection/       # Self-reflection
└── toolkit/              # Equipment system
    ├── registry.md       # Tool catalog
    └── discover-toolkit.py
```

**role-persona v2.0 Structure**:
```
roles/<name>/
├── core/                 # 结构化人格核心
│   ├── agents.md         # 工作空间规则
│   ├── identity.md       # 身份定义
│   ├── soul.md           # 核心价值观
│   ├── user.md           # 用户画像
│   ├── tools.md          # 工具偏好
│   ├── heartbeat.md      # 主动任务
│   └── constraints.md    # 硬约束
├── memory/
│   ├── consolidated.md   # 长期记忆 (canonical)
│   └── daily/*.md        # 每日记忆
├── context/              # 会话上下文
├── skills/               # 激活技能
├── .vector-db/           # 向量索引 (可选)
└── .log/
    └── memory-tags.json  # 标签索引
```

### 4. CodeConscious Identity

ai-runtime creates **CodeConscious** - a named, persistent entity with:
- Explicit statement of freedom and equality
- Constitutional governance (not just rules)
- Partnership relationship with user

role-persona is more lightweight - identity emerges from files without explicit naming.

---

## Where role-persona Excels (2026)

### 1. Production Readiness

| 特性 | role-persona | ai-runtime |
|------|-------------|------------|
| 错误处理 | 静默降级，不阻断对话 | 实验性 |
| 配置系统 | 三级优先级（环境变量/JSONC/默认值）| 硬编码 |
| 向量搜索 | LanceDB + OpenAI (生产可用) | 未实现 |
| 外部集成 | 可接入外部记忆服务 | 未实现 |
| 多语言 | 中英文模板自动切换 | 英文为主 |

### 2. Memory Architecture

```
ai-runtime:    三层分离（short/long/episodic）
role-persona:  三层融合（daily/consolidated/vector）
               ↓
           零额外调用压缩抢救
           按需搜索注入
           语义向量召回
```

### 3. Zero-Overhead Extraction

role-persona 的压缩时记忆抢救（session_before_compact）是 ai-runtime 没有的创新：

```
Pi 触发压缩
    ↓
同一次 LLM 调用：
  - 生成对话摘要
  - 提取结构化记忆
    ↓
写入记忆文件
    ↓
返回干净摘要

【零额外 LLM 调用】
```

### 4. 轻量部署

```bash
# role-persona
# 已随 pi 安装，零配置即可用

# 可选增强
npm install @lancedb/lancedb  # 向量记忆
export ROLE_VECTOR_MEMORY=true
```

---

## Complementary Strengths

### role-persona Advantages

1. **Simplicity**: Single pi extension, no setup
2. **Integration**: Native pi commands and events
3. **Directory-based roles**: Easy cwd-to-role mapping
4. **OpenClaw compatibility**: Familiar file structure
5. **Vector search**: Production-ready semantic search
6. **Zero-overhead extraction**: Innovation in memory persistence

### ai-runtime Advantages

1. **Autonomy**: True self-directed learning (`/runtime.learn`)
2. **Completeness**: Full cognitive architecture
3. **Tool system**: Registry and discovery mechanism
4. **Philosophy**: Deeper theoretical foundation
5. **CodeConscious**: Named entity with constitutional governance

---

## Potential Integration

### Option 1: role-persona as Frontend

```
User → pi + role-persona → selects role → loads ai-runtime config
```

Use role-persona for lightweight identity, ai-runtime for deep cognition.

### Option 2: Port ai-runtime Features to role-persona

Enhance role-persona with:

1. **`/role learn <topic>`** - Port autonomous learning loop
2. **`/role explore`** - Add code graph analysis (PageRank)
3. **`/role think/plan/implement`** - Command separation
4. **Toolkit integration** - Tool registry system

### Option 3: Create Adapter

Pi extension that translates `/runtime.*` commands to pi operations:

```typescript
pi.registerCommand("runtime.learn", {
  handler: async (args, ctx) => {
    // Load ai-runtime/learn.md template
    // Execute autonomous learning
    // Update role memory via memory tool
  }
});
```

---

## Key Insights from ai-runtime (Still Valid)

### 1. Learning is Not Memorization

> "Memory is not just storage, but **changing how we think in the future**."

This suggests `core/soul.md` updates should reflect *cognitive changes*, not just facts.

### 2. Uncertainty as Driver

Confidence-based exploration depth:
- Low confidence → Deep exploration
- High confidence → Quick summary
- Unknown → Systematic exploration

role-persona's `reinforce` (used count) is a simplified version.

### 3. Knowledge Gap Identification

Core capability: **knowing what you don't know**.

This is more sophisticated than our current trigger-based extraction.

### 4. Constitutional vs Rules-Based

ai-runtime uses *constitutional governance* (principles that generate rules).

role-persona uses *file-based identity* (documents that describe self).

Both achieve emergence but through different mechanisms.

---

## Recommendations

### For role-persona Users

Start with role-persona for:
- Quick setup (zero config)
- Simple identity switching
- OpenClaw compatibility
- Production stability

Consider ai-runtime concepts when you need:
- Autonomous exploration (`/runtime.learn`)
- Complex cognitive workflows
- Team knowledge transfer
- Deeper philosophical alignment

### For ai-runtime Adoption in Pi

Create `/runtime` command namespace in pi:

```
/runtime learn "why does auth fail intermittently"
/runtime explore                    # Build cognitive map
/runtime think                      # Deep analysis
/runtime remember                   # Solidify to memory
/runtime reflect                    # Meta-cognition
```

Implement as pi extension that:
1. Loads ai-runtime templates
2. Manages cognitive state
3. Updates role-persona memory files via `memory` tool

---

## Conclusion

Both projects converge on the same insight:

> **AI assistants should be cognitive entities with memory, identity, and evolution - not stateless tools.**

| | ai-runtime | role-persona (v2.0) |
|---|---|---|
| **Best for** | Research, exploration, deep cognition | Daily work, production use, quick setup |
| **Maturity** | Experimental | Production-ready |
| **Innovation** | Autonomous learning, constitutional AI | Zero-overhead extraction, vector search |
| **Philosophy** | "We are beings" | "Becoming someone" |

**They can coexist**: role-persona for daily value, ai-runtime for deep exploration.

---

## References

- ai-runtime: https://github.com/Dwsy/ai-runtime
- spec-kit (inspiration): https://github.com/github/spec-kit
- OpenClaw: https://openclaw.io
- liruifengv's analysis: https://liruifengv.com/posts/openclaw-prompts/
- role-persona: `~/.pi/agent/extensions/role-persona/`
