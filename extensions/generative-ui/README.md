# generative-ui

`generative-ui` 是 Pi 的原生可视化扩展：用户只需要描述问题或目标，Agent 会先判断是否真的需要视觉表达，再自动选择 Markdown、Widget 或 Canvas，规划表示法、内容结构与检索策略，并把结果渲染到 macOS 原生窗口（glimpseui / WKWebView）。

它的目标不是“把任何回答都做成卡片”，而是把视觉表达当成一个可审计的编排过程：

```text
user request
    ↓
request-first routing
    ↓
representation + style + content plan + research policy
    ↓
retrieve evidence when required
    ↓
Widget / Canvas render
    ↓
host-enforced grounding + provenance
    ↓
live window + saved artifact + gallery
```

核心原则：

- 用户不需要理解 `show_widget`、`show_canvas`、modules 或 templates。
- 没有明显视觉收益时返回 Markdown，不为了使用工具强行生成 UI。
- 事实型可视化必须带宿主校验的 grounding/provenance；模板中的 demo 数据永远不能充当事实。
- 自动模式一次只展开一个最相关 skeleton，避免把完整模板库塞进上下文。
- Widget 与 Canvas 共享统一的内容、排版、主题、响应式与可访问性基线。

## 能做什么

自动路由目前覆盖：

| 用户意图 | 默认表示法 | 默认媒介 |
|---|---|---|
| 纯文字 / 不需要视觉 | Text-first | Markdown |
| 小型线性流程 | Step rail | Widget |
| 分支流程 / 状态机 / pipeline | Graph / Mermaid | Widget |
| 系统架构 / topology | Architecture map / hybrid | Widget |
| Timeline / roadmap | Chronology | Widget |
| 方案 / 产品 /价格比较 | Aligned comparison | Widget |
| 联系人 / 订单 /记录详情 | Record detail | Widget |
| 单一指标 / 趋势 | Focused chart | Widget |
| 多指标 / dashboard / drill-down | Analytical composition | Canvas |
| Audit / report / review / incident | Evidence brief | Canvas |
| Code diff / PR review | Diff review | Canvas |
| Todo / checklist / workflow state | Stateful task view | Canvas |
| Form / settings / questionnaire | Stateful form | Canvas |
| UI mockup | Product surface | Widget |
| Calculator / simulator / explorer | Interactive explainer | Widget |
| Illustration / poster / visual metaphor | Illustrative visual | Widget |

显式表示法优先于主题词。例如：

- `compare two architectures` → comparison，而不是 architecture map。
- `architecture migration roadmap` → timeline，而不是 architecture map。
- `workflow between services` → flow，而不是 architecture map。

大型架构不会把所有节点硬塞进一个 graph，而是采用“小型 topology overview + grouped detail”。

## 快速使用

正常情况下只传用户的自然语言目标：

```text
visualize_read_me({ request: "比较两个缓存方案，并说明推荐理由" })
```

规划器会返回：

- `target`: `markdown` / `show_widget` / `show_canvas`
- `route`: 语义路由 id
- `style`: 视觉风格
- `modules`: 所需 guidance 模块
- `template`: 最相关 skeleton（自动模式最多一个）
- `contentPlan`: artifact 至少需要包含的内容
- `research`: `none` / `if_missing` / `required`

随后 Agent 按返回的 target 渲染：

```text
visualize_read_me(request)
    ↓
research if needed
    ↓
show_widget(...) or show_canvas(...)
```

`modules` / `templates` 仍然保留为 expert override，但不是默认使用方式。仅传已知 template 时，planner 可以从 catalog 反推 target/modules。

## Research policy

`routing.ts` 会给每个 visual plan 加 retrieval policy：

- `required`: 请求涉及 `latest/current/today/news/price/weather/...` 等时效信息，或用户显式要求 search / verify / sources。
- `if_missing`: 可以使用当前会话已有事实；若缺具体证据、标签或数值，必须先通过当前可用的 search / file / code / data 工具补齐。
- `none`: 仅在明确不需要事实 grounding 的场景使用。

禁止把模板占位值、示例 KPI、demo 时间线或虚构来源当成真实证据。

## Grounding / provenance

每次 `show_widget` 和 `show_canvas` 都必须提交 `grounding`，这是宿主执行边界上的强制 invariant，不是 prompt 建议。

```ts
{
  status: "grounded",
  evidence_scope: "2026-08-19 generative-ui regression and source inspection",
  sources: [
    {
      label: "routing.ts",
      kind: "code",
      locator: "extensions/generative-ui/routing.ts",
      as_of: "2026-08-19"
    }
  ]
}
```

支持的 source kind：

```text
conversation | file | code | web | data
```

规则：

