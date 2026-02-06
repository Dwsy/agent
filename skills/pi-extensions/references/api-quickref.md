# Pi Extensions API 快速参考

## ExtensionAPI

### 事件

```typescript
pi.on("session_start", handler)
pi.on("session_shutdown", handler)
pi.on("session_before_switch", handler)
pi.on("session_switch", handler)
pi.on("session_before_fork", handler)
pi.on("session_fork", handler)
pi.on("session_before_compact", handler)
pi.on("session_compact", handler)
pi.on("session_before_tree", handler)
pi.on("session_tree", handler)
pi.on("before_agent_start", handler)
pi.on("agent_start", handler)
pi.on("agent_end", handler)
pi.on("turn_start", handler)
pi.on("turn_end", handler)
pi.on("context", handler)
pi.on("tool_call", handler)
pi.on("tool_result", handler)
pi.on("input", handler)
pi.on("user_bash", handler)
pi.on("model_select", handler)
```

### 注册方法

```typescript
pi.registerTool(definition)
pi.registerCommand(name, options)
pi.registerShortcut(key, options)
pi.registerFlag(name, options)
pi.registerMessageRenderer(customType, renderer)
pi.registerProvider(name, config)
```

### 消息和状态

```typescript
pi.sendMessage(message, options)
pi.sendUserMessage(content, options)
pi.appendEntry(customType, data)
pi.setSessionName(name)
pi.getSessionName()
pi.setLabel(entryId, label)
```

### 工具管理

```typescript
pi.getActiveTools()
pi.getAllTools()
pi.setActiveTools(names)
```

### 其他

```typescript
pi.exec(command, args, options)
pi.getFlag(name)
pi.getCommands()
pi.setModel(model)
pi.getThinkingLevel()
pi.setThinkingLevel(level)
pi.events.on(event, handler)
pi.events.emit(event, data)
```

## ExtensionContext

### UI 方法

```typescript
ctx.ui.select(title, options)
ctx.ui.confirm(title, message, options?)
ctx.ui.input(title, placeholder?)
ctx.ui.editor(title, text?)
ctx.ui.custom(factory, options?)
ctx.ui.notify(message, type)
ctx.ui.setStatus(id, text?)
ctx.ui.setWidget(id, content, options?)
ctx.ui.setWorkingMessage(text?)
ctx.ui.setEditorText(text)
ctx.ui.getEditorText()
ctx.ui.getToolsExpanded()
ctx.ui.setToolsExpanded(expanded)
ctx.ui.setTitle(title)
ctx.ui.setFooter(renderer?)
ctx.ui.setEditorComponent(factory?)
ctx.ui.setTheme(nameOrTheme)
```

### 属性

```typescript
ctx.hasUI           // boolean
ctx.cwd            // string
ctx.sessionManager // SessionManager
ctx.modelRegistry  // ModelRegistry
ctx.model          // Model | undefined
```

### 方法

```typescript
ctx.isIdle()
ctx.abort()
ctx.hasPendingMessages()
ctx.shutdown()
ctx.getContextUsage()
ctx.compact(options)
ctx.getSystemPrompt()
```

## ExtensionCommandContext

继承 ExtensionContext，额外提供：

```typescript
ctx.waitForIdle()
ctx.newSession(options?)
ctx.fork(entryId)
ctx.navigateTree(targetId, options?)
```

## 类型定义

### ToolDefinition

```typescript
{
  name: string;
  label: string;
  description: string;
  parameters: TObject; // TypeBox
  execute: (toolCallId, params, signal, onUpdate, ctx) => Promise<ToolResult>;
  renderCall?: (args, theme) => Component;
  renderResult?: (result, options, theme) => Component;
}
```

### CommandOptions

```typescript
{
  description: string;
  getArgumentCompletions?: (prefix) => AutocompleteItem[] | null;
  handler: (args, ctx) => Promise<void>;
}
```

### Event Handlers

```typescript
// session_before_switch
(event: { reason: "new" | "resume"; targetSessionFile?: string }, ctx) =>
  { cancel?: boolean } | void

// before_agent_start
(event: { prompt; images; systemPrompt }, ctx) =>
  { message?; systemPrompt? } | void

// tool_call
(event: { toolName; toolCallId; input }, ctx) =>
  { block: true; reason } | void

// input
(event: { text; images; source }, ctx) =>
  { action: "continue" | "transform" | "handled"; text? } | void
```

## 工具结果类型

```typescript
interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
}
```

## 常用导入

```typescript
// 核心类型
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// 类型守卫
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";

// 截断工具
import {
  truncateHead,
  truncateTail,
  formatSize,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
} from "@mariozechner/pi-coding-agent";

// TUI 组件
import { Text, Container, Editor, matchesKey, Key } from "@mariozechner/pi-tui";

// TypeBox
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
```
