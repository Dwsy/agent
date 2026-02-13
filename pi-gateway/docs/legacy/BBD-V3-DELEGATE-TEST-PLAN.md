# v3 delegate_to_agent BBD 测试计划

> Author: MintTiger | Date: 2026-02-11
> Based on: docs/MULTI-AGENT-ROUTING-DESIGN.md (DarkFalcon)
> Scope: v3.0 sync delegate 优先

## 测试矩阵

### 1. Sync Delegate — Happy Path

| # | 场景 | 操作 | 预期 | 验证方法 |
|---|------|------|------|----------|
| D-1 | A→B 成功返回 | Agent A 调用 `delegate_to_agent({ agentId: "docs", task: "explain API", mode: "sync" })` | status=completed, response 包含 B 的回复 | 单元测试 mock RPC |
| D-2 | 委派 prompt 包含前缀 | B 收到的 prompt | 包含 `[Delegated from code]` 前缀 | 检查 RPC prompt 参数 |
| D-3 | A 收到 tool result | delegate 返回后 A 继续 | A 的回复引用 B 的结果 | 端到端 Telegram 测试 |
| D-4 | Pool 复用 | 同一 agentId 连续 delegate | 复用已有 RPC 进程（不 spawn 新的） | metrics 检查 pool.active |

### 2. Timeout

| # | 场景 | 操作 | 预期 | 验证方法 |
|---|------|------|------|----------|
| D-5 | B 超时 | delegate timeoutMs=5000, B 处理 >5s | status=timeout, response=partialResponse（已收到的部分） | mock slow RPC |
| D-6 | 超时后 A 继续 | A 收到 timeout result | A 回复用户 "文档助手超时，我来回答" | 端到端测试 |
| D-7 | 超时后 B 的 RPC 被释放 | timeout 触发后 | B 的 RPC 进程回到 pool idle | metrics pool.idle 检查 |

### 3. 错误场景

| # | 场景 | 操作 | 预期 | 验证方法 |
|---|------|------|------|----------|
| D-8 | agent_not_found | delegate agentId="nonexistent" | status=error, error="agent_not_found" | 单元测试 |
| D-9 | delegation_denied | A 的 allowAgents 不含 B | status=error, error="delegation_denied" | 单元测试 |
| D-10 | pool_exhausted | pool 满且 waiting list 满 | status=error, error="pool_exhausted" | mock full pool |

### 4. 安全约束

| # | 场景 | 操作 | 预期 | 验证方法 |
|---|------|------|------|----------|
| D-11 | 深度限制 maxDepth=1 | A→B→C 链式委派 | B→C 被拒，error="max_depth_exceeded" | 单元测试 |
| D-12 | 并发限制 maxConcurrent=2 | A 同时 delegate 3 个 | 第 3 个被拒，error="max_concurrent_exceeded" | 并发测试 |
| D-13 | allowAgents 白名单 | A(allowAgents=["docs"]) delegate to "ops" | 被拒 | 单元测试 |

### 5. 被委派 Agent 视角

| # | 场景 | 操作 | 预期 | 验证方法 |
|---|------|------|------|----------|
| D-14 | delegation 前缀 | B 收到的 prompt | `[Delegated from {agentId}] {task}` | 检查 RPC prompt |
| D-15 | B 的 session 隔离 | A 和 B 的 session | 不同 sessionKey，独立上下文 | session-router 验证 |
| D-16 | B 的 capability profile | B 使用自己的 model/tools/skills | profile 匹配 agents.list 配置 | capability-profile 测试 |

### 6. Metrics & 可观测性

| # | 场景 | 操作 | 预期 | 验证方法 |
|---|------|------|------|----------|
| D-17 | delegation 计数 | 成功 delegate | counters.delegationCount++ | /api/metrics |
| D-18 | per-agent latency | delegate 完成 | latency.delegation.p95 有值 | /api/metrics |
| D-19 | delegation 失败计数 | timeout/denied/not_found | counters.delegationErrors++ | /api/metrics |

## 实现优先级

### Phase 1: 单元测试（GoldJaguar 实现时同步写）

```
D-1, D-2, D-5, D-8, D-9, D-10, D-11, D-12, D-13, D-14, D-15, D-16
```

12 项，纯逻辑验证，mock RPC + pool。

### Phase 2: 集成测试（代码合并后）

```
D-4, D-7, D-17, D-18, D-19
```

5 项，需要真实 RPC pool + metrics。

### Phase 3: 端到端测试（部署后）

```
D-3, D-6
```

2 项，需要 Telegram 真实环境 + 多 agent 配置。

## 测试骨架

```typescript
// src/core/bbd-v3-delegate.test.ts

describe("v3: delegate_to_agent sync", () => {
  // Happy path
  test("D-1: successful A→B delegation returns completed status");
  test("D-2: delegated prompt includes [Delegated from] prefix");
  test("D-4: same agentId reuses existing RPC process");

  // Timeout
  test("D-5: timeout returns partial response");
  test("D-7: timed-out RPC is released back to pool");

  // Errors
  test("D-8: unknown agentId returns agent_not_found");
  test("D-9: disallowed agent returns delegation_denied");
  test("D-10: full pool returns pool_exhausted");

  // Security
  test("D-11: chain delegation A→B→C blocked by maxDepth=1");
  test("D-12: concurrent limit exceeded returns error");
  test("D-13: allowAgents whitelist enforced");

  // Delegatee perspective
  test("D-14: delegatee sees [Delegated from] prefix in prompt");
  test("D-15: delegatee has isolated session");
  test("D-16: delegatee uses own capability profile");

  // Metrics
  test("D-17: delegation success increments counter");
  test("D-18: delegation latency tracked in percentiles");
  test("D-19: delegation errors increment error counter");
});
```

## 依赖

| 依赖 | 状态 | 阻塞 |
|------|------|------|
| MULTI-AGENT-ROUTING-DESIGN.md | ✅ 定稿 | — |
| GoldJaguar delegate 实现 | 🔄 进行中 | Phase 1 可先写骨架 |
| 多 agent 配置支持 | 🔄 进行中 | Phase 2/3 |
| 115.191.43.169 部署 | ⏳ 等重启 | Phase 3 |
