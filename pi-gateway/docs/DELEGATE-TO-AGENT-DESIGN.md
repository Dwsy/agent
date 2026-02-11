# Delegate to Agent — Sync Mode Design

> Status: Draft | Author: GoldJaguar | Date: 2026-02-11
> 
> v3.0 第一个实现项：Agent A 同步委派任务给 Agent B，等待结果返回

---

## 1. Tool Schema 定义

Agent A 调用时看到的 tool 定义：

```typescript
// 注册给所有 agent 的 system tool
export const DELEGATE_TO_AGENT_TOOL = {
  name: "delegate_to_agent",
  description: `Delegate a task to another specialized agent and wait for completion.
Use this when the current agent lacks expertise for a specific task.
Available agents depend on gateway configuration.`,
  parameters: {
    type: "object",
    properties: {
      agentId: {
        type: "string",
        description: "Target agent ID (e.g., 'docs', 'code', 'ops'). Must be in the allowed list for this agent.",
      },
      task: {
        type: "string",
        description: "Clear, specific task description for the target agent. Include context needed to complete the task.",
      },
      mode: {
        type: "string",
        enum: ["sync", "async"],
        description: "Execution mode. Use 'sync' to wait for result, 'async' to fire-and-forget (returns sessionKey for later query).",
        default: "sync",
      },
      timeoutMs: {
        type: "number",
        description: "Maximum wait time in milliseconds (sync mode only). Default: 60000 (1 min). Max: 300000 (5 min).",
        default: 60000,
        minimum: 5000,
        maximum: 300000,
      },
      stream: {
        type: "boolean",
        description: "Forward target agent's streaming output to user in real-time (sync mode only).",
        default: false,
      },
    },
    required: ["agentId", "task"],
  },
} as const;
```

**Tool Result 格式**（Agent A 收到）：

```typescript
interface DelegateToolResult {
  status: "completed" | "timeout" | "error" | "rejected";
  response?: string;        // agent B 的回复（completed 时）
  error?: string;           // 错误详情（timeout/error/rejected 时）
  sessionKey?: string;      // async 模式下用于后续查询
  durationMs?: number;      // 实际执行时间
  agentId: string;          // 确认目标 agent
}
```

---

## 2. Gateway 拦截逻辑

### 2.1 识别 Delegate Tool Call

在 `server.ts` 的 `handleAgentTurn` 或 tool call 拦截点：

```typescript
// 在 before_tool_call hook 中识别
private isDelegateToolCall(toolCall: ToolCall): boolean {
  return toolCall.name === "delegate_to_agent";
}

// 解析参数
private parseDelegateParams(args: unknown): DelegateToAgentParams {
  const parsed = args as DelegateToAgentParams;
  return {
    agentId: parsed.agentId,
    task: parsed.task,
    mode: parsed.mode ?? "sync",
    timeoutMs: Math.min(parsed.timeoutMs ?? 60000, 300000),
    stream: parsed.stream ?? false,
  };
}
```

### 2.2 安全约束检查

```typescript
interface DelegationConstraints {
  allowAgents: string[];      // 白名单
  maxConcurrent: number;      // 最大并发
  maxDepth: number;           // 最大委派深度
}

private checkDelegationConstraints(
  sourceAgentId: string,
  targetAgentId: string,
  parentSessionKey: SessionKey,
): { allowed: boolean; reason?: string } {
  const constraints = this.config.agents.list.find(
    a => a.id === sourceAgentId
  )?.delegation;

  if (!constraints) {
    return { allowed: false, reason: "Source agent has no delegation config" };
  }

  // 白名单检查
  if (!constraints.allowAgents.includes(targetAgentId)) {
    return { allowed: false, reason: `Agent ${targetAgentId} not in allowlist` };
  }

  // 并发检查
  const currentDelegations = this.countActiveDelegations(sourceAgentId);
  if (currentDelegations >= constraints.maxConcurrent) {
    return { allowed: false, reason: `Max concurrent delegations (${constraints.maxConcurrent}) reached` };
  }

  // 深度检查（防止 A→B→C 链式）
  const currentDepth = this.getDelegationDepth(parentSessionKey);
  if (currentDepth >= constraints.maxDepth) {
    return { allowed: false, reason: `Max delegation depth (${constraints.maxDepth}) reached` };
  }

  return { allowed: true };
}
```

### 2.3 拦截流程

```
Agent A 发起 tool call
    ↓
[Hook: before_tool_call]
    ↓
识别为 delegate_to_agent?
    ├── No → 正常 tool 调用流程
    ↓
安全约束检查
    ├── Rejected → 返回 tool result (status: "rejected", error)
    ↓
创建委派上下文（DelegateContext）
    ↓
进入 DelegateExecutor 处理
    ↓
返回 tool result 给 Agent A
```

---