- `grounded` 必须至少有一个 `sources[]`。
- 每个 source 的 `label`、`kind`、`locator` 都是必填。
- `locator` 必须指向具体来源，不能是 `source`、`unknown`、`n/a` 等占位词。
- `web` locator 必须是无凭据的绝对 `http(s)` URL。
- `file` / `code` locator 不能伪装成 web URL。
- `not_applicable` 只用于纯创意、假设或非事实结构图，并且必须在 `evidence_scope` 解释原因；此时不能带 sources。
- 单个 artifact 最多 12 个 provenance sources，更多来源应先聚合。

宿主会自行生成可见 provenance footer，并把 grounding 写入保存记录；Widget / Canvas 的 live view、saved HTML 和 gallery reopen 都保留 provenance。

`visualize_read_me` 生成的 plan 还会参与 render boundary enforcement：一个 plan 只由“下一次 matching target 的成功 render”消费。不匹配的 render、校验失败或 grounding 拒绝都不能提前清掉该 plan。

## Widget

`show_widget` 适合单一视觉焦点、静态 HTML/SVG、小型交互、图表、流程、比较、记录详情和 UI mockup。

主要参数：

```text
title
widget_code
grounding
width?       default 800
height?      default 600
floating?
interactive?
i_have_seen_read_me?   compatibility field
```

`widget_code` 必须是 HTML fragment 或 raw SVG，不允许完整 HTML document。

运行时校验：

- 最大 2 MB。
- 禁止 `DOCTYPE`、`<html>`、`<head>`、`<body>`。
- 禁止 `fetch`、`XMLHttpRequest`、`WebSocket`。
- 外部资源仅允许批准的 CDN host。
- `interactive: true` 时必须调用 Agent event bridge。

批准的外部资源 host：

```text
cdnjs.cloudflare.com
cdn.jsdelivr.net
esm.sh
fonts.bunny.net
fonts.googleapis.com
fonts.gstatic.com
unpkg.com
```

页面桥：

```js
window.glimpse.send(data)
sendWidgetEvent(data)
sendPrompt(text)
sendAnnotation(data)
window._themeVars()
```

流式预览：`message_update` 会截获部分 `widget_code`，通过 vendor 内联的 morphdom 以约 150ms 节流增量更新预览。最终 tool execute 完成时收养预览窗口，并执行最终脚本。

`interactive: true` 会阻塞等待页面回传数据；窗口关闭、异常或 120 秒超时都会正常结束等待。

## Canvas

`show_canvas` 用于更复杂的分析型或有本地状态的 artifact。输入是单文件 TSX，必须 default-export 顶层 React component。

主要参数：

```text
title
canvas_code
grounding
width?       default 900
height?      default 640
floating?
interactive?
i_have_seen_read_me?   compatibility field
```

宿主使用 esbuild 将 TSX 编译成自包含 IIFE。允许 import：

```text
react
react-dom
react-dom/client
@gen-ui/canvas
```

其余 import 会被拒绝。

`@gen-ui/canvas` 是内联 Canvas SDK，提供：

- host theme / state / actions
- layout / typography
- forms
- charts
- DAG / graph
- diff
- todo / task state
- usage / metrics
- `sendToAgent()` / `sendPrompt()` / `sendAnnotation()`

运行时：

- React 18.3.1 UMD。
- ErrorBoundary 捕获渲染异常，并回传 `canvas_error`。
- 最大 2 MB。
- 禁止 `fetch` / XHR / WebSocket。
- 与 Widget 使用同一外部资源 allowlist。
- `interactive: true` 时必须调用 Agent bridge。

Canvas 流式预览遵循“编译成功才推帧”：约每 300ms 尝试编译部分 TSX，只有成功时才更新预览，失败时保留上一帧，避免半成品代码把窗口打坏。

## 统一 UI/UX contract

自动路由返回的 guidance 会强制一套跨 Widget / Canvas 的设计基线。

内容结构：

```text
context
  → one dominant artifact
  → evidence / detail
  → source / recency
  → action only when needed
```

视觉基线：

- Typography: `24 / 18 / 16 / 14 / 12px`
- Spacing: `4 / 8 / 12 / 16 / 24 / 32px`
- Surfaces: 透明 page + 必要时的 flat secondary surface
- Borders: 1px semantic border
- Radius: 6–12px
- Color: host theme tokens，neutral base + 最多一个 accent
- Responsive: 约 320px 宽仍保持单列阅读顺序，不允许固定外层宽度和无必要嵌套滚动
- Accessibility: semantic controls、visible labels、native focus、不能只靠颜色表达状态

纯 diagram/chart 不重复聊天里的长解释；但 audit/report/review/evidence brief 等自包含 artifact 必须把 scope、evidence、finding、source/recency 留在 artifact 内。

