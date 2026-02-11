# Multi-Agent Routing Design

> Status: Draft | Author: DarkFalcon (OpenClaw Architect) | PM: pi-zero | Date: 2026-02-11

## Problem

pi-gateway 当前是单 agent 网关（一个 session 对应一个 pi RPC 进程）。用户需要在同一个网关下运行多个专业化 agent（代码助手、文档助手、运维助手），并根据消息来源或用户意图自动路由到合适的 agent。

## Design — 三层路由 + Agent 间通信

### 路由架构

```
消息进入 → Layer 1: 静态路由（channel/group/peer binding）
         → Layer 2: 前缀路由（/code → code-agent, /ops → ops-agent）
         → Layer 3: 默认 agent（无匹配时 → default agent）
         → [v3.1] Layer 0: 意图分类（可选，LLM classifier）
```

### Layer 1: 静态绑定路由

基于消息来源的确定性路由，参考 OpenClaw 的 `AgentBinding` 模式。

```jsonc
{
  "agents": {
    "list": [
      { "id": "code", "workspace": "~/code-workspace", "model": "anthropic/claude-sonnet-4" },
      { "id": "docs", "workspace": "~/docs-workspace", "model": "anthropic/claude-sonnet-4" },
      { "id": "ops", "workspace": "~/ops-workspace", "model": "anthropic/claude-sonnet-4" }
    ],
    "default": "code"
  },
  "bindings": [
    { "agentId": "code", "match": { "channel": "telegram", "peer": { "kind": "group", "id": "-1001234" } } },
    { "agentId": "ops", "match": { "channel": "telegram", "peer": { "kind": "group", "id": "-1005678" } } },
    { "agentId": "docs", "match": { "channel": "discord", "guildId": "guild-abc" } }
  ]
}
```

匹配优先级（高→低）：peer > guild/team > account > channel > default。

### Layer 2: 前缀路由

用户在同一个 chat 里通过命令前缀切换 agent：

```
/code review this PR        → 路由到 code agent
/docs explain the API       → 路由到 docs agent
/ops check server status    → 路由到 ops agent
```

实现：message handler 解析前缀 → 覆盖 Layer 1 的路由结果 → 路由到指定 agent 的 RPC 进程。

前缀列表从 `agents.list[].id` 自动生成，注册为 Telegram/Discord 命令菜单。

### Layer 3: 默认 Agent

无匹配时路由到 `agents.default` 指定的 agent。

### [v3.1] Layer 0: 意图分类（可选）

用轻量 LLM（如 haiku/flash）做意图分类，confidence > 0.8 时覆盖默认路由。

```typescript
interface IntentClassification {
  agentId: string;
  confidence: number;  // 0-1
  reasoning: string;
}
```

- 延迟预算：< 500ms
- Confidence < 0.8 时 fallback 到 Layer 1-3 的结果
- 可通过配置关闭：`routing.intentClassifier.enabled: false`
- 分类 prompt 从 agents.list 的 description 字段自动生成

## Agent 间通信

### delegate_to_agent Tool

主 agent 通过 gateway 注册的 tool 委派任务给其他 agent：

```typescript
interface DelegateToAgentParams {
  agentId: string;          // 目标 agent
  task: string;             // 任务描述
  mode: "sync" | "async";  // 同步等结果 / 异步 fire-and-forget
  timeoutMs?: number;       // sync 模式超时（默认 60s）
  stream?: boolean;         // 是否转发 streaming output 给用户
}

interface DelegateResult {
  status: "completed" | "timeout" | "error";
  response?: string;        // agent 的回复
  sessionKey?: string;      // async 模式下用于后续查询
}
```

**实现路径：**
1. Agent A 调用 `delegate_to_agent` tool
2. Gateway 拦截 tool call，从 RPC pool 获取（或创建）agent B 的进程
3. 构造 prompt 发送给 agent B
4. sync 模式：等待 agent B 完成，返回结果给 agent A 的 tool result
5. async 模式：立即返回 sessionKey，agent B 完成后通过 gateway 通知

**Agent 间 streaming（差异化能力）：**
- `stream: true` 时，agent B 的 streaming output 通过 gateway WS 实时转发给用户
- 用户看到的效果：agent A 说"让我请文档专家来回答"，然后 agent B 的回复实时出现
- 这在 OpenClaw 的 embedded 模式下无法实现（同进程，无法并行 stream）

### 安全约束

```jsonc
{
  "agents": {
    "list": [
      {
        "id": "code",
        "delegation": {
          "allowAgents": ["docs", "ops"],  // 可委派的目标 agent
          "maxConcurrent": 2,               // 最大并发委派数
          "maxDepth": 1                     // 禁止链式委派（A→B→C）
        }
      }
    ]
  }
}
```

参考 OpenClaw 的 `subagents.allowAgents` 白名单机制。

## 与现有设计的关系

| 组件 | 影响 |
|------|------|
| RPC Pool | 扩展 capability profile，加 agentId 维度 |
| Session Router | 扩展路由逻辑，支持 binding + 前缀 |
| Message Queue | priority 可按 agent 差异化（code agent 优先级高于 docs） |
| Extension UI | delegate 期间的 UI request 需要决定由哪个 agent 处理 |
| Metrics | 新增 per-agent 指标（latency、throughput、delegation count） |

## 实现顺序

1. agents.list 配置 + 多 agent RPC pool 管理
2. Layer 1 静态绑定路由
3. Layer 2 前缀路由 + 命令菜单注册
4. delegate_to_agent tool（sync 模式）
5. delegate_to_agent tool（async 模式 + streaming）
6. [v3.1] Layer 0 意图分类

## OpenClaw 对标

| 能力 | OpenClaw | pi-gateway v3 |
|------|----------|---------------|
| 多 agent 配置 | agents.list + defaults | 相同 |
| 静态路由 | AgentBinding (peer/guild/team/account/channel) | 相同 |
| 前缀路由 | 无 | 新增 |
| 意图分类 | 无 | v3.1 新增 |
| Subagent 派生 | sessions_spawn (async only, embedded) | delegate_to_agent (sync/async, RPC isolated) |
| Agent 间 streaming | 不可能（embedded 限制） | 支持（RPC pool + WS） |
| 进程隔离 | 无（同进程） | 有（独立 RPC 进程） |

---

*Based on OpenClaw architecture analysis by DarkFalcon, 2026-02-11*
