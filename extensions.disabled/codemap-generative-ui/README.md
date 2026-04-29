# codemap-generative-ui

一个基于 `glimpseui` 思路、参考 `pi-generative-ui` 架构做出来的 **生成式 CodeMap 插件宿主**。

它不是单纯“打开已有 HTML”的查看器，而是一个可扩展宿主：

```text
用户自然语言 / 网页操作
        ↓
宿主扩展（语义路由 / tool 注册 / WS / 端口服务）
        ↓
模块插件（当前内置 codemap）
        ↓
上下文收集 / CodeMap 生成 / HTML 渲染 / Glimpse 预览
```

## 安装位置

- `~/.pi/agent/extensions/codemap-generative-ui/`

Pi 会自动发现该扩展目录里的 `index.ts`。

## 当前内置插件

### codemap

提供以下工具链：

- `codemap_read_me`
- `codemap_list_existing`
- `codemap_collect_context`
- `codemap_render_html`
- `codemap_show_widget`

以及仅保留的运维入口命令：

- `/codemap-web [start|stop|status] [port]`

## WebSocket + 纯端口工作台

这版已经支持本地端口工作台：

```text
/codemap-web start 43118
```

启动后会打开：

- `http://127.0.0.1:43118`

网页工作台支持：

1. 输入需求，向当前 agent 会话发起 **生成请求**
2. 列出最近项目里的已有 CodeMap
3. 直接渲染已有 CodeMap JSON / index.json / HTML
4. 查看 agent/tool 事件流
5. 在网页 iframe 中预览生成后的 HTML
6. 预览页点击定位点后，自动把“继续分析这个定位点”的请求回传给当前 agent 会话
7. 选中定位点后，可在 portal 面板里手动触发“继续分析”或“增量修正 trace”
8. 保存最近 20 个渲染历史，并支持快速回放 / 再次用原生窗口打开
9. 可选请求用 Glimpse 打开原生窗口

## 设计目标

### 1. Tool-first 交互
主路径现在是工具驱动，而不是命令驱动：

- 用户自然语言 → 宿主语义路由 → `codemap_*` 工具链
- 默认视觉路径是 `codemap_show_widget(widget_code)`
- `widget_code` 优先于整页 HTML，整页 HTML 只是 fallback
- 只有在明确保存/导出时，才会再走 `codemap_render_html(persist=true)`
- 命令只保留给人工调试或运维

### 2. 语义化路由
当用户意图偏向以下内容时，宿主会在 agent 开始前注入 codemap 工作流提示：

- codemap
- 调用链
- 链路
- 流程图
- 状态机
- 架构图
- 可视化
- mermaid
- trace
- 时序图
- 全链路
- 深度扫描

### 2. 动态上下文收集
`codemap_collect_context` 会：

- 按 query 推导搜索 pattern
- 用 `rg` 在项目中找真实命中
- 读取命中文件片段
- 返回结构化文件、命中行、snippet

### 3. 生成而不是只查看
`codemap_render_html` 现在默认先做内存态渲染：

- 直接生成 HTML
- 不强制落盘
- 只有在 `persist=true` 或明确需要保存时，才会保存 JSON / HTML 并按需回写 `docs/.codemap/index.json`

### 4. 预览与网页工作台联动
- `codemap_show_widget` 现在支持像 `pi-generative-ui` 那样的 tool 流式渐进披露 HTML（`widget_code` 路径）
- `codemap_render_html` 产出的 HTML 会被 portal 自动接收并预览
- portal 维护最近生成历史，可回放和重开
- HTML 里的定位点现在是可点击的，点击后会通过 `postMessage -> WebSocket -> agent` 回流到当前会话继续深挖
- portal 还支持基于当前选中定位点触发 `trace 增量修正`，把修正请求重新注入 agent 继续生成新版 CodeMap

### 5. 可扩展插件宿主
当前只有 `plugins/codemap/`，但宿主已经拆出了：

- `host/`：注册与语义路由
- `runtime/`：glimpse / http / ws
- `plugins/`：业务模块
- `shared/`：模块接口与 prompt 工具

后续可继续加：

- `plugins/diagram/`
- `plugins/chart/`
- `plugins/simulator/`

## 目录结构

```text
codemap-generative-ui/
├── index.ts
├── package.json
└── src/
    ├── host/
    │   ├── register-tools.ts
    │   └── semantic-router.ts
    ├── plugins/
    │   └── codemap/
    │       ├── collect.ts
    │       ├── index.ts
    │       ├── intent.ts
    │       ├── readme.ts
    │       ├── render-html.ts
    │       └── render-widget.ts
    ├── runtime/
    │   ├── glimpse-window.ts
    │   ├── web-portal-html.ts
    │   └── web-server.ts
    ├── shared/
    │   ├── module.ts
    │   └── prompting.ts
    ├── codemap.ts
    ├── glimpse.ts
    ├── html.ts
    ├── index.ts
    └── types.ts
```

## 典型用法

### 默认交互

直接对 Pi 说：

```text
把支付系统全链路可视化一下
继续深挖这个调用链，并用 CodeMap 展示出来
帮我把这个模块生成成可交互的链路图
```

宿主会优先把请求路由到：

```text
codemap_read_me
→ codemap_collect_context
→ codemap_show_widget（默认视觉路径）
→ codemap_render_html（仅在需要落盘时）
```

### 启动网页工作台（运维入口）

```text
/codemap-web start 43118
```

## 后续建议

1. 点击 location 后，直接把路径回传给 agent 做继续分析
2. 增加 diagram/chart 插件
3. 给网页工作台加“最近生成结果列表”
4. 把生成 trace 的过程也做成流式状态卡片
