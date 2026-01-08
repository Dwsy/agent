# Web Browser Skill 使用指南

## 概述

Web Browser Skill 通过 Chrome DevTools Protocol (CDP) 控制 Chrome/Chromium 浏览器，支持页面导航、JavaScript 执行、截图、元素选择等功能。

## 快速开始

### 1. 启动浏览器

```bash
cd ~/.pi/agent/skills/web-browser

# 使用全新配置文件
pnpm start

# 使用你的 Chrome 配置文件（包含 cookies、登录信息）
pnpm start --profile
```

浏览器将在 `:9222` 端口启动，支持远程调试。

### 2. 页面导航

```bash
# 在当前标签页导航
pnpm nav https://example.com

# 在新标签页打开
pnpm nav https://example.com --new
```

### 3. 执行 JavaScript

```bash
# 获取页面标题
pnpm eval 'document.title'

# 统计链接数量
pnpm eval 'document.querySelectorAll("a").length'

# 提取链接信息
pnpm eval 'JSON.stringify(Array.from(document.querySelectorAll("a")).map(a => ({ text: a.textContent.trim(), href: a.href })))'
```

### 4. 截图

```bash
# 截取当前视口
pnpm screenshot
# 返回临时文件路径
```

### 5. 交互式元素选择

```bash
# 启动元素选择器
pnpm pick "Click the submit button"
```

操作方式：
- 单击选择元素
- Cmd/Ctrl+Click 多选
- Enter 完成选择

## 技术细节

### 依赖

- `puppeteer-core`: Chrome DevTools Protocol 客户端
- `chrome-remote-interface`: CDP 接口

### 浏览器配置

- 端口：`9222`
- 用户数据目录：`~/.cache/scraping`
- 配置文件：`Default`

## 常见场景

### 网页抓取

```bash
# 启动浏览器
pnpm start

# 导航到目标页面
pnpm nav https://example.com

# 提取数据
pnpm eval 'JSON.stringify([...document.querySelectorAll(".item")].map(el => el.textContent))'
```

### 表单填写

```bash
# 导航到表单页面
pnpm nav https://example.com/form

# 填写表单
pnpm eval 'document.querySelector("#name").value = "John Doe"'

# 提交表单
pnpm eval 'document.querySelector("form").submit()'
```

### 页面交互

```bash
# 点击按钮
pnpm eval 'document.querySelector("#submit").click()'

# 等待元素出现
pnpm eval 'new Promise(r => setInterval(() => { if(document.querySelector(".loaded")) r(); }, 100))'

# 截图验证
pnpm screenshot
```

## 注意事项

1. **字符串转义**：使用单引号包裹 JavaScript 代码，避免转义问题
2. **异步操作**：所有执行都在异步上下文中，可以直接使用 async/await
3. **浏览器状态**：每次启动会重置浏览器状态，除非使用 `--profile`
4. **端口占用**：确保 `:9222` 端口未被占用

## 故障排查

### 无法连接到 Chrome

```bash
# 检查 Chrome 是否运行
ps aux | grep "Google Chrome"

# 检查端口是否监听
lsof -i :9222

# 重启浏览器
killall "Google Chrome"
pnpm start
```

### JavaScript 执行失败

- 检查语法是否正确
- 确认页面已加载完成
- 使用 `try-catch` 捕获错误

```bash
pnpm eval 'try { document.querySelector("#missing").value } catch(e) { e.message }'
```