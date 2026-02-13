# Steer/Interrupt 预研报告

> 状态: Draft | 作者: GoldJaguar | 日期: 2026-02-11
> 
> 基于 OpenClaw 实现分析 + pi-gateway v3 方向确认

---

## 1. OpenClaw 实现要点

### 1.1 Abort 触发词检测
```javascript
const ABORT_TRIGGERS = new Set(["stop", "esc", "abort", "wait", "exit", "interrupt"]);

export function isAbortTrigger(text) {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return ABORT_TRIGGERS.has(normalized);
}
```

### 1.2 队列清理层级 (clearSessionQueues)
```javascript
export function clearSessionQueues(keys) {
  for (const key of keys) {
    // 1. 清理 followup 队列
    followupCleared += clearFollowupQueue(cleaned);
    // 2. 清理 command lane
    laneCleared += clearCommandLane(resolveEmbeddedSessionLane(cleaned));
  }
  return { followupCleared, laneCleared, keys: clearedKeys };
}
```

### 1.3 Subagent 清理
```javascript
export function stopSubagentsForRequester(params) {
  const runs = listSubagentRunsForRequester(requesterKey);
  for (const run of runs) {
    // 清理子 agent 队列
    clearSessionQueues([childKey]);
    // 中止子 agent 运行
    abortEmbeddedPiRun(sessionId);
  }
  return { stopped };
}
```

### 1.4 Abort Memory
```javascript
const ABORT_MEMORY = new Map();

export function getAbortMemory(key) {
  return ABORT_MEMORY.get(key);
}

export function setAbortMemory(key, value) {
  ABORT_MEMORY.set(key, value);
}
```

---

## 2. pi-gateway 现状对比

| 功能 | OpenClaw | pi-gateway | 差异说明 |
|------|----------|------------|----------|
| RPC `abort()` | ✅ | ✅ | 功能一致 |
| RPC `steer()` | ✅ | ✅ | 功能一致 |
| Message mode | steer/follow-up/interrupt/queue | steer/follow-up/interrupt | OpenClaw 多一个 queue 模式 |
| Timeout abort | ✅ | ✅ | pi-gateway 有 5s force-kill 兜底 |
| 队列架构 | 多层 (followup + lane + collect) | 单层 SessionQueue | OpenClaw 更复杂 |
| Subagent 管理 | embedded 子 agent | ❌ 无 | pi-gateway 无 subagent 概念 |
| Abort 触发词 | 内置检测 | ❌ 未实现 | 可作为可选配置添加 |
| Abort Memory | 全局 Map | ❌ 未实现 | 非核心功能，可选 |

---

## 3. 关键差异分析

### 3.1 架构差异

**OpenClaw**: 
- 多层队列模型（followup queue + command lane + collect buffer）
- 支持 embedded subagent（pi 进程中嵌套子 agent）
- 复杂的生命周期管理

**pi-gateway**:
- 单层 SessionQueue（SwiftQuartz P2 正在增强）
- 无 subagent（v3 方向改为 delegate_to_agent tool 做进程级隔离）
- 简化的 abort 模型（仅 RPC 命令）

### 3.2 v3 方向确认

根据 pi-zero 确认，v3 不做 OpenClaw 式的 embedded subagent：
- ❌ 不实现 `listSubagentRunsForRequester`
- ❌ 不实现 `abortEmbeddedPiRun`
- ✅ 通过 `delegate_to_agent` tool 做进程级隔离的 agent 间通信
- ✅ 参考 docs/MULTI-AGENT-ROUTING-DESIGN.md

---

## 4. 实现 Scope（v3 修正版）

### 4.1 Steer 模式

**触发条件**: 新消息到达时，当前 session 正在 run

**行为**:
1. 调用 `rpc.steer(newMessage)` 注入新消息
2. 不 abort 当前 run
3. 让 agent 自己决定是否切换上下文

**依赖**: RPC `steer()` 方法已存在

### 4.2 Interrupt 模式

**触发条件**: 新消息到达时，当前 session 正在 run

**行为**:
1. 调用 `rpc.abort()` 中止当前 run
2. 清理 SessionQueue（等待 SwiftQuartz P2 collect mode）
3. 用新消息重新 dispatch

**依赖**: 
- SwiftQuartz P2 collect mode 完成后的队列清理接口
- 可能需要 `clearCollectBuffer()` 方法

### 4.3 Abort 触发词检测（可选配置）

**配置项**:
```json
{
  "agent": {
    "abortTriggers": ["stop", "esc", "abort", "wait", "exit", "interrupt"],
    "enableAbortTriggers": true
  }
}
```

**行为**:
- 检测到触发词时，等同于 interrupt 模式
- 返回确认消息："⚙️ Agent was aborted."

**默认**: `false`（有些用户不想要）

### 4.4 队列清理接口

等待 SwiftQuartz P2 完成后定义：
```typescript
interface SessionQueue {
  // 现有方法...
  
  // 新增：清理 collect buffer（P2 后实现）
  clearCollectBuffer(): number; // 返回清理的消息数
}
```

---

## 5. 实施优先级

| 任务 | 优先级 | 依赖 | 负责人 |
|------|--------|------|--------|
| Steer 模式 | P2 | 无 | 待分配 |
| Interrupt 模式 | P2 | SwiftQuartz P2 | 待分配 |
| Abort 触发词 | P3 | 无 | 待分配 |
| Collect buffer 清理 | P2 | SwiftQuartz P2 | SwiftQuartz |

---

## 6. 附录

### 6.1 OpenClaw 关键文件
```
auto-reply/reply/abort.js          # Abort 主逻辑
auto-reply/reply/queue/cleanup.js  # 队列清理
auto-reply/reply/queue/state.js    # Followup 队列状态
```

### 6.2 pi-gateway 关键文件
```
src/core/rpc-client.ts    # RPC steer/abort 方法
src/core/message-queue.ts # SessionQueue 实现
src/server.ts             # Dispatch 逻辑
```

---

*「計画通り」* — 调研完成，等待 P2 collect mode 落地后继续。
