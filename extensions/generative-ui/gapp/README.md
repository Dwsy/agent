# Glimpse-APP (GAPP)

挂在 `generative-ui` 下的持久化小应用层。一个 GAPP 共享 `meta.json`、`state.json` 与领域工具，同时可以提供不同渲染器：

- `index.html`：原生窗口 / WebView 渲染器。
- `tui.mjs`：终端渲染器，由 `pi-tui` 宿主挂载。

TUI 不是 WebView 管理面板，也不解释 HTML；它直接渲染 GAPP 自己提供的 Component。

## 目录

```text
gapp/
  index.ts         # registerGapp() + host start + agent bridge
  constants.ts     # port 54888 + path table
  host-server.ts   # multipath HTTP hub
  host-client.ts   # HTTP client when not hub
  lease.ts         # single-connection leases
  registry.ts      # live windows / tools / generate jobs
  stateops.ts      # legacy declarative stateOps executor
  tool-module.ts   # trusted app-owned tools.mjs loader/executor
  open.ts          # WebView open + message router + lease
  storage.ts       # disk SSOT + WebView runtime injection
  tools.ts         # gapp_* including list_tools / call
  service.ts       # renderer-neutral tool catalog + invocation service
  runtime-host.ts  # standalone TUI → shared Host adapter
  runtime-pi.ts    # Pi live-window / Host adapter
  tui.ts           # tui.mjs loader + app runtime contract
  tui-pi.ts        # ctx.ui.custom() TUI host
  cli.ts           # standalone TUI + ProcessTerminal host
  commands.ts      # /gapp lifecycle + /gapp tui
  protocol.ts      # Host protocol types + helpers
  PROTOCOL.md      # Host and TUI renderer contracts
```

## 磁盘 Bundle

```text
project:  .pi/gapp/<id>/
global:   ~/.pi/gapp/<id>/

meta.json       required
state.json      required
index.html      current WebView entry
tools.json      optional tool schema/catalog
tools.mjs       optional v0.2 shared executable domain tools
tui.mjs         optional TUI application renderer
```

`state.json` 是应用状态 SSOT；`tools.json` 是可发现 schema，`tools.mjs` 是 v0.2 的共享领域实现。WebView、独立终端、Pi TUI、Host 和 agent `gapp_call` 不再各自复制增删改逻辑。

## v0.2 共享工具模块

bundle 根目录可提供固定入口 `tools.mjs`。它是本地可信应用代码，导出 `gappToolHandlers`；每个 handler 接收当前 state、arguments 和宿主 context，并返回 `{ state, result? }`：

```js
export const gappToolHandlers = {
  add_item({ state, arguments: args, context }) {
    const item = {
      id: context.uuid(),
      title: String(args.title),
      createdAt: context.now(),
    };
    return {
      state: { ...state, items: [...(state.items || []), item] },
      result: item,
    };
  },
};
```

`tools.json` v0.2 只声明 schema 和模块入口：

```json
{
  "v": "0.2",
  "module": "tools.mjs",
  "tools": [
    {
      "name": "add_item",
      "description": "Add an item",
      "inputSchema": {
        "type": "object",
        "properties": { "title": { "type": "string" } },
        "required": ["title"]
      }
    }
  ]
}
```

执行优先级为 `tools.mjs` → legacy `stateOps` / live handler。WebView 可通过注入的 `window.__GAPP_TOOLS_MODULE_URL__` 动态 import 同一文件；TUI 使用相对 import。应用也可以从模块导出自己的客户端封装，使两个 renderer 不再硬编码工具短名。

## TUI 应用契约

GAPP 在 bundle 根目录提供 `tui.mjs`：

```js
export default function createGappTui(runtime) {
  return {
    invalidate() {},
    render(width) {
      const state = runtime.getState();
      return [`${runtime.app.name}: ${JSON.stringify(state)}`];
    },
    handleInput(data) {
      if (data === "q") runtime.close();
    },
  };
}
```

也可以导出具名 `createGappTui(runtime)`。返回值采用 `pi-tui` 的结构化 `Component` 契约：`render(width): string[]`、可选 `handleInput(data)`、`invalidate()`。

