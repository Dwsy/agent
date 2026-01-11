---
name: web-browser
description: "Allows to interact with web pages by performing actions such as clicking buttons, filling out forms, and navigating links. It works by remote controlling Google Chrome or Chromium browsers using the Chrome DevTools Protocol (CDP). When Claude needs to browse the web, it can use this skill to do so."
license: Stolen from Mario
---

# Web Browser Skill

Minimal CDP tools for collaborative site exploration.

**🔧 修复说明**：已修复关闭主浏览器的问题。现在使用完全独立的浏览器实例，不影响你的主 Chrome。详见 [FIX_NOTE.md](./FIX_NOTE.md)

**🎲 随机端口**：每次启动时自动生成随机端口（9222-9999），避免端口冲突。端口信息保存在 `~/.cache/scraping-web-browser/port.txt`，下次启动会复用相同端口。

## Quick Start

```bash
# Run demo to test everything works
node demo.js

# Get current port
node scripts/get-port.js
```

## Start Chrome

\`\`\`bash
./scripts/start.js              # Start with fresh profile
./scripts/start.js --profile    # Copy your main Chrome profile (cookies, logins)
\`\`\`

Start Chrome on a random port (9222-9999) with remote debugging. The port is saved and reused for subsequent starts.

**Important**: This skill starts a completely independent browser instance with its own profile directory (`~/.cache/scraping-web-browser`). It will NOT affect your existing Chrome browser or close any open tabs. The browser runs in the background and persists cookies, localStorage, and session data between restarts.

### Profile Options

- **Fresh profile** (`./scripts/start.js`): Starts with a new, isolated profile. Good for testing and scraping without affecting your main browser.
- **Copy profile** (`./scripts/start.js --profile`): Copies your main Chrome profile (cookies, logins, bookmarks) to the isolated browser. Useful when you need to be logged into sites.

### Port Management

- **Random port**: Automatically generated on first start (9222-9999)
- **Port persistence**: Port is saved to `~/.cache/scraping-web-browser/port.txt`
- **Reuse**: Next start uses the same port
- **Reset**: Delete port.txt to get a new random port
- **Check port**: Run `node scripts/get-port.js` to see current port

## Navigate

\`\`\`bash
./scripts/nav.js https://example.com
./scripts/nav.js https://example.com --new
\`\`\`

Navigate current tab or open new tab.

## Evaluate JavaScript

\`\`\`bash
./scripts/eval.js 'document.title'
./scripts/eval.js 'document.querySelectorAll("a").length'
./scripts/eval.js 'JSON.stringify(Array.from(document.querySelectorAll("a")).map(a => ({ text: a.textContent.trim(), href: a.href })).filter(link => !link.href.startsWith("https://")))'
\`\`\`

Execute JavaScript in active tab (async context).  Be careful with string escaping, best to use single quotes.

## Screenshot

\`\`\`bash
./scripts/screenshot.js
\`\`\`

Screenshot current viewport, returns temp file path

## Pick Elements

\`\`\`bash
./scripts/pick.js "Click the submit button"
\`\`\`

Interactive element picker. Click to select, Cmd/Ctrl+Click for multi-select, Enter to finish.
