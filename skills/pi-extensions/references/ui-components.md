# Pi Extensions UI 组件参考

## 对话框

### 选择器

```typescript
const choice = await ctx.ui.select("标题:", ["选项1", "选项2", "选项3"]);
// 返回选中的字符串，或 undefined（取消）
```

### 确认框

```typescript
const ok = await ctx.ui.confirm("标题", "消息内容");
// 返回 boolean

// 带超时
const confirmed = await ctx.ui.confirm("标题", "消息", { timeout: 5000 });

// 使用 AbortSignal
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
const confirmed = await ctx.ui.confirm("标题", "消息", { signal: controller.signal });
```

### 输入框

```typescript
const name = await ctx.ui.input("名称:", "占位符文本");
// 返回输入的字符串，或 undefined（取消）
```

### 编辑器

```typescript
const text = await ctx.ui.editor("编辑:", "预设文本");
// 返回编辑后的文本，或 undefined（取消）
```

### 自定义组件

```typescript
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

// 覆盖模式（浮层）
const result = await ctx.ui.custom(
  (tui, theme, keybindings, done) => new MyComponent({ onClose: done }),
  { overlay: true }
);
```

## 状态控件

### 通知

```typescript
ctx.ui.notify("消息", "info");      // 信息
ctx.ui.notify("警告", "warning");   // 警告
ctx.ui.notify("错误", "error");     // 错误
ctx.ui.notify("成功", "success");   // 成功
```

### 状态栏

```typescript
ctx.ui.setStatus("my-ext", "处理中...");
ctx.ui.setStatus("my-ext", undefined); // 清除
```

### 控件

```typescript
// 编辑器上方（默认）
ctx.ui.setWidget("my-widget", ["行1", "行2"]);

// 编辑器下方
ctx.ui.setWidget("my-widget", ["行1", "行2"], { placement: "belowEditor" });

// 自定义组件
ctx.ui.setWidget("my-widget", (tui, theme) => new Text(...));

// 清除
ctx.ui.setWidget("my-widget", undefined);
```

### 工作消息

```typescript
ctx.ui.setWorkingMessage("思考中...");
ctx.ui.setWorkingMessage(); // 恢复默认
```

### 编辑器文本

```typescript
ctx.ui.setEditorText("预设文本");
const current = ctx.ui.getEditorText();
```

### 工具展开

```typescript
const wasExpanded = ctx.ui.getToolsExpanded();
ctx.ui.setToolsExpanded(true);
```

### 终端标题

```typescript
ctx.ui.setTitle("pi - my-project");
```

### 自定义底部栏

```typescript
ctx.ui.setFooter((tui, theme) => ({
  render(width) {
    return [theme.fg("dim", "自定义底部")];
  },
  invalidate() {},
}));

ctx.ui.setFooter(undefined); // 恢复默认
```

### 自定义编辑器

```typescript
import { CustomEditor } from "@mariozechner/pi-coding-agent";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";

  handleInput(data: string): void {
    // 处理输入...
    super.handleInput(data); // 传递未处理的按键
  }
}

ctx.ui.setEditorComponent((tui, theme, keybindings) =>
  new VimEditor(theme, keybindings)
);

ctx.ui.setEditorComponent(undefined); // 恢复默认
```

## TUI 组件

### Text

```typescript
import { Text } from "@mariozechner/pi-tui";

new Text("内容", paddingX, paddingY);
```

### Container

```typescript
import { Container } from "@mariozechner/pi-tui";

const container = new Container();
container.addChild(component);
```

### Editor

```typescript
import { Editor } from "@mariozechner/pi-tui";

const editor = new Editor(tui, {
  borderColor: (s) => theme.fg("accent", s),
});

editor.onSubmit = (value) => console.log(value);
editor.setText("预设文本");
const lines = editor.render(width);
editor.handleInput(data);
```

### SettingsList

```typescript
import { SettingsList, getSettingsListTheme } from "@mariozechner/pi-tui";

const settingsList = new SettingsList(
  items,                    // SettingItem[]
  maxHeight,                // 最大高度
  getSettingsListTheme(),   // 主题
  onValueChange,            // (id, newValue) => void
  onClose,                  // () => void
  onNewItem                 // (text) => void（可选，用于添加新项）
);
```

### BorderedLoader

```typescript
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

const loader = new BorderedLoader(tui, theme, "加载中...");
loader.onAbort = () => done(null);
loader.signal // AbortSignal
```

## 键盘处理

```typescript
import { matchesKey, Key } from "@mariozechner/pi-tui";

if (matchesKey(data, Key.up)) { /* 上箭头 */ }
if (matchesKey(data, Key.down)) { /* 下箭头 */ }
if (matchesKey(data, Key.enter)) { /* 回车 */ }
if (matchesKey(data, Key.escape)) { /* ESC */ }
if (matchesKey(data, Key.tab)) { /* Tab */ }
```

## 主题颜色

```typescript
// 前景色
theme.fg("toolTitle", text)   // 工具名称
theme.fg("accent", text)      // 高亮
theme.fg("success", text)     // 成功（绿）
theme.fg("error", text)       // 错误（红）
theme.fg("warning", text)     // 警告（黄）
theme.fg("muted", text)       // 次要文本
theme.fg("dim", text)         // 第三级文本

// 样式
theme.bold(text)
theme.italic(text)
theme.strikethrough(text)
```

## 代码高亮

```typescript
import { highlightCode, getLanguageFromPath } from "@mariozechner/pi-coding-agent";

const highlighted = highlightCode(code, "typescript", theme);

const lang = getLanguageFromPath("/path/to/file.rs"); // "rust"
```
