# Pi Extensions 事件参考

完整的事件列表和用法。

## 生命周期概览

```
pi starts
  │
  └─► session_start
      │
      ▼
user sends prompt ─────────────────────────────────────────┐
  │                                                        │
  ├─► (extension commands checked first, bypass if found)  │
  ├─► input (can intercept, transform, or handle)          │
  ├─► (skill/template expansion if not handled)            │
  ├─► before_agent_start (can inject message, modify system prompt)
  ├─► agent_start                                          │
  │                                                        │
  │   ┌─── turn (repeats while LLM calls tools) ───┐       │
  │   │                                            │       │
  │   ├─► turn_start                               │       │
  │   ├─► context (can modify messages)            │       │
  │   │                                            │       │
  │   │   LLM responds, may call tools:            │       │
  │   │     ├─► tool_call (can block)              │       │
  │   │     │   tool executes                      │       │
  │   │     └─► tool_result (can modify)           │       │
  │   │                                            │       │
  │   └─► turn_end                                 │       │
  │                                                        │
  └─► agent_end                                            │
                                                           │
user sends another prompt ◄────────────────────────────────┘

/new or /resume
  ├─► session_before_switch / session_switch

/fork
  ├─► session_before_fork / session_fork

/compact
  ├─► session_before_compact / session_compact

/tree
  ├─► session_before_tree / session_tree

/model or Ctrl+P
  └─► model_select

exit
  └─► session_shutdown
```

## 会话事件

### session_start

会话加载时触发。

```typescript
pi.on("session_start", async (_event, ctx) => {
  ctx.ui.notify("扩展已加载!", "info");
});
```

### session_before_switch / session_switch

切换会话时触发（`/new`, `/resume`）。

```typescript
pi.on("session_before_switch", async (event, ctx) => {
  // event.reason: "new" | "resume"
  // event.targetSessionFile: 目标会话文件（仅 resume）
  return { cancel: true }; // 取消切换
});

pi.on("session_switch", async (event, ctx) => {
  // event.previousSessionFile: 之前的会话
});
```

### session_before_fork / session_fork

分叉会话时触发（`/fork`）。

```typescript
pi.on("session_before_fork", async (event, ctx) => {
  // event.entryId: 分叉点的条目 ID
  return { cancel: true }; // 取消
  // 或 { skipConversationRestore: true } // 不恢复对话
});
```

### session_before_compact / session_compact

压缩会话时触发。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;
  return { cancel: true }; // 取消
  // 或提供自定义摘要
  return { compaction: { summary: "...", firstKeptEntryId, tokensBefore } };
});
```

### session_before_tree / session_tree

树导航时触发（`/tree`）。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  return { cancel: true }; // 取消
  // 或提供自定义摘要
  return { summary: { summary: "...", details: {} } };
});
```

### session_shutdown

退出时触发（Ctrl+C, Ctrl+D, SIGTERM）。

```typescript
pi.on("session_shutdown", async (_event, ctx) => {
  // 清理、保存状态
});
```

## Agent 事件

### before_agent_start

用户提交提示后，Agent 循环开始前触发。

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  return {
    message: { customType: "my-ext", content: "...", display: true },
    systemPrompt: event.systemPrompt + "\n额外指令...",
  };
});
```

### agent_start / agent_end

每个用户提示触发一次。

```typescript
pi.on("agent_start", async (_event, ctx) => {});
pi.on("agent_end", async (event, ctx) => {
  // event.messages: 本次提示的消息
});
```

### turn_start / turn_end

每次 LLM 响应 + 工具调用时触发。

```typescript
pi.on("turn_start", async (event, ctx) => {
  // event.turnIndex, event.timestamp
});
pi.on("turn_end", async (event, ctx) => {
  // event.turnIndex, event.message, event.toolResults
});
```

### context

每次 LLM 调用前触发，可修改消息。

```typescript
pi.on("context", async (event, ctx) => {
  const filtered = event.messages.filter(m => !shouldPrune(m));
  return { messages: filtered };
});
```

## 工具事件

### tool_call

工具执行前触发，**可拦截**。

```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  // 内置工具
  if (isToolCallEventType("bash", event)) {
    // event.input: { command: string; timeout?: number }
  }

  if (isToolCallEventType("read", event)) {
    // event.input: { path: string; offset?: number; limit?: number }
  }

  // 拦截
  return { block: true, reason: "原因" };
});
```

### tool_result

工具执行后触发，**可修改结果**。

```typescript
import { isBashToolResult } from "@mariozechner/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  if (isBashToolResult(event)) {
    // event.details: BashToolDetails
  }

  // 修改结果
  return { content: [...], details: {...}, isError: false };
});
```

## 输入事件

### input

用户输入时触发（技能/模板扩展前）。

```typescript
pi.on("input", async (event, ctx) => {
  // event.text: 原始输入
  // event.images: 附加的图片
  // event.source: "interactive" | "rpc" | "extension"

  // 转换
  if (event.text.startsWith("?quick ")) {
    return { action: "transform", text: `简洁回答: ${event.text.slice(7)}` };
  }

  // 处理（跳过 Agent）
  if (event.text === "ping") {
    ctx.ui.notify("pong", "info");
    return { action: "handled" };
  }

  // 继续
  return { action: "continue" };
});
```

**结果类型：**
- `continue` - 继续处理（默认）
- `transform` - 修改后继续
- `handled` - 跳过 Agent

## 模型事件

### model_select

模型切换时触发。

```typescript
pi.on("model_select", async (event, ctx) => {
  // event.model: 新模型
  // event.previousModel: 之前的模型
  // event.source: "set" | "cycle" | "restore"
});
```

## 用户 Bash 事件

### user_bash

用户执行 `!` 或 `!!` 命令时触发。

```typescript
pi.on("user_bash", (event, ctx) => {
  // event.command: 命令
  // event.excludeFromContext: true 如果 !! 前缀
  // event.cwd: 工作目录

  // 提供自定义操作
  return { operations: remoteBashOps };

  // 或直接返回结果
  return { result: { output: "...", exitCode: 0, ... } };
});
```
