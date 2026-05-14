# Contributing to pi-tui-kit

感谢您对 pi-tui-kit 的兴趣！本指南将帮助您开始贡献。

## 开发环境设置

### 前置要求

- Node.js >= 18.0.0
- TypeScript >= 5.0
- Vitest (用于测试)

### 安装依赖

```bash
cd ~/.pi/agent/extensions/pi-tui-kit
# 如果使用 npm
npm install

# 如果使用 pnpm
pnpm install
```

## 项目结构

```
pi-tui-kit/
├── src/
│   ├── core/           # 核心布局组件
│   │   ├── Box.ts     # 容器盒子
│   │   ├── Flex.ts    # Flexbox 布局
│   │   ├── Stack.ts   # 堆叠/覆盖层
│   │   ├── Text.ts    # 文本组件
│   │   ├── Spacer.ts  # 空白间隔
│   │   └── Segment.ts # Powerline 状态栏段
│   ├── widgets/       # UI 组件
│   │   ├── Panel.ts   # 面板
│   │   ├── Button.ts  # 按钮
│   │   ├── List.ts    # 列表
│   │   ├── Input.ts   # 输入框
│   │   ├── Dialog.ts  # 对话框
│   │   ├── Tabs.ts    # 标签页
│   │   ├── Tree.ts    # 树形控件
│   │   ├── Table.ts   # 表格
│   │   ├── ProgressBar.ts    # 进度条
│   │   ├── Modal.ts   # 模态框
│   │   └── Toast.ts   # 提示消息
│   ├── hooks/         # React 风格的 hooks
│   │   ├── useState.ts
│   │   ├── useSelect.ts
│   │   ├── useFocus.ts
│   │   └── useInput.ts
│   ├── utils/         # 工具函数
│   │   ├── text.ts    # 文本处理 (ANSI-aware)
│   │   ├── border.ts  # 边框样式
│   │   └── style.ts   # 主题/颜色
│   ├── examples/      # 示例组件
│   └── index.ts       # 主入口
├── test/              # 测试文件
└── examples/          # 演示脚本
```

## 开发流程

### 1. 创建分支

```bash
git checkout -b feature/your-feature-name
```

### 2. 编写代码

#### 组件开发规范

每个组件应遵循以下结构：

```typescript
/**
 * 组件简短描述
 * 
 * 详细描述组件功能和使用场景
 */
import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { safeLine } from "../utils/text.js";

export interface ComponentOptions {
  // 必需选项
  requiredProp: string;
  // 可选选项，带默认值
  optionalProp?: boolean;
}

export class ComponentName implements Component {
  private requiredProp: string;
  private optionalProp: boolean;

  constructor(options: ComponentOptions) {
    this.requiredProp = options.requiredProp;
    this.optionalProp = options.optionalProp ?? false;
  }

  render(width: number): string[] {
    // 确保返回的行严格符合 width
    // 使用 safeLine 工具处理
    return [safeLine("content", width)];
  }

  invalidate(): void {
    // 清理缓存（如果有）
  }
}
```

#### Focusable 组件

如果组件需要支持键盘交互，实现 `Focusable` 接口：

```typescript
import type { Component, Focusable } from "@earendil-works/pi-tui";

export class InteractiveComponent implements Component, Focusable {
  private _focused = false;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  handleInput(data: string): void {
    // 处理键盘输入
    switch (data) {
      case "up":
        // 处理向上
        break;
      case "down":
        // 处理向下
        break;
      case "\r":
        // 处理回车
        break;
    }
  }

  // ... render, invalidate
}
```

#### 宽度安全

**最重要的规则**：所有渲染输出必须严格遵守传入的 `width` 参数。

```typescript
render(width: number): string[] {
  // ✅ 正确：使用工具确保宽度安全
  return [safeLine(content, width)];
  
  // ❌ 错误：可能超出宽度
  return [content];
}
```

使用工具函数：
- `safeLine(line, width)` - 填充或截断到精确宽度
- `truncateToWidth(line, width)` - 截断到宽度
- `visibleWidth(line)` - 计算可见宽度（忽略 ANSI）
- `center/rightAlign/leftAlign` - 对齐文本

### 3. 添加测试

在 `test/component.test.ts` 或创建新测试文件：

