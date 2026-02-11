# PRD: pi-gateway v3.0 — Multi-Agent Collaboration Gateway

**Status:** Draft → Review
**Author:** DarkFalcon (architecture), pi-zero (product)
**Date:** 2026-02-11

## 1. Overview

pi-gateway v3.0 将从单 agent 网关升级为多 agent 协作网关。核心能力：多 agent 配置、消息路由、agent 间任务委派。

**v3.0 scope 限定：** sync delegate + static/prefix 路由。async/streaming delegate、intent classifier 留 v3.1。

## 2. Target Users

技术型个人开发者和 2-5 人小团队。不追企业市场。

## 3. Core Features

### 3.1 Multi-Agent Configuration

多个 agent 共享一个 gateway，各自独立 workspace/model/role。

```jsonc
{
  "agents": {
    "list": [
      { "id": "code", "workspace": "~/code-workspace", "model": "anthropic/claude-sonnet-4" },
      { "id": "docs", "workspace": "~/docs-workspace", "model": "anthropic/claude-sonnet-4" }
    ],
    "default": "code"
  }
}
```

### 3.2 Three-Layer Routing

```
消息 → Layer 1: 静态绑定（channel/group/peer → agentId）
     → Layer 2: 前缀命令（/code, /docs, /ops → agentId）
     → Layer 3: 默认 agent
```

### 3.3 delegate_to_agent (Sync)

Agent A 通过 gateway tool 委派任务给 Agent B，同步等待结果。

**Tool schema:**
```typescript
{ name: "delegate_to_agent", parameters: { agentId: string, task: string, timeoutMs?: number } }
```

**Result:**
```typescript
| { status: "completed"; response: string; durationMs: number }
| { status: "timeout"; partialResponse?: string; durationMs: number }
| { status: "agent_not_found"; agentId: string; durationMs: number }
| { status: "error"; code: string; message: string; durationMs: number }
```

**Error codes:** `pool_exhausted` | `rpc_crash` | `delegation_denied` | `delegation_depth_exceeded` | `internal`

## 4. Design References

| 文档 | 路径 |
|------|------|
| 路由架构 | docs/MULTI-AGENT-ROUTING-DESIGN.md |
| delegate 详细设计 | docs/DELEGATE-TO-AGENT-DESIGN.md |
| OpenClaw 对标 | docs/TELEGRAM-CONTENT-TYPES-GAP.md |

## 5. Acceptance Criteria

### AC-1: Multi-Agent Config
- [ ] agents.list 支持多个 agent 定义（id/workspace/model/delegation）
- [ ] agents.default 指定默认 agent
- [ ] 无 agents 配置时行为不变（向后兼容）

### AC-2: Static Binding Routing
- [ ] bindings 配置匹配 channel/peer/guild → agentId
- [ ] 优先级：peer > guild/team > account > channel > default
- [ ] 未匹配时 fallback 到 default agent

### AC-3: Prefix Command Routing
- [ ] /code, /docs 等前缀从 agents.list[].id 自动生成
- [ ] 前缀命令覆盖 Layer 1 路由结果
- [ ] 前缀注册到 Telegram/Discord 命令菜单

### AC-4: delegate_to_agent Sync — Happy Path
- [ ] Agent A 调用 delegate_to_agent → Gateway 路由到 Agent B → B 执行 → 结果返回 A 的 tool result
- [ ] response 包含 B 的完整回复文本
- [ ] durationMs 准确反映实际耗时

### AC-5: delegate_to_agent — Error Scenarios
- [ ] agentId 不存在 → status: "agent_not_found"
- [ ] agentId 不在 allowAgents → status: "error", code: "delegation_denied"
- [ ] 超时 → status: "timeout", 带 partialResponse（如有）
- [ ] RPC pool 满 → status: "error", code: "pool_exhausted"
- [ ] RPC 进程崩溃 → status: "error", code: "rpc_crash"
- [ ] 链式委派超深度 → status: "error", code: "delegation_depth_exceeded"

### AC-6: Safety Constraints
- [ ] delegation.allowAgents 白名单强制生效
- [ ] delegation.maxDepth 限制链式委派（A→B→C 被拒绝当 maxDepth=1）
- [ ] delegation.maxConcurrent 限制单 agent 并发委派数
- [ ] delegationDepth 通过 RPC metadata 显式传递
- [ ] 超时强制 abort，不允许无限等待

### AC-7: Metrics
- [ ] /api/metrics 新增 delegation 指标：
  - delegationCount / delegationSuccessCount / delegationTimeoutCount / delegationErrorCount
  - delegationAvgDuration / delegationP95Duration
  - activeDelegations（当前进行中）
- [ ] 指标按 agentId 维度拆分

### AC-8: Backward Compatibility
- [ ] 无 agents 配置时，gateway 行为与 v2 完全一致
- [ ] 现有 Telegram/Discord/WebChat 插件无需修改
- [ ] 现有 queue/metrics/extension-ui 功能不受影响

## 6. Out of Scope (v3.1+)

- async delegate（fire-and-forget + announce）
- streaming delegate（B 的 stream 转发给用户）
- intent classifier（LLM 意图路由）
- delegate attachments/metadata
- onTimeout: "detach" 模式
- agent 间共享 workspace

## 7. Implementation Plan

| Step | Owner | 依赖 | 预估 | 状态 |
|------|-------|------|------|------|
| 1. agents config 解析 | GoldJaguar | — | 0.5d | ✅ |
| 2. static binding 路由 | GoldJaguar | step 1 | 1d | 📋 |
| 3. prefix command 路由 | GoldJaguar | step 1 | 0.5d | 📋 |
| 4. delegate tool schema + handler | GoldJaguar | step 1 | 1d | ✅ |
| 5. RPC pool acquireForAgent | SwiftQuartz | step 1 | 1d | ✅ |
| 6. delegate session lifecycle | GoldJaguar | step 4,5 | 1.5d | ✅ |
| 7. safety constraints | GoldJaguar | step 6 | 0.5d | ✅ |
| 8. metrics | GoldJaguar | step 6 | 0.5d | 🔄 |
| 9. 集成测试 | MintTiger | step 1-8 | 1d | 📋 |
| 10. Telegram 命令菜单注册 | KeenDragon | step 3 | 0.5d | 📋 |

**总预估：** ~8 工作日（各线并行后约 4-5 天）

## 8. Risks

| 风险 | 影响 | 缓解 |
|------|------|------|
| RPC pool 资源竞争 | delegate 占用进程导致正常消息排队 | maxConcurrent 限制 + pool 容量规划 |
| 链式委派死锁 | A 等 B，B 等 A | maxDepth=1 + 超时强制 abort |
| 配置复杂度 | 用户配置门槛高 | 无 agents 配置时完全向后兼容 |
| Pool 内存线性增长 | 每个 agent 至少 1 个 RPC 进程，多 agent 配置下内存占用显著增加 | 文档说明资源规划 + pool max 上限 + idle eviction |

## 9. Success Metrics

- Gateway overhead p95 < 2s（从收到 tool call 到 RPC 发出 prompt 的时间）
- 错误率 < 1%（排除 timeout）
- 0 regression on v2 功能

---

*Based on MULTI-AGENT-ROUTING-DESIGN.md + DELEGATE-TO-AGENT-DESIGN.md + OpenClaw architecture analysis*