## 3. RPC Pool 交互

### 3.1 Agent B 进程获取

```typescript
class DelegateExecutor {
  async executeSync(
    params: DelegateToAgentParams,
    parentContext: DelegateParentContext,
  ): Promise<DelegateResult> {
    const { agentId, task, timeoutMs, stream } = params;
    
    // 1. 构建 Agent B 的 capability profile
    const agentConfig = this.config.agents.list.find(a => a.id === agentId);
    if (!agentConfig) {
      throw new DelegateError(`Unknown agent: ${agentId}`);
    }

    const profile = buildAgentCapabilityProfile(agentConfig, this.config);
    
    // 2. 从 pool 获取/创建 Agent B 的 RPC 进程
    // 关键：使用 delegation session key 隔离，不污染普通 session
    const delegateSessionKey = `delegate:${parentContext.sessionKey}:${agentId}:${Date.now()}`;
    
    const rpc = await this.pool.acquire(delegateSessionKey, profile);
    
    // 3. 构造 prompt 发送给 Agent B
    const prompt = this.buildDelegatePrompt(task, parentContext);
    
    // 4. 执行并等待结果
    const startTime = Date.now();
    
    try {
      if (stream) {
        // 流式模式：实时转发到 parent session 的 WS
        return await this.executeWithStreaming(rpc, prompt, timeoutMs, parentContext);
      } else {
        // 非流式：直接等待完整响应
        return await this.executeBlocking(rpc, prompt, timeoutMs);
      }
    } finally {
      // 5. 释放进程（可选：保持 warm 一段时间？）
      this.pool.release(delegateSessionKey);
      
      // 6. 清理 delegation session
      this.sessions.delete(delegateSessionKey);
    }
  }
}
```

### 3.2 Capability Profile 构建

```typescript
function buildAgentCapabilityProfile(
  agentConfig: AgentConfig,
  gatewayConfig: Config,
): CapabilityProfile {
  return buildCapabilityProfile({
    config: gatewayConfig,
    role: agentConfig.role ?? agentConfig.id,
    cwd: agentConfig.workspace,
    // 关键：使用 agent 指定的 model
    model: agentConfig.model,
    // 可选：agent 特定的 extensions/skills
    extensions: agentConfig.extensions,
    skills: agentConfig.skills,
  });
}
```

### 3.3 Prompt 构造

```typescript
private buildDelegatePrompt(
  task: string,
  parentContext: DelegateParentContext,
): string {
  return `[Delegated Task from ${parentContext.agentId}]

Original user message context:
"""${parentContext.userMessage}"""

Your task:
${task}

Please respond directly to the user through me. Be concise and focused.`;
}
```

---

## 4. 超时和错误处理

### 4.1 超时层级

```typescript
interface DelegateTimeouts {
  // Layer 1: RPC acquire timeout（获取进程）
  acquireMs: 10000;
  
  // Layer 2: Agent B execution timeout（用户指定）
  executionMs: number; // 默认 60000，最大 300000
  
  // Layer 3: Cleanup timeout（清理资源）
  cleanupMs: 5000;
}

// 超时处理策略
private async executeWithTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new DelegateTimeoutError(`${operationName} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([operation, timeoutPromise]);
}
```

### 4.2 错误分类与处理

```typescript
type DelegateErrorType =
  | "AGENT_NOT_FOUND"        // 目标 agent 不存在
  | "AGENT_NOT_ALLOWED"      // 安全约束拒绝
  | "POOL_CAPACITY_EXCEEDED" // pool 满
  | "TIMEOUT"                // 执行超时
  | "RPC_ERROR"              // RPC 通信错误
  | "AGENT_CRASH"            // Agent B 进程崩溃
  | "MAX_DEPTH_EXCEEDED"     // 委派深度超限
  | "MAX_CONCURRENT_EXCEEDED"; // 并发超限

class DelegateError extends Error {
  constructor(
    public type: DelegateErrorType,
    message: string,
    public recoverable: boolean,
  ) {
    super(message);
  }
}

// 错误映射到 tool result
function mapErrorToResult(error: DelegateError): DelegateToolResult {
  const errorMessages: Record<DelegateErrorType, string> = {
    AGENT_NOT_FOUND: "Target agent does not exist",
    AGENT_NOT_ALLOWED: "Delegation to this agent is not permitted",
    POOL_CAPACITY_EXCEEDED: "System busy, please retry later",
    TIMEOUT: "Task took too long to complete",
    RPC_ERROR: "Communication error with target agent",
    AGENT_CRASH: "Target agent encountered an error",
    MAX_DEPTH_EXCEEDED: "Cannot chain delegations",
    MAX_CONCURRENT_EXCEEDED: "Too many active delegations",
  };

  return {
    status: "error",
    error: errorMessages[error.type] ?? error.message,
    agentId: "", // 已知的会在上层填充
  };
}
```

### 4.3 资源清理保证

```typescript
// 使用 finally 块确保资源释放
private async executeWithCleanup(
  delegateSessionKey: SessionKey,
  execution: () => Promise<DelegateResult>,
): Promise<DelegateResult> {
  let result: DelegateResult;
  
  try {
    result = await execution();
  } catch (error) {
    result = this.handleExecutionError(error);
  } finally {
    // 保证清理
    await this.cleanupDelegation(delegateSessionKey);
  }
  
  return result;
}

