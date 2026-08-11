# generative-ui

在原生 macOS 窗口（glimpseui / WKWebView）里渲染 AI 生成的可视化内容的 pi 扩展。模型通过工具输出 HTML/SVG 片段或单文件 React 组件，宿主负责开窗、流式预览、持久化和回传交互数据。

入口 `index.ts`：加载 glimpseui → 注册工具（`tools.ts`）→ 注册 `/widgets` 命令（`commands.ts`）→ 注册 GAPP 子系统（`gapp/index.ts`），并挂 `message_update` 钩子做流式预览。子代理进程（`GAPP_SUBAGENT=1`）跳过整个扩展的自注册，防止递归开窗。

## 工具契约

### visualize_read_me

按模块加载设计指南（`guidelines.ts`），是 `show_widget` / `show_canvas` 的前置调用——`execute` 侧强制校验（不是只看模型自报的 `i_have_seen_read_me`）。

- `modules`（必填）：`runtime`、`art`、`mockup`、`interactive`、`chart`、`diagram`、`canvas` 的任意组合。
- `templates`（可选）：按需展开 HTML 骨架全文；不传只给目录（省 token）。已知 id：`flow-steps`、`flow-mermaid`、`architecture-cards`、`metric-chart`、`compare-cards`、`contact-card`，或传 `["all"]`。

### show_widget

渲染 HTML 片段或 SVG（以 `<svg>` 开头自动识别）。

- 参数：`i_have_seen_read_me`、`title`（snake_case，作为窗口标题和文件名）、`widget_code`、`width`（默认 800）、`height`（默认 600）、`floating`、`interactive`。
- 校验（`validateWidgetCode`）：≤ 2 MB；必须是片段（禁止 DOCTYPE/`<html>`/`<head>`/`<body>`）；禁止 `fetch`/`XMLHttpRequest`/`WebSocket`；外部资源仅允许白名单 CDN：`cdnjs.cloudflare.com`、`cdn.jsdelivr.net`、`esm.sh`、`fonts.bunny.net`、`fonts.googleapis.com`、`fonts.gstatic.com`、`unpkg.com`（同一份白名单也进了页面 CSP，见 `widget-ui-kit.ts` 的 `WIDGET_CSP`）。
- 流式预览：`message_update` 钩子截获 `toolcall_delta` 中的部分 `widget_code`，morphdom 增量 morph 到预览窗口（150ms 节流）。morphdom 已 vendor 内联（`vendor-morphdom.ts`），离线可用。工具 `execute` 完成时收养预览窗口，注入最终内容并 `_runScripts()`。
- 页面注入：`window.glimpse.send(data)` 事件桥（及 `sendWidgetEvent` / `sendPrompt` / `sendAnnotation`）、`window._themeVars()` 主题变量、data-tooltip（Floating UI）+ Lucide 图标。
- `interactive: true`：工具阻塞等待页面经 `window.glimpse.send` 回传数据，120s 超时；窗口关闭 / 出错 / 超时都会正常 resolve。校验要求代码里确实调用了事件桥。

### show_canvas

渲染单文件 TSX React 组件，必须 `export default` 顶层组件。

- 参数：`i_have_seen_read_me`、`title`、`canvas_code`、`width`（默认 900）、`height`（默认 640）、`floating`、`interactive`。
- 宿主侧 esbuild 编译成 IIFE（`canvas.ts` 的 `transpileCanvas`），import 白名单：`react`、`react-dom`、`react-dom/client`、`@gen-ui/canvas`（后者是内联 SDK，提供 `useHostTheme()` / `sendToAgent()` / `sendPrompt()` / `sendAnnotation()`），其余 import 直接报错。编译错误带 `canvas_code` 行列号原样抛回给模型自修。
- 运行时是 React 18（18.3.1 UMD，最后一个有 UMD 构建的版本），带 ErrorBoundary（渲染异常回传 `canvas_error` 事件）。
- 校验（`validateCanvasCode`）：≤ 2 MB、必须 `export default`、禁网、同一 CDN 白名单，interactive 必须调用 `sendToAgent` 等桥函数。
- 流式预览为"编译成功才推帧"：部分 TSX 每 300ms 尝试编译一次，编译过才推新帧，失败保留上一帧。
- interactive 语义与 show_widget 相同（120s 超时阻塞）。

### browse_widgets

- `list`：列最近的未归档 widget（`limit` 默认 20）。
- `reopen`：按文件名重开原生窗口，尺寸/标题取自 index 记录。
- `html`：返回保存的源码；canvas 记录返回的是 TSX 源码（`.tsx` sibling），因为那才是可编辑再展示的东西。

## 存储

`storage.ts`，根目录 `~/.pi/widgets/`（`GENERATIVE_UI_WIDGETS_DIR` 可覆盖，用于隔离测试）：

- `index.json`：widget 元数据列表，上限 200 条。所有读改写经进程内锁串行化，写入用临时文件 + `rename` 原子替换。
- 每个 widget 一个自包含 `<timestamp>_<title>.html`；canvas 另存同名 `.tsx` 源码。
- 交互/批注事件落在 `<file>.events/` 目录，每条事件一个 JSON 文件（`wx` 独占写入），读 index 时回填 `events` 与最后一次 `interactionData`。

## 画廊与 /widgets 命令

