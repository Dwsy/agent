# Pi 扩展开发速查笔记

> 基于对 `loop.ts` 及官方文档（extensions.md / sdk.md）的理解整理。

---

## 一、核心对象速查

| 对象 | 作用 | 常用场景 |
|------|------|----------|
| `ExtensionAPI` (pi) | 扩展的"能力接口" | `pi.on()`, `pi.registerTool()`, `pi.registerCommand()`, `pi.sendMessage()` |
| `ExtensionContext` (ctx) | 运行时上下文 | `ctx.ui.notify()`, `ctx.sessionManager`, `ctx.model`, `ctx.signal`, `ctx.cwd` |
| `SessionSwitchEvent` | 会话切换事件 | `session_switch`, `session_before_switch` 事件的参数类型 |

---

## 二、常用事件（pi.on）

### 会话生命周期
- `session_start` — 会话启动/恢复/重载时触发，适合恢复状态
- `session_switch` — 切换会话时触发
- `session_shutdown` — 退出时清理
- `session_before_compact` — 压缩前，可自定义压缩指令或取消

### Agent 生命周期
- `before_agent_start` — 用户提交 prompt 后、Agent 开始前，可注入 system prompt
- `agent_start` / `agent_end` — Agent 开始/结束处理
- `turn_start` / `turn_end` — 单次 LLM 响应+工具调用的回合

### 工具拦截
- `tool_call` — 工具执行前，**可拦截/修改参数**
- `tool_result` — 工具执行后，**可修改结果**

### 输入处理
- `input` — 用户输入后、skill 展开前，可转换或拦截

---

## 三、状态持久化模式（核心设计模式）

### 推荐做法：appendEntry + sessionManager 恢复

```typescript
const MY_STATE_ENTRY = "my-state";

// 1. 保存状态
pi.appendEntry(MY_STATE_ENTRY, { count: 42 });

// 2. 恢复状态（在 session_start 中）
pi.on("session_start", async (_event, ctx) => {
  for (let i = ctx.sessionManager.getEntries().length - 1; i >= 0; i--) {
    const entry = ctx.sessionManager.getEntries()[i];
    if (entry.type === "custom" && entry.customType === MY_STATE_ENTRY) {
      myState = entry.data;
      break;
    }
  }
});
```

**为什么倒序查找？** 因为状态变更是 append-only 的，最新的 entry 在最后。

---

## 四、registerCommand vs registerTool

| 特性 | Command | Tool |
|------|---------|------|
| 调用者 | **用户**输入 `/cmd` | **LLM**自动调用 |
| 参数 | 原始字符串 `args` | TypeBox schema 定义的结构化参数 |
| 返回值 | 无（直接操作 UI/发送消息） | 必须返回 `{ content, details }` |
| 注册方式 | `pi.registerCommand("name", { handler })` | `pi.registerTool({ name, parameters, execute })` |
| 典型用途 | 快捷命令、系统操作 | 文件读写、代码执行、外部 API |

---

## 五、TUI 交互速查

### 基础通知
```typescript
ctx.ui.notify("Hello", "info");   // info | warning | error | success
ctx.ui.setStatus("my-key", "text"); // 底部状态栏
ctx.ui.setWidget("my-key", ["Line1", "Line2"]); // 编辑器上方 widget
```

### 简单对话框
```typescript
const ok = await ctx.ui.confirm("Title", "Are you sure?");
const input = await ctx.ui.input("Label", "default");
const choice = await ctx.ui.select("Pick:", ["A", "B", "C"]);
```

### 自定义 TUI（复杂交互）
```typescript
import { Container, SelectList, Text } from "@mariozechner/pi-tui";

const result = await ctx.ui.custom<string>((tui, theme, kb, done) => {
  const container = new Container();
  container.addChild(new Text(theme.fg("accent", "Hello")));

  return {
    render(width) { return container.render(width); },
    invalidate() { container.invalidate(); },
    handleInput(data) {
      if (data === "q") done("quit");
    },
  };
});
```

---

## 六、发送消息的三种方式

### 1. 发送自定义消息（不触发 turn）
```typescript
pi.sendMessage({ customType: "x", content: "...", display: true });
```

### 2. 发送消息并触发 LLM 响应
```typescript
pi.sendMessage(
  { customType: "x", content: "...", display: true },
  { triggerTurn: true, deliverAs: "followUp" }
);
```

### 3. 模拟用户发送消息
```typescript
pi.sendUserMessage("继续", { deliverAs: "followUp" });
```

**`deliverAs` 区别：**
- `"steer"` — 当前 turn 结束后立即交付
- `"followUp"` — Agent 完全空闲后交付
- `"nextTurn"` — 排队到下一次用户 prompt

---

## 七、计划模式（Plan Mode）设计模式

从 `loop.ts` 学到的子任务驱动循环模式：

```typescript
// 1. 定义任务结构
type Task = { id: number; description: string; criteria: string[]; passes: boolean };

// 2. 提交计划工具
pi.registerTool({
  name: "submit_plan",
  parameters: Type.Object({
    tasks: Type.Array(Type.Object({
      description: Type.String(),
      criteria: Type.Array(Type.String()),
    })),
  }),
  async execute(_id, params, _sig, _upd, ctx) {
    tasks = params.tasks.map((t, i) => ({ id: i + 1, ...t, passes: false }));
    currentTaskIndex = 0;
    // 更新 prompt 进入执行阶段
    return { content: [{ type: "text", text: "Plan submitted" }] };
  },
});

// 3. 推进任务
pi.registerTool({
  name: "mark_task_done",
  parameters: Type.Object({}),
  async execute() {
    tasks[currentTaskIndex].passes = true;
    currentTaskIndex++;
    if (currentTaskIndex >= tasks.length) {
      // 全部完成，结束循环
    }
    // 否则更新 prompt 进入下一个任务
  },
});
```

---

## 八、调试技巧

### 1. 快速测试扩展
```bash
pi -e ./my-extension.ts
```

### 2. 热重载
扩展放在 `~/.pi/agent/extensions/` 或 `.pi/extensions/` 后，在 pi 内输入：
```
/reload
```

### 3. RPC 模式跳过 TUI
很多扩展会在 RPC 模式直接 `return`，避免 TUI 报错：
```typescript
if (process.argv.includes("--mode") && process.argv.includes("rpc")) return;
```

### 4. 检查类型错误
```bash
cd ~/.pi/agent/extensions && npx tsc --noEmit my-extension.ts
```

### 5. 查看 session entries
在扩展中打印会话结构：
```typescript
console.log(JSON.stringify(ctx.sessionManager.getEntries(), null, 2));
```

---

## 九、常用导入清单

```typescript
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Text } from "@mariozechner/pi-tui";
```

---

## 十、黄金规则

1. **状态持久化用 `appendEntry`**，不要只存内存变量
2. **TUI 组件判断 `ctx.hasUI`**，RPC/print 模式要降级
3. **长时间操作用 `ctx.signal`**，支持中断取消
4. **修改文件的工具用 `withFileMutationQueue`**，避免并行冲突
5. **Command 是人用的，Tool 是 LLM 用的**，不要混用
