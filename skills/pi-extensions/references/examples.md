# Pi Extensions 代码示例

## 工具示例

### 基础工具

```typescript
pi.registerTool({
  name: "greet",
  label: "Greet",
  description: "问候某人",
  parameters: Type.Object({
    name: Type.String({ description: "名称" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    return {
      content: [{ type: "text", text: `Hello, ${params.name}!` }],
      details: { greeted: params.name },
    };
  },
});
```

### 带流式更新的工具

```typescript
pi.registerTool({
  name: "long_task",
  label: "Long Task",
  description: "长时间运行的任务",
  parameters: Type.Object({ steps: Type.Number() }),

  async execute(_toolCallId, params, signal, onUpdate, _ctx) {
    for (let i = 0; i < params.steps; i++) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "已取消" }] };
      }

      onUpdate?.({
        content: [{ type: "text", text: `步骤 ${i + 1}/${params.steps}...` }],
        details: { progress: (i + 1) / params.steps * 100 },
      });

      await new Promise(r => setTimeout(r, 1000));
    }

    return {
      content: [{ type: "text", text: "完成!" }],
      details: { completed: true },
    };
  },
});
```

### 带自定义渲染的工具

```typescript
pi.registerTool({
  name: "process_files",
  label: "Process Files",
  description: "处理文件",
  parameters: Type.Object({ files: Type.Array(Type.String()) }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    return {
      content: [{ type: "text", text: `处理了 ${params.files.length} 个文件` }],
      details: { count: params.files.length, files: params.files },
    };
  },

  renderCall(args, theme) {
    return new Text(
      theme.fg("toolTitle", theme.bold("process_files ")) +
      theme.fg("muted", `${args.files?.length || 0} files`),
      0, 0
    );
  },

  renderResult(result, { expanded }, theme) {
    const details = result.details as { count: number } | undefined;
    let text = theme.fg("success", `✓ ${details?.count || 0} files`);

    if (expanded && details?.files) {
      text += "\n" + details.files.map(f => theme.fg("dim", `  ${f}`)).join("\n");
    }

    return new Text(text, 0, 0);
  },
});
```

## 命令示例

### 基础命令

```typescript
pi.registerCommand("hello", {
  description: "打招呼",
  handler: async (args, ctx) => {
    ctx.ui.notify(`Hello ${args || "world"}!`, "info");
  },
});
```

### 带参数补全的命令

```typescript
pi.registerCommand("deploy", {
  description: "部署到环境",
  getArgumentCompletions: (prefix) => {
    const envs = ["dev", "staging", "prod"];
    const items = envs.map(e => ({ value: e, label: e }));
    return items.filter(i => i.value.startsWith(prefix));
  },
  handler: async (args, ctx) => {
    ctx.ui.notify(`Deploying: ${args}`, "info");
  },
});
```

### 带自定义 UI 的命令

```typescript
pi.registerCommand("select", {
  description: "选择选项",
  handler: async (_args, ctx) => {
    const choice = await ctx.ui.select("选择:", ["A", "B", "C"]);
    ctx.ui.notify(`选择了: ${choice}`, "info");
  },
});
```

## 事件处理器示例

### 权限门

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (isToolCallEventType("bash", event)) {
    const cmd = event.input.command;

    if (cmd?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("危险!", `允许: ${cmd}?`);
      if (!ok) return { block: true, reason: "用户拒绝" };
    }
  }
});
```

### 路径保护

```typescript
pi.on("tool_call", async (event, ctx) => {
  const path = event.input.path;
  const protectedPaths = [".env", "secrets.json", "node_modules/"];

  if (protectedPaths.some(p => path?.includes(p))) {
    const ok = await ctx.ui.confirm("敏感路径!", `允许访问: ${path}?`);
    if (!ok) return { block: true, reason: "路径被保护" };
  }
});
```

### 输入转换

```typescript
pi.on("input", async (event, ctx) => {
  if (event.text.startsWith("!")) {
    return {
      action: "transform",
      text: `执行命令: ${event.text.slice(1)}`,
    };
  }
  return { action: "continue" };
});
```

## 状态管理示例

### 简单计数器

```typescript
export default function (pi: ExtensionAPI) {
  let count = 0;

  pi.on("session_start", async (_event, ctx) => {
    // 从会话恢复
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "counter") {
        count = (entry.data as { count: number }).count;
      }
    }
  });

  pi.registerTool({
    name: "counter",
    label: "Counter",
    description: "计数器工具",
    parameters: Type.Object({ action: StringEnum(["get", "increment", "reset"]) }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      switch (params.action) {
        case "increment": count++; break;
        case "reset": count = 0; break;
      }

      // 持久化
      pi.appendEntry("counter", { count });

      return {
        content: [{ type: "text", text: `Count: ${count}` }],
        details: { count },
      };
    },
  });
}
```

## 自定义 UI 示例

### 选择列表

```typescript
const result = await ctx.ui.custom((tui, theme, _kb, done) => {
  let selected = 0;
  const options = ["选项1", "选项2", "选项3"];

  function render(width: number): string[] {
    return options.map((opt, i) => {
      const prefix = i === selected ? theme.fg("accent", "> ") : "  ";
      const text = i === selected ? theme.fg("accent", opt) : opt;
      return prefix + text;
    });
  }

  function handleInput(data: string) {
    if (data === "up") selected = Math.max(0, selected - 1);
    if (data === "down") selected = Math.min(options.length - 1, selected + 1);
    if (data === "return") done(options[selected]);
    if (data === "escape") done(null);
    tui.requestRender();
  }

  return { render, invalidate: () => {}, handleInput };
});
```

### 加载器

```typescript
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

const result = await ctx.ui.custom((tui, theme, _kb, done) => {
  const loader = new BorderedLoader(tui, theme, "加载中...");

  loader.onAbort = () => done(null);

  // 异步工作
  doWork({ signal: loader.signal })
    .then(result => done(result))
    .catch(() => done(null));

  return loader;
});
```

### 设置列表

```typescript
import { SettingsList, getSettingsListTheme } from "@mariozechner/pi-tui";

const items = [
  { id: "opt1", label: "选项1", currentValue: "on", values: ["on", "off"] },
  { id: "opt2", label: "选项2", currentValue: "auto", values: ["auto", "manual"] },
];

await ctx.ui.custom((tui, theme, _kb, done) => {
  const settings = new SettingsList(
    items,
    10,
    getSettingsListTheme(),
    (id, value) => console.log(`${id} = ${value}`),
    () => done(undefined)
  );

  return {
    render: (w) => settings.render(w),
    invalidate: () => settings.invalidate(),
    handleInput: (d) => settings.handleInput?.(d),
  };
});
```

## 实用工具

### 输出截断

```typescript
import {
  truncateHead,
  truncateTail,
  formatSize,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
} from "@mariozechner/pi-coding-agent";

const result = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
});

if (result.truncated) {
  const msg = `[截断: ${result.outputLines}/${result.totalLines} 行 (${formatSize(result.outputBytes)}/${formatSize(result.totalBytes)})]`;
}
```

### 执行命令

```typescript
const result = await pi.exec("git", ["status"], { signal, timeout: 5000 });
// result.stdout, result.stderr, result.code, result.killed
```

### 获取上下文使用

```typescript
const usage = ctx.getContextUsage();
if (usage && usage.tokens > 100_000) {
  // 触发压缩或提醒
}
```

### 模型切换

```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-4");
if (model) {
  const success = await pi.setModel(model);
  if (!success) {
    ctx.ui.notify("无此模型的 API 密钥", "error");
  }
}
```
