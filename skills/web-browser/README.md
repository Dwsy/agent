# Web Browser Skill

基于 agent-browser 的浏览器自动化技能，支持完整的网页交互、表单填写、屏幕截图、数据提取等功能。

## 功能特性

- **完整浏览器自动化**：导航、点击、输入、滚动等所有基本操作
- **CDP 模式**：连接到现有浏览器（Electron、Chrome、WebView2 等）
- **AI 友好**：通过 refs (@e1, @e2) 和 JSON 输出与 AI 无缝集成
- **会话管理**：支持并行浏览器会话
- **调试支持**：可视化浏览器窗口、控制台日志、错误追踪

## 依赖

```bash
npm install -g agent-browser
```

或使用 npx（无需安装）：

```bash
npx agent-browser --help
```

## 使用方式

### 通过 pi 自动调用

pi 会自动调用此技能进行浏览器自动化操作。

### 手动执行

```bash
# 直接使用 agent-browser
agent-browser open <url>
agent-browser snapshot -i
agent-browser click @e1
```

## 核心概念

### Refs 引用系统

`snapshot -i` 命令会为每个可交互元素分配唯一的 ref（如 @e1, @e2）：

```
button "Submit" [ref=e3]
textbox "Email" [ref=e1]
```

后续操作使用 ref 定位元素，无需复杂的 CSS 选择器。

### 语义定位器

除了 refs，也可以使用语义定位器：

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
```

### CDP 模式

连接到已运行的浏览器实例：

```bash
# 启动 Chrome 时启用远程调试
google-chrome --remote-debugging-port=9222

# 连接到该浏览器
agent-browser --cdp 9222 snapshot
```

## 典型工作流

1. **导航**：`agent-browser open <url>`
2. **分析**：`agent-browser snapshot -i` 获取元素 refs
3. **交互**：使用 refs 执行操作（click, fill 等）
4. **验证**：`agent-browser snapshot -i` 检查页面状态
5. **关闭**：`agent-browser close`

## 高级功能

### 状态保存/加载

```bash
# 保存登录状态
agent-browser state save auth.json

# 后续会话加载状态
agent-browser state load auth.json
```

### 网络拦截

```bash
# 拦截 API 响应
agent-browser network route "*/api/**" --body '{"data": "mocked"}'

# 查看请求历史
agent-browser network requests
```

### JavaScript 执行

```bash
agent-browser eval "document.title"
```

## 许可证

MIT License