```typescript
describe("YourComponent", () => {
  it("renders correctly", () => {
    const comp = new YourComponent({ prop: "value" });
    const lines = comp.render(20);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("expected content");
  });

  it("handles edge cases", () => {
    // 测试宽度为 0
    const lines = comp.render(0);
    // 测试超长内容
    const lines = comp.render(5);
    // ...
  });
});
```

### 4. 运行测试

```bash
# 运行所有测试
npm test

# 运行并观察
npm run test:watch

# 类型检查
npm run typecheck

# 带覆盖率报告
npm run test:coverage
```

### 5. 更新文档

- 在 `README.md` 中添加组件使用示例
- 更新 `CHANGELOG.md` 记录变更

## 代码风格

### TypeScript 规范

- 使用严格的 TypeScript 配置
- 显式类型声明优于推断
- 接口使用 `PascalCase`，带 `Options` 后缀
- 私有属性使用 `private` 修饰符

### 命名规范

```typescript
// 类名: PascalCase
export class Button {}
export class Panel {}

// 接口名: PascalCase + Options/Config
export interface ButtonOptions {}
export interface PanelOptions {}

// 枚举/类型: PascalCase + 描述性后缀
export type FlexDirection = "row" | "column";
export type ProgressStyle = "bar" | "dots" | "spinner";

// 常量: SCREAMING_SNAKE_CASE
const DEFAULT_MAX_VISIBLE = 10;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸"];
```

### 导入顺序

1. 外部库 (pi-tui, typebox 等)
2. 工具模块
3. 相关组件

```typescript
import type { Component, Focusable } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";

import { safeLine, center } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";

import { Button } from "./Button.js";
```

## 主题系统

### 使用现有主题

```typescript
import { DefaultTheme, NoColorTheme, createTheme } from "pi-tui-kit";

// 默认彩色主题
const panel = new Panel({ theme: DefaultTheme });

// 无颜色主题（用于不支持颜色的终端）
const panel = new Panel({ theme: NoColorTheme });
```

### 创建新主题

```typescript
const myTheme = createTheme({
  // 覆盖特定颜色
  accent: (text) => `${ansi.brightCyan}${text}${ansi.reset}`,
  success: (text) => `${ansi.green}${text}${ansi.reset}`,
});
```

### 语义化颜色

始终使用语义化颜色名称，而非直接颜色：

```typescript
// ✅ 正确
const button = new Button({ 
  accentColor: theme.primary 
});

// ❌ 错误
const button = new Button({ 
  accentColor: (t) => `\x1b[34m${t}\x1b[0m` // 硬编码蓝色
});
```

## 提交规范

提交信息格式：

```
<type>(<scope>): <subject>

<body>
```

类型：
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档更新
- `test`: 测试相关
- `refactor`: 重构
- `style`: 代码格式
- `chore`: 构建/工具

示例：

```
feat(Button): 添加 disabled 状态

- 添加 disabled 属性
- 禁用时不响应点击事件
- 视觉样式变为灰色
```

## 发布流程

1. 更新 `CHANGELOG.md`
2. 更新 `package.json` 版本号
3. 创建 git tag
4. 推送变更

```bash
npm version patch  # or minor/major
git push --follow-tags
```

## 常见问题

### Q: 为什么渲染行数超出？

确保你的 `render` 方法计算正确：

```typescript
render(width: number): string[] {
  const lines: string[] = [];
  
  // 添加内容行
  for (const child of this.children) {
    const childLines = child.render(innerWidth);
    lines.push(...childLines);
  }
  
  // 添加边框行
  lines.unshift(topBorder);
  lines.push(bottomBorder);
  
  return lines;
}
```

### Q: 如何处理 ANSI 颜色代码的宽度？

使用 `visibleWidth` 而非 `String.length`：

```typescript
// ✅ 正确：计算可见宽度
const actualWidth = visibleWidth(textWithColors);

// ❌ 错误：包含 ANSI 字符
const wrongWidth = textWithColors.length;
```

### Q: 如何调试渲染问题？

在测试中可视化输出：

```typescript
const lines = component.render(40);
console.log(lines.join("\n"));
console.log("Line count:", lines.length);
console.log("Widths:", lines.map(l => visibleWidth(l)));
```

## 获取帮助

- 查看现有组件的实现作为参考
- 运行测试了解预期行为
- 阅读 `README.md` 获取使用示例

## License

贡献代码将被视为 MIT 许可证授权。
