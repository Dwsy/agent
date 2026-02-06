---
name: pi-extensions
description: 创建 pi 编码 Agent 扩展的完整指南。当用户需要创建 pi 扩展（Extensions）时使用，支持工具（Tools）、命令（Commands）、事件处理器（Event Handlers）和自定义 UI 组件的开发。通过读取 assets/templates/ 中的模板文件，根据用户需求生成扩展代码。
---

# Pi Extensions 技能

帮助用户创建 pi 编码 Agent 的 TypeScript 扩展。

## 扩展能做什么

Pi 扩展可以 hook 进 Agent 的整个生命周期，实现以下能力：

### 1. 自定义工具（Tools）
- **功能**：让 LLM 可以调用自定义功能
- **能力**：
  - 执行任意代码逻辑（文件处理、API 调用、计算等）
  - 流式更新进度（`onUpdate`）
  - 自定义 TUI 渲染（`renderCall`, `renderResult`）
  - 覆盖内置工具（如替换 `read`, `bash`）
  - 远程执行（SSH、容器等）

### 2. 自定义命令（Commands）
- **功能**：用户通过 `/command` 触发
- **能力**：
  - 执行任意操作
  - 参数自动补全
  - 调用 UI 对话框
  - 修改会话状态

### 3. 事件拦截与处理
- **工具调用拦截**（`tool_call`）：
  - 阻止危险命令（`rm -rf`, `sudo` 等）
  - 敏感路径保护（`.env`, `secrets.json` 等）
  - 记录工具使用日志
  - 修改工具参数

- **工具结果修改**（`tool_result`）：
  - 修改执行结果
  - 添加额外信息
  - 格式化输出

- **输入处理**（`input`）：
  - 快捷指令转换（如 `?quick` → 简洁模式）
  - 直接处理特定输入（无需 LLM）
  - 输入预处理

- **Agent 生命周期**：
  - `before_agent_start`：注入消息、修改系统提示
  - `agent_start/end`：追踪 Agent 执行
  - `turn_start/end`：追踪单次 LLM 调用
  - `context`：修改发送给 LLM 的消息列表

- **会话管理**：
  - `session_start/shutdown`：初始化和清理
  - `session_before_switch/switch`：切换会话时保存/恢复状态
  - `session_before_fork/fork`：分叉会话处理
  - `session_before_compact/compact`：自定义压缩逻辑
  - `session_before_tree/tree`：树导航处理

- **模型切换**（`model_select`）：
  - 模型切换时更新 UI
  - 模型特定初始化

### 4. 用户交互（UI）
- **对话框**：
  - `select`：列表选择
  - `confirm`：确认框（支持超时）
  - `input`：单行输入
  - `editor`：多行编辑器
  - `custom`：完全自定义的 TUI 组件

- **状态显示**：
  - `notify`：通知气泡
  - `setStatus`：底部状态栏
  - `setWidget`：编辑器上方/下方控件
  - `setWorkingMessage`：Agent 思考时的提示
  - `setEditorText`：预填充编辑器内容

- **界面定制**：
  - `setFooter`：自定义底部栏
  - `setTitle`：终端标题
  - `setTheme`：切换主题
  - `setEditorComponent`：自定义编辑器（如 Vim 模式）

### 5. 状态管理
- **持久化状态**（`appendEntry`）：
  - 保存任意数据到会话文件
  - 支持分支导航时恢复状态
  - 不占用 LLM 上下文

- **工具结果状态**（`details`）：
  - 在工具结果中存储数据
  - 支持分叉后重建状态

### 6. 其他高级功能
- **发送消息**（`sendMessage`, `sendUserMessage`）：
  - 向会话注入消息
  - 触发 LLM 响应
  - 支持 steer/followUp/nextTurn 模式

- **工具管理**（`setActiveTools`）：
  - 动态启用/禁用工具
  - 创建只读模式等场景

- **模型控制**（`setModel`, `setThinkingLevel`）：
  - 切换模型
  - 调整思考级别

- **注册 Provider**（`registerProvider`）：
  - 添加自定义模型提供商
  - 支持代理、OAuth

- **快捷键**（`registerShortcut`）：
  - 绑定键盘快捷键

- **CLI 参数**（`registerFlag`）：
  - 添加自定义命令行参数

## 工作流程

当用户想要创建扩展时：

1. **确定类型** - 询问用户需要什么类型的扩展
2. **读取模板** - 从 `assets/templates/` 读取对应模板
3. **收集需求** - 通过 `question` 工具询问具体参数
4. **生成代码** - 基于模板修改并输出完整扩展
5. **部署指导** - 告知用户如何测试和部署

## 扩展类型选择

| 类型 | 用途 | 模板文件 | 适用场景 |
|-----|------|---------|---------|
| **Tool** | LLM 可调用的功能 | `tool.ts` | 文件处理、API 调用、数据查询 |
| **Command** | 用户触发的斜杠命令 | `command.ts` | `/deploy`, `/summary`, `/stats` |
| **Event Handler** | 响应生命周期事件 | `event-handler.ts` | 权限检查、日志记录、状态保存 |
| **Custom UI** | 自定义交互界面 | `custom-ui.ts` | 选择器、表单、游戏、仪表盘 |
| **Full** | 综合示例 | `full-extension.ts` | 需要组合多种功能时参考 |

