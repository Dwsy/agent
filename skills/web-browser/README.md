# Web Browser Subagent

专业的网页浏览器代理，使用 Chrome DevTools Protocol (CDP) 进行网页交互、调研和自动化操作。

## 快速开始

### 测试子代理
```bash
cd ~/.pi/agent/skills/web-browser
node test-subagent.js
```

### 查看示例
```bash
cd ~/.pi/agent/skills/web-browser
node examples.js
```

### 运行演示
```bash
cd ~/.pi/agent/skills/web-browser
node demo.js
```

## 使用子代理

### 通过 subagent 命令
```bash
# 研究网页
subagent web-browser "Research https://example.com and extract key information"

# 抓取数据
subagent web-browser "Scrape all links from https://news.ycombinator.com"

# 需要登录的操作
subagent web-browser "Login to GitHub and extract repository information"
```

### 直接使用脚本
```bash
cd ~/.pi/agent/skills/web-browser

# 启动浏览器
node scripts/start.js

# 导航
node scripts/nav.js https://example.com

# 执行 JavaScript
node scripts/eval.js 'document.title'

# 截图
node scripts/screenshot.js

# 停止浏览器
node scripts/stop.js
```

## 功能特性

### ✅ 完全独立
- 不影响你的主 Chrome 浏览器
- 独立的配置和数据目录
- 独立的 cookies 和登录状态

### ✅ 持久化存储
- Cookies 自动保存
- LocalStorage 持久化
- Session 数据保留

### ✅ 随机端口
- 自动生成随机端口（9222-9999）
- 避免端口冲突
- 端口自动复用

### ✅ 丰富功能
- 页面导航
- JavaScript 执行
- DOM 操作
- 表单交互
- 数据提取
- 截图
- 元素选择

## 文档结构

```
~/.pi/agent/
├── agents/
│   └── web-browser.md          # 子代理配置
└── skills/
    └── web-browser/
        ├── SKILL.md            # 技能文档
        ├── FIX_NOTE.md         # 修复说明
        ├── scripts/            # 脚本目录
        │   ├── start.js        # 启动浏览器
        │   ├── stop.js         # 停止浏览器
        │   ├── get-port.js     # 获取端口
        │   ├── nav.js          # 导航
        │   ├── eval.js         # 执行 JavaScript
        │   ├── screenshot.js   # 截图
        │   └── pick.js         # 选择元素
        ├── demo.js             # 快速演示
        ├── test-subagent.js    # 测试子代理
        └── examples.js         # 使用示例
```

## 常见任务

### 1. 网页调研
```bash
cd ~/.pi/agent/skills/web-browser
node scripts/start.js
node scripts/nav.js https://example.com
node scripts/eval.js 'document.title'
node scripts/eval.js 'document.querySelectorAll("a").length'
node scripts/screenshot.js
node scripts/stop.js
```

### 2. 数据抓取
```bash
cd ~/.pi/agent/skills/web-browser
node scripts/start.js
node scripts/nav.js https://news.ycombinator.com
node scripts/eval.js 'JSON.stringify(Array.from(document.querySelectorAll(".titleline > a")).map(a => ({ text: a.textContent, href: a.href })))'
node scripts/stop.js
```

### 3. 登录后操作
```bash
cd ~/.pi/agent/skills/web-browser
node scripts/start.js --profile
node scripts/nav.js https://github.com
node scripts/eval.js 'document.cookie'
node scripts/stop.js
```

### 4. 表单交互
```bash
cd ~/.pi/agent/skills/web-browser
node scripts/start.js
node scripts/nav.js https://www.google.com
node scripts/eval.js 'document.querySelector("input[name=\\"q\\"]").value = "search term"; document.querySelector("form").submit()'
node scripts/stop.js
```

## 技术细节

### 端口管理
```bash
# 查看端口
node scripts/get-port.js

# 重置端口
rm ~/.cache/scraping-web-browser/port.txt
node scripts/start.js
```

### 配置目录
- **配置**: `~/.cache/scraping-web-browser/`
- **端口文件**: `~/.cache/scraping-web-browser/port.txt`
- **Cookies**: `~/.cache/scraping-web-browser/Default/Cookies`
- **LocalStorage**: `~/.cache/scraping-web-browser/Default/Local Storage/`

### 进程管理
```bash
# 查看进程
ps aux | grep "scraping-web-browser"

# 停止浏览器
node scripts/stop.js

# 强制停止
pkill -f "scraping-web-browser"
```

## 故障排除

### 无法启动浏览器
```bash
# 检查端口
lsof -i :$(node scripts/get-port.js)

# 停止现有实例
node scripts/stop.js

# 重新启动
node scripts/start.js
```

### 页面加载失败
```bash
# 检查网络
curl -I https://example.com

# 重启浏览器
node scripts/stop.js
node scripts/start.js
```

### JavaScript 执行失败
- 检查语法错误
- 确认页面已加载完成
- 使用单引号包裹代码

## 最佳实践

1. **总是停止浏览器**: 使用完后执行 `node scripts/stop.js` 释放资源
2. **检查端口**: 使用 `node scripts/get-port.js` 查看当前端口
3. **错误处理**: 如果遇到错误，重启浏览器重试
4. **持久化**: 使用 `--profile` 选项可以在需要登录的场景中使用
5. **批量操作**: 减少重复导航，提高效率

## 相关资源

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Puppeteer](https://pptr.dev/)
- [web-browser 技能文档](./SKILL.md)
- [修复说明](./FIX_NOTE.md)

## 许可

Based on Mario's web-browser skill.

---

**提示**: 使用 `/web-browser` 命令可以快速调用这个子代理进行网页相关任务。