模块本身不必安装或 import `pi-tui`。宿主注入的 runtime 提供：

| API | 用途 |
|---|---|
| `runtime.app` | 当前 GAPP 的 id/name/description/scope |
| `runtime.getState()` | 读取最新 `state.json` |
| `runtime.call(name, args)` | 经共享 service 调用 `tools.mjs` / legacy stateOps / Host / live handler，并刷新状态 |
| `runtime.refresh()` | 从磁盘重新读取 bundle 状态 |
| `runtime.prompt({ title, initial, submit })` | 请求宿主显示文本输入，然后回调应用 |
| `runtime.notify(message)` / `getStatus()` | 应用状态行 |
| `runtime.key(data, name)` | 匹配方向键、Enter、Esc 等 |
| `runtime.truncate()` / `pad()` | ANSI/终端宽度安全输出 |
| `runtime.palette` | Pi 主题或独立终端 ANSI palette |
| `runtime.close()` | 退出当前 TUI 应用 |

TUI 内调用工具固定 `openIfNeeded: false`，不会为了执行操作意外打开浏览器窗口。

## 命令

| 命令 | 行为 |
|------|------|
| `/gapp` / `/gapp list` | 生命周期列表；Enter 打开 WebView |
| `/gapp open <n|id>` | 打开 `index.html` 原生窗口 |
| `/gapp tui [n|id]` | 在 Pi 中直接渲染 GAPP 的 `tui.mjs` |
| `/gapp-tui [n|id]` | 同一 Pi TUI 应用入口 |
| `/gapp list --text` | 纯文本列表 |
| `/gapp enable|disable|archive <n|id>` | 生命周期 |
| `/gapp generate <描述>` | 让 agent 生成 GAPP |

省略 TUI app id 时，选择器只列出含 `tui.mjs` 的 GAPP。

## 独立 CLI

独立 CLI 与 Pi 加载同一个 `tui.mjs`。差异只在宿主：

- 独立：`TUI + ProcessTerminal`
- Pi：`ctx.ui.custom()`

```bash
cd extensions/generative-ui
pnpm install

./gapp/cli.ts demo-kanban --cwd /path/to/agent
# 或
pnpm gapp:tui demo-kanban --cwd /path/to/agent
```

安装或链接该 package 后会暴露 `gapp-tui` bin。

## Demo Kanban

`.pi/gapp/demo-kanban/tui.mjs` 是完整的 TUI 应用渲染器：宽屏显示三列看板，窄屏显示当前列；方向键选择列/卡片，Enter 前进，`b` 后退，`p` 改优先级，`a` 新增，`u` 指派，`d` 删除，`t` 改标题，`r` 刷新，`q` 退出。WebView 与 TUI 都 import `tools.mjs` 导出的常量、状态规范化和 `createKanbanTools()` 客户端；`tools.json` 只负责 schema/catalog，所有写操作最终落到同一 `state.json`。

## Host control plane

- **Port:** `54888`（`GAPP_HOST_PORT`）
- **Auth:** 除 `/health` 外所有路由要求 `Authorization: Bearer <token>`；token 由 hub 写入 `~/.pi/gapp/host-token`（0600），本地进程读文件、WebView 由 runtime 注入
- **Paths:** `/health`, `/v1/gapp/...` — 见 `PROTOCOL.md`
- First process = hub; others = HTTP clients to same port

Host Protocol 仍负责 WebView live tools、events、generate 和跨进程调用；TUI renderer contract 是同一 bundle 的另一种表现层。

## 并行 generate（subagent）

`GappHost.generate()` / `POST /generate` 默认 `mode: "subagent"`：每个请求 spawn 一个无头
`pi -p --no-session --no-tools` 子代理，多个请求**真并行**执行；并发上限
`GAPP_SUBAGENT_CONCURRENCY`（默认 3），超出 FIFO 排队。子代理进程带 `GAPP_SUBAGENT=1`，
generative-ui 在其中跳过自注册（防递归）。传 `mode: "agent"` 则回到旧行为：注入主会话
（串行，但共享会话上下文）。实现见 `subagent.ts`（进程池）+ `generate.ts`（统一调度）。