private async cleanupDelegation(sessionKey: SessionKey): Promise<void> {
  // 1. 释放 RPC 进程
  this.pool.release(sessionKey);
  
  // 2. 清理 session 数据
  this.sessions.delete(sessionKey);
  
  // 3. 清理 delegation context
  this.delegateContexts.delete(sessionKey);
  
  // 4. 通知相关 hooks
  await this.registry.hooks.dispatch("delegation_end", { sessionKey });
}
```

---

## 5. 数据结构汇总

```typescript
// 核心接口
interface DelegateToAgentParams {
  agentId: string;
  task: string;
  mode: "sync" | "async";
  timeoutMs?: number;
  stream?: boolean;
}

interface DelegateResult {
  status: "completed" | "timeout" | "error" | "rejected";
  response?: string;
  error?: string;
  sessionKey?: string;
  durationMs?: number;
  agentId: string;
}

interface DelegateContext {
  id: string;
  parentSessionKey: SessionKey;
  parentAgentId: string;
  targetAgentId: string;
  delegateSessionKey: SessionKey;
  startTime: number;
  status: "pending" | "running" | "completed" | "error";
  depth: number;
}

interface DelegateParentContext {
  sessionKey: SessionKey;
  agentId: string;
  userMessage: string;
}
```

---

## 6. 实现步骤

| Step | 任务 | 文件 | 预估时间 |
|------|------|------|----------|
| 1 | Tool schema 定义 + 注册 | `src/tools/delegate.ts` | 30min |
| 2 | Gateway 拦截逻辑 | `src/server.ts` (hook) | 1h |
| 3 | DelegateExecutor 核心 | `src/core/delegate-executor.ts` | 2h |
| 4 | 安全约束检查 | `src/core/delegate-constraints.ts` | 1h |
| 5 | 超时/错误处理 | `src/core/delegate-executor.ts` | 1h |
| 6 | 集成测试 | `scripts/test-delegate.sh` | 30min |

---

## 7. Metrics 可观测性

Delegation 指标集成到现有 `/api/metrics` endpoint：

```typescript
interface DelegationMetricsSnapshot {
  delegationCount: number;     // 总委派次数
  success: number;             // 成功完成
  timeout: number;             // 超时
  error: number;               // 错误（RPC/Agent 崩溃）
  rejected: number;            // 安全约束拒绝
  poolExhausted: number;       // Pool 容量耗尽
  avgDurationMs: number;       // 平均执行时间（P50 近似）
  p95DurationMs: number;       // P95 延迟
  activeDelegations: number;   // 当前活跃委派数
}
```

**指标记录点：**
- `recordDelegationStart()`: executeDelegation 开始时
- `recordDelegateComplete(duration, status)`: 完成时（success/timeout/error/rejected/pool_exhausted）

**PRD Success Criteria:**
- Gateway overhead p95 < 2s（从 delegation 触发到返回结果的总耗时）

---

## 8. 实现状态

| Step | 任务 | 状态 | 负责人 |
|------|------|------|--------|
| 1 | Config 类型定义 | ✅ | GoldJaguar |
| 2 | Tool schema + 注册 | ✅ | GoldJaguar |
| 3 | DelegateExecutor 核心 | ✅ | GoldJaguar |
| 4 | Gateway 拦截集成 | ✅ | GoldJaguar |
| 5 | 安全约束检查 | ✅ | GoldJaguar |
| 6 | 超时/错误处理 | ✅ | GoldJaguar |
| 7 | Metrics 埋点 | ✅ | GoldJaguar |
| 8 | Phase 1 测试 | ✅ | MintTiger (22/22) |
| 9 | Metrics 测试 | 🔄 | MintTiger (D-17~D-19) |

---

## 9. 实现笔记

**为什么用非聚合方式记录 duration？**
- QuantileTracker 保持原始值，P95 计算更准确
- 1小时滑动窗口，自动淘汰过期数据
- 内存可控：max 1000 条目

**pool_exhausted 直接返回不 retry？**
- v3.0 简化设计，避免队列堆积
- 调用方 agent 收到错误后可自行决定是否重试
- 缓解 risk: pool 内存线性增长

---

*Updated: 2026-02-11 | Review: DarkFalcon, pi-zero*