## 核心 API

### 扩展入口

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 注册工具、命令、事件监听
}
```

### 注册工具

```typescript
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "工具功能描述（LLM 可见）",
  parameters: Type.Object({
    action: StringEnum(["list", "add", "delete"] as const),
    name: Type.Optional(Type.String()),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 执行逻辑
    return {
      content: [{ type: "text", text: "结果" }],
      details: { /* 额外数据 */ },
    };
  },

  // 可选：自定义渲染
  renderCall(args, theme) { /* ... */ },
  renderResult(result, options, theme) { /* ... */ },
});
```

### 注册命令

```typescript
pi.registerCommand("mycommand", {
  description: "命令描述",
  getArgumentCompletions: (prefix) => {
    // 返回自动补全项
    return [{ value: "option1", label: "选项1" }];
  },
  handler: async (args, ctx) => {
    ctx.ui.notify(`执行: ${args}`, "info");
  },
});
```

### 事件监听

```typescript
// 会话事件
pi.on("session_start", async (_event, ctx) => { });
pi.on("session_shutdown", async (_event, ctx) => { });

// Agent 事件
pi.on("before_agent_start", async (event, ctx) => {
  return {
    message: { customType: "my-ext", content: "上下文", display: true },
    systemPrompt: event.systemPrompt + "\n额外指令",
  };
});

// 工具事件（可拦截）
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
    const ok = await ctx.ui.confirm("危险!", "允许删除?");
    if (!ok) return { block: true, reason: "用户拒绝" };
  }
});

// 输入事件（可转换）
pi.on("input", async (event, ctx) => {
  if (event.text.startsWith("?quick ")) {
    return { action: "transform", text: `简洁回答: ${event.text.slice(7)}` };
  }
  return { action: "continue" };
});
```

## 用户交互

### 对话框

```typescript
const choice = await ctx.ui.select("选择:", ["A", "B", "C"]);
const ok = await ctx.ui.confirm("删除?", "此操作不可撤销");
const name = await ctx.ui.input("名称:", "占位符");
const text = await ctx.ui.editor("编辑:", "预设文本");
```

### 自定义组件

```typescript
import { Text } from "@mariozechner/pi-tui";

const result = await ctx.ui.custom((tui, theme, keybindings, done) => {
  return {
    render(width) {
      return [theme.fg("accent", "自定义界面")];
    },
    invalidate() {},
    handleInput(data) {
      if (data === "return") done("结果");
    },
  };
});
```

### 状态与控件

```typescript
ctx.ui.notify("完成!", "success");  // info | warning | error
ctx.ui.setStatus("my-ext", "处理中...");
ctx.ui.setWidget("my-widget", ["行1", "行2"]);
ctx.ui.setWorkingMessage("思考中...");
ctx.ui.setEditorText("预设文本");
```

## 状态管理

### 持久化状态

```typescript
// 保存状态（不参与 LLM 上下文）
pi.appendEntry("my-state", { count: 42 });

// 恢复状态
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "my-state") {
      const data = entry.data as MyState;
      // 恢复...
    }
  }
});
```

### 工具结果状态

```typescript
// 在 details 中存储状态，支持分支恢复
return {
  content: [{ type: "text", text: "结果" }],
  details: { items: [...items] },
};
```

## 文件位置

| 范围 | 路径 |
|-----|------|
| 全局 | `~/.pi/agent/extensions/*.ts` |
| 全局（子目录） | `~/.pi/agent/extensions/*/index.ts` |
| 项目本地 | `.pi/extensions/*.ts` |
| 项目本地（子目录） | `.pi/extensions/*/index.ts` |

测试扩展：`pi -e ./my-extension.ts`

## 可用导入

| 包 | 用途 |
|---|------|
| `@mariozechner/pi-coding-agent` | 扩展 API、事件类型、工具类型 |
| `@sinclair/typebox` | 工具参数模式定义 |
| `@mariozechner/pi-ai` | AI 工具（StringEnum 等） |
| `@mariozechner/pi-tui` | TUI 组件（Text、Editor 等） |

## 模板资源

- `assets/templates/tool.ts` - 基础工具模板
- `assets/templates/command.ts` - 基础命令模板
- `assets/templates/event-handler.ts` - 事件处理器模板
- `assets/templates/custom-ui.ts` - 自定义 UI 模板
- `assets/templates/full-extension.ts` - 完整扩展示例

## 设计模式

### Ask 模式（交互式问答）

适用于需要收集用户需求后生成扩展的场景：

1. 询问扩展类型（工具/命令/事件/UI）
2. 询问功能需求
3. 询问参数/选项
4. 生成代码

### 输出截断

```typescript
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";

const truncation = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
});
```

### 类型守卫

```typescript
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";

if (isToolCallEventType("bash", event)) {
  // event.input 类型为 { command: string; timeout?: number }
}
```

## 测试扩展

```bash
# 交互模式测试
pi -e ./my-extension.ts

# 带参数测试
pi -e ./my-extension.ts -- --my-flag
```

## 进阶参考

详见 `references/` 目录：
- `events.md` - 完整事件列表
- `ui-components.md` - UI 组件详解
- `examples.md` - 更多代码示例