## Templates

模板采用 progressive disclosure。自动模式只展开一个最相关 skeleton。

HTML / Widget skeleton：

```text
flow-steps
flow-mermaid
architecture-cards
timeline-roadmap
metric-chart
compare-cards
contact-card
```

Canvas TSX skeleton：

```text
canvas-brief
canvas-charts
canvas-dashboard
canvas-diff
canvas-form-state
canvas-todo
```

模板只提供结构和交互骨架。任何 demo 值在正式 artifact 中都必须替换成用户提供或检索得到的真实内容。

## 持久化

`storage.ts` 默认把 artifact 写到：

```text
~/.pi/widgets/
```

可用 `GENERATIVE_UI_WIDGETS_DIR` 覆盖，用于测试隔离。

目录内容：

- `index.json`: 最多 200 条 widget/canvas 元数据；新记录保存 grounding provenance。
- `<timestamp>_<title>.html`: 自包含保存页面。
- Canvas 额外保存同名 `.tsx` 源码。
- `<file>.events/`: interaction / annotation sidecar，每个事件独立 JSON 文件。

索引读改写通过进程内锁串行化，文件更新使用临时文件 + `rename` 原子替换。旧记录没有 grounding 字段仍可正常读取，实现“新写强约束、旧读兼容”。

## Gallery 与 `/widgets`

`gallery.ts` 提供本地 gallery：

- 绑定 `127.0.0.1` 随机端口。
- `.gallery-lock` 使用 pid + port + TCP 探活保证跨进程单实例。
- 卡片式浏览历史 artifact。
- 支持预览、源码、重命名、归档、恢复、删除、annotation / interaction 查看。
- iframe 使用 sandbox，保存的 Canvas 仍保持 host theme / state / provenance。

`commands.ts` 注册：

```text
/widgets list
/widgets server
/widgets stop
/widgets
```

无参数 `/widgets` 会打开 TUI：先选择 project/global scope，再选择 artifact，可在原生窗口、浏览器或源码模式查看。

`browse_widgets` 工具支持：

- `list`: 最近 artifact
- `reopen`: 按 filename 重开
- `html`: 返回保存源码；Canvas 返回 `.tsx` sibling，因为它才是可继续编辑的源文件

## GAPP

`gapp/` 是扩展内的持久化小应用层。一个 GAPP 是磁盘 bundle：

```text
meta.json
state.json
index.html
tools.mjs?   shared domain tools
tui.mjs?     terminal renderer
```

WebView、Pi TUI、独立 CLI 和 `gapp_*` agent tools 共享同一份 state 和 tool implementation，并可通过无头 Pi 子代理并行 generate。

控制面默认运行在：

```text
127.0.0.1:54888
```

除 `/health` 外所有路由都要求：

```text
Authorization: Bearer <token>
```

token 由 host 写入 `~/.pi/gapp/host-token`，权限为 `0600`。

更完整说明：

- [gapp/README.md](gapp/README.md)
- [gapp/PROTOCOL.md](gapp/PROTOCOL.md)

## 安全模型

生成代码不是任意浏览器页面。主要边界包括：

- Widget / Canvas 单次代码最大 2 MB。
- 禁止 `fetch`、XHR、WebSocket。
- 外部资源使用固定 host allowlist。
- Canvas import 使用固定模块 allowlist。
- Gallery iframe 不授予 `allow-same-origin`。
- CSP 默认拒绝一般网络连接、object 和 form submit。
- GAPP host 只绑定 loopback，并要求 bearer token。
- MCP inspector 对凭据做 redaction，并验证 auth header / OAuth state。
- ngrok inspector 只允许 loopback HTTP(S) 入口。

为执行生成脚本，浏览器侧仍存在受控的 `unsafe-inline` / `unsafe-eval` 运行时权衡；如果未来需要进一步提高供应链安全等级，可继续把剩余 CDN runtime vendor 到本地或增加 integrity/capability isolation。

## glimpseui 解析

`resolve-glimpseui.ts` 按以下顺序解析 glimpseui：

1. `GLIMPSEUI_PATH`，或别名 `GLIMPSE_PACKAGE` / `GLIMPSEUI_PACKAGE`
2. 本地 checkout `~/Dev/AI/glimpse`、`~/Dev/glimpse`
3. 全局 npm 安装路径
4. 扩展 / cwd 的 `node_modules/glimpseui`

`GLIMPSEUI_DEBUG=1`（或 `DEBUG` 包含 `glimpse`）时会在 stderr 打印实际加载路径。解析失败会直接报错并给出安装提示。

## 架构与关键文件