`gallery.ts`：本地 HTTP 服务，绑定 `127.0.0.1` 随机端口，`.gallery-lock` 锁文件（pid + port + TCP 探活）保证跨进程单实例。瀑布流卡片 + iframe 沙箱预览，支持预览/源码查看/重命名/归档/恢复/删除/反馈（annotation + interaction）查看，iframe 内的 `postMessage` 事件也会写回 `.events/`。

`commands.ts` 注册 `/widgets`：

- `/widgets list`：文本列表。
- `/widgets server` / `/widgets stop`：启停画廊服务（启动后自动开浏览器）。
- 不带参数：TUI 两步选择器（Tab 切换 project/global 范围 → 选 widget → 原生窗口 / 浏览器 / 复制 HTML）。

## GAPP 子系统

`gapp/` 是挂在本扩展下的持久化小应用层：一个 GAPP 是磁盘上的 bundle（`meta.json` + `state.json` SSOT + `index.html` WebView 渲染器 + 可选 `tools.mjs` 共享领域工具 + 可选 `tui.mjs` 终端渲染器），WebView、Pi TUI、独立 CLI 和 agent 的 `gapp_*` 工具共用同一份状态与工具实现，并支持 spawn 无头 pi 子代理并行 generate。详见 [gapp/README.md](gapp/README.md) 与 [gapp/PROTOCOL.md](gapp/PROTOCOL.md)。

安全模型一句话：控制面是 `127.0.0.1:54888` 的多路 HTTP hub（首进程为 hub，其余进程做 HTTP client），除 `/health` 外所有路由要求 `Authorization: Bearer <token>`，token 由 hub 写入 `~/.pi/gapp/host-token`（0600）。

## glimpseui 依赖解析

`resolve-glimpseui.ts`，优先级（先命中先用）：

1. 环境变量 `GLIMPSEUI_PATH`（别名 `GLIMPSE_PACKAGE` / `GLIMPSEUI_PACKAGE`），可指向包根目录或入口 `.mjs`；
2. 本地 checkout `~/Dev/AI/glimpse`（及 `~/Dev/glimpse`）；
3. 全局 npm 安装（`npm root -g`、node prefix、Homebrew、`~/.npm-global`）；
4. 扩展/cwd 的 `node_modules` 里的 `glimpseui`。

`GLIMPSEUI_DEBUG=1`（或 `DEBUG` 含 `glimpse`）时在 stderr 打印实际使用的路径。解析失败扩展直接抛错并提示安装方式。

## 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `GENERATIVE_UI_WIDGETS_DIR` | 覆盖 widget 存储目录（测试隔离用） | `~/.pi/widgets` |
| `GLIMPSEUI_PATH` | 显式指定 glimpseui 包根/入口（别名 `GLIMPSE_PACKAGE`、`GLIMPSEUI_PACKAGE`） | 走解析优先级 |
| `GLIMPSEUI_DEBUG` | `=1` 打印实际加载的 glimpseui 路径 | 关 |
| `GAPP_SUBAGENT` | `=1` 标记无头 generate 子代理进程，扩展整体跳过自注册 | — |
| `GAPP_HOST_PORT` | GAPP 控制面端口 | `54888` |
| `GAPP_HOST_BIND` | 控制面绑定地址 | `127.0.0.1` |
| `GAPP_HOST_BASE` | 客户端连接的完整 base URL（测试常用） | `http://<bind>:<port>` |
| `GAPP_HOST_DEBUG` | `=1` 打印 host 启动角色/地址 | 关 |
| `GAPP_GLOBAL_DIR` | 覆盖全局 GAPP bundle 根目录 | `~/.pi/gapp` |
| `GAPP_PROJECT_DIR` | 钉死项目级 GAPP bundle 目录 | `<project>/.pi/gapp` |
| `GAPP_LEASES_DIR` | 覆盖单连接 lease 目录 | `~/.pi/gapp/_leases` |
| `GAPP_SUBAGENT_CONCURRENCY` | 并行 generate 子代理上限，超出 FIFO 排队 | `3` |
| `GAPP_SUBAGENT_CMD` | 子代理可执行命令（测试可替换成 fixture） | `pi` |
| `GAPP_LANG` | 强制 GAPP i18n 语言（否则读 `LC_ALL`/`LANG` 等） | 系统 locale |
| `GAPP_SDK_PATH` | 显式指定 gapp-sdk 入口（否则找 glimpse checkout / `@glimpse/gapp-sdk`） | 走候选路径 |

## 开发

```bash
cd extensions/generative-ui
pnpm install
pnpm test   # node --test 三个套件 + bun test 五个套件
```

测试文件：

- `psm-renderer/index.test.mjs` — psm 预览渲染器（node --test）。
- `theme-templates.test.mjs` — 主题变量与 HTML 骨架模板一致性（node --test）。
- `storage.test.mjs` — widget 索引原子写、事件持久化、并发保存（node --test）。
- `canvas.test.mjs` — canvas 编译管线：transpile、import 白名单、校验、shell 文档（bun，直接 import `.ts`）。
- `gapp/storage.test.mjs` — GAPP bundle 磁盘读写与作用域（bun）。
- `gapp/host.test.mjs` — stateOps、lease、多路 host server（bun）。
- `gapp/tui.test.mjs` — `tui.mjs` 加载与 TUI runtime 契约（bun）。
- `gapp/subagent.test.mjs` — 并行 generate 子代理进程池（bun，用 `test-fixtures/fake-pi.mjs` 假 pi）。