```text
index.ts
├── tools.ts                 tool registration + render boundary
├── routing.ts               request → route
├── visual-plan.ts           route → guidance/template plan
├── grounding.ts             host provenance invariant
├── widget-validation.ts     Widget code boundary
├── canvas.ts                TSX compile + Canvas runtime shell
├── canvas-sdk-source.ts     @gen-ui/canvas inline SDK
├── guidelines.ts            shared design guidance
├── templates/               progressive skeleton catalog
├── widget-ui-kit.ts         Widget runtime/CSP/theme helpers
├── html-helpers.ts          shell/wrapper/window helpers
├── storage.ts               persistence + event sidecars
├── gallery.ts               local artifact gallery
├── commands.ts              /widgets command
├── psm-renderer/            preview rendering integration
└── gapp/                    persistent mini-app subsystem
```

## 开发

要求：Node.js、Bun、pnpm。

```bash
cd extensions/generative-ui
pnpm install
pnpm test
```

当前默认 `pnpm test` 会执行：

```text
node --test
  psm-renderer/index.test.mjs
  theme-templates.test.mjs
  storage.test.mjs

bun test
  canvas.test.mjs
  grounding.test.mjs
  render-boundary.test.mjs
  widget-validation.test.mjs
  routing.test.mjs
  visual-plan.test.mjs
  gapp/storage.test.mjs
  gapp/host.test.mjs
  gapp/tui.test.mjs
  gapp/subagent.test.mjs

bun test gapp/mcp-inspector.test.ts
bun test gapp/ngrok-inspector.test.ts
```

测试重点：

- `routing.test.mjs`: intent / representation / retrieval / priority matrix
- `visual-plan.test.mjs`: request-first plan、单 skeleton 展开、expert override
- `grounding.test.mjs`: grounding declaration、locator 校验、escaping、host footer
- `render-boundary.test.mjs`: 真实 `registerTools + execute`，验证 route-aware grounding、matching plan 保留/消费、live/saved/index provenance
- `widget-validation.test.mjs`: fragment、禁网、CDN allowlist、interactive bridge、2 MB
- `canvas.test.mjs`: TSX transpile、import allowlist、runtime shell、SDK、模板真实编译
- `theme-templates.test.mjs`: host theme、guideline/template contract
- `storage.test.mjs`: 原子索引写、并发保存、事件 sidecar
- `gapp/*`: storage、host、TUI、subagent、MCP、ngrok integration

## 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `GENERATIVE_UI_WIDGETS_DIR` | 覆盖 widget 存储目录 | `~/.pi/widgets` |
| `GLIMPSEUI_PATH` | 显式指定 glimpseui 包根/入口 | 自动解析 |
| `GLIMPSE_PACKAGE` | `GLIMPSEUI_PATH` 别名 | — |
| `GLIMPSEUI_PACKAGE` | `GLIMPSEUI_PATH` 别名 | — |
| `GLIMPSEUI_DEBUG` | 打印实际 glimpseui 路径 | 关 |
| `GAPP_SUBAGENT` | 标记无头 generate 子代理，跳过扩展自注册 | — |
| `GAPP_HOST_PORT` | GAPP host 端口 | `54888` |
| `GAPP_HOST_BIND` | GAPP host bind 地址 | `127.0.0.1` |
| `GAPP_HOST_BASE` | GAPP client base URL | `http://<bind>:<port>` |
| `GAPP_HOST_DEBUG` | 打印 GAPP host 角色/地址 | 关 |
| `GAPP_GLOBAL_DIR` | 全局 GAPP bundle 根目录 | `~/.pi/gapp` |
| `GAPP_PROJECT_DIR` | 项目级 GAPP bundle 目录 | `<project>/.pi/gapp` |
| `GAPP_LEASES_DIR` | single-instance lease 目录 | `~/.pi/gapp/_leases` |
| `GAPP_SUBAGENT_CONCURRENCY` | generate 子代理并发上限 | `3` |
| `GAPP_SUBAGENT_CMD` | 子代理可执行命令 | `pi` |
| `GAPP_LANG` | 强制 GAPP i18n 语言 | 系统 locale |
| `GAPP_SDK_PATH` | 显式指定 gapp-sdk 入口 | 自动解析 |

## 设计边界

这个扩展刻意不做几件事：

- 不把所有回答都包装成 dashboard。
- 不让模板 demo 数据混入真实事实。
- 不要求用户选择内部工具或模板。
- 不让 visual planner 自行绕过当前会话的工具权限去联网。
- 不把大量 architecture node 强行塞进单图。
- 不把 provenance 仅作为文本提示；事实 render 必须过宿主 grounding 校验。

最终期望是：视觉只是表达手段，内容完整性、事实来源、交互边界和可维护性都由宿主一起约束。
