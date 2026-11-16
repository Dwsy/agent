---
name: pele-mermaid
description: Pele（Mermaid→SVG 渲染器）文档 + md/mmd 转 SVG 的 CLI。触发词：pele, mermaid2svg, mermaid 转 svg, md 转 svg, 画 mermaid, 图型选型
---

# pele-mermaid — Pele 文档 + Markdown→SVG

两件事，一个技能：

1. **Pele 知识库**（[pele.run](https://pele.run) 全文档原样快照 + 32 种图型语法页）——用来在网页/组件里渲染 Mermaid，或查某种图的写法。
2. **`pele-mermaid` CLI**——把 Markdown 里的 ` ```mermaid ` 块或单个 `.mmd` 落成独立 `.svg` 文件。Bun 里跑，离屏，不启浏览器、不连网络、不用 Kroki。**零运行时依赖**：Pele 已 vendor 进 `vendor/pele.mjs`，不装 node_modules 也能跑。

渲染核心两条铁律：`render()` 同步返回 SVG 字符串（离屏可跑）；`mount()`/`enableZoom()` 要 DOM，只在浏览器用。

## 先选入口

| 你要做的事 | 读 |
|---|---|
| 网页/组件里接 Pele（CDN、npm、按需打包、React/Vue） | `references/usage.md` |
| 把文档里的图导成 SVG 文件 | 本页 CLI 一节 → `references/cli.md` |
| 写某种图的 Mermaid 语法 | `references/types/<type>.md`（见下方选型表） |
| 调 `render`/`mount`/`parse`/`detectType` 的签名与全部 option | `references/api.md` |
| 改配色、字体、圆角，`--pele-*` 变量表 | `references/theming.md` |
| 链接/图片白名单、限流、宿主职责 | `references/security.md` |
| Pele 与 Mermaid 原版的语法差异 | `references/compatibility.md` |

## 三种接入方式（体积实测）

| 方式 | 代码 | 体积 |
|---|---|---|
| CDN UMD | `<script src="https://cdn.jsdelivr.net/npm/pele@1/dist/pele.global.js">` → `pele.mount(el, text)` | 734 KB / 274 KB gzip |
| npm 全量 | `bun add pele` → `import { render } from "pele"` | 718 KB / 268 KB gzip |
| npm 按需 | `import { register } from "pele/core"` + `pele/diagrams/flowchart` | 147 KB / **58 KB** gzip |
| 本技能 CLI | `bun src/cli.ts doc.md` | 零前端体积 |

每个细节和坑（CDN `onload` 丢失、`core`/`lazy` 入口必须一致、`foreignObject` 与 DOMPurify）：`references/usage.md`。

## CLI 30 秒

```bash
PM=~/.pi/agent/skills/pele-mermaid/src/cli.ts

bun $PM doc.md                                   # 全部 mermaid 块 → ./doc-svg/doc-1.svg …
bun $PM doc.md --inline --theme dark             # 另写 doc-svg/doc.md，块换成图片链接
bun $PM doc.md --audit                           # 顺带体检：字号下限 / 标签重叠 / 缩放可读性
bun $PM flow.mmd -o out/ --label "订单流转"       # 单个 .mmd → out/flow.svg，带无障碍名
printf 'flowchart LR\n A-->B\n' | bun $PM - --mmd -o out/
```

stdout 恒为一个 JSON：`{ ok, count, files:[{ n, type, width, height, path, bytes, warnings }], errors:[] }`。
`ok:false` + `errors[]` 表示部分失败——**成功的照样落盘**，失败项带 `line/column/snippet`；退出码 1。

```text
.md ──scan fences──> [mermaid 块 …] ──pele.render()──> SVG ──字号下限/主题/底色──> .svg 文件
                                          │                                      │
                                          │                                      └── --audit 静态体检 → warnings[]
                                          └── 失败 → errors[{ n, code, line, column, snippet }]
```

## 选图型（最重要的一步）

先按「想表达什么」定 type，再只读对应的那一页。

| 分类 | 想表达 | Mermaid 关键字 | 语法页 |
|---|---|---|---|
| 流程 | 步骤与分支 | `flowchart` / `graph` | `references/types/flowchart.md` |
| 流程 | 分泳道的流程、谁做哪步 | `swimlane` | `references/types/swimlane.md` |
| 流程 | 状态机与迁移 | `stateDiagram-v2` | `references/types/state.md` |
| 流程 | 角色与系统目标 | `usecase` | `references/types/usecase.md` |
| 流程 | 用户旅程 + 体验评分 | `journey` | `references/types/journey.md` |
| 流程 | AI agent 任务交接 | `agentflow` | `references/types/agentflow.md` |
| 流程 | 看板状态列 | `kanban` | `references/types/kanban.md` |
| 流程 | 命令/事件/视图演进 | `eventmodeling` | `references/types/eventmodeling.md` |
| 结构 | 自排网格块（VPC/模块地图） | `block` | `references/types/block.md` |
| 结构 | 服务与连接 | `architecture` | `references/types/architecture.md` |
| 结构 | C4 系统/容器/组件 | `C4Context` / `C4Container` / `C4Component` | `references/types/c4.md` |
| 结构 | 类、成员、关系 | `classDiagram` | `references/types/class.md` |
| 结构 | 实体与关系（schema） | `erDiagram` | `references/types/er.md` |
| 结构 | 目录树 | `treeView` | `references/types/treeview.md` |
| 结构 | 发散脑图 | `mindmap` | `references/types/mindmap.md` |
| 结构 | 协议字段布局 | `packet` | `references/types/packet.md` |
| 结构 | 层级面积占比 | `treemap` | `references/types/treemap.md` |
| 时序 | 参与者消息时序 | `sequenceDiagram` | `references/types/sequence.md` |
| 时序 | 时间线事件 | `timeline` | `references/types/timeline.md` |
| 时序 | 项目排期 | `gantt` | `references/types/gantt.md` |
| 时序 | 提交/分支/合并 | `gitGraph` | `references/types/git.md` |
| 数据 | 柱状+折线 | `xychart` | `references/types/xychart.md` |
| 数据 | 占比饼图 | `pie` | `references/types/pie.md` |
| 数据 | 流量与权重 | `sankey` | `references/types/sankey.md` |
| 数据 | 多维对比 | `radar` | `references/types/radar.md` |
| 数据 | 四象限定位 | `quadrantChart` | `references/types/quadrant.md` |
| 数据 | 集合重叠 | `venn` | `references/types/venn.md` |
| 分析 | 因果鱼骨 | `ishikawa` | `references/types/ishikawa.md` |
| 分析 | Cynefin 五域排序 | `cynefin` | `references/types/cynefin.md` |
| 分析 | 可见性 × 演进地图 | `wardley` | `references/types/wardley.md` |
| 分析 | 需求与满足关系 | `requirement` | `references/types/requirement.md` |
| 分析 | 语法规则图 | `railroad-ebnf-beta` | `references/types/railroad.md` |

`types/*.md` 是官方示例页原样快照：按该图型的式样/变体组织（含窄屏行为、配置项、可复制片段）。

## Pele 必知事实

1. **`render()` 离屏可跑，`mount()`/`enableZoom()` 要 DOM。** 落盘只用前者；本 CLI 已封装。
2. **无 canvas 环境**（Bun/Node/worker）退化到内置字宽表估宽。CJK 与拉丁混排正常，极端长标签可能差 1–2px。
3. **主题全是 CSS 变量**（`--pele-*`），SVG 里存的是 `var(--pele-bg,#fff)`。所以裸文件进别人页面会变色——本 CLI 把变量内联进根 `<svg style>`，文件即成品。
4. **不画底色就透明**。`--theme dark` 若不补背景，深色文字落在黑底上等于消失。本 CLI 默认插 `<rect class="pele-bg">`；嵌进已有底色的容器用 `--transparent`。
5. **< 640px 会掰方向**：`LR` 自动变 `TB`（`autoDirection`，阈值 `directionBreakpoint`）。所以 `--max-width` 别随手设到 640 以下。
6. **限流**：源 50k 字符、输出 SVG 4M 字符、flowchart 边 5000 条，超了抛 `PeleError.code === 'limit'`。
7. **链接白名单**：`linkSchemes` 默认 `http/https/mailto/tel`，`imageSchemes` 默认 `http/https`，其它 scheme 直接丢。
8. **一页多图会 ID 撞车**：`render()` 不加 `idPrefix`。多个 SVG 用 `<img>` 引用（各自独立文档）没问题，把多个 SVG 内联进同一 HTML 才需要 `idPrefix`。
9. **`PeleError` 四码**：`unsupported-diagram` / `syntax`（带 line/column/snippet）/ `semantic` / `limit`，`instanceof` 判断后才安全。
10. **字体测量即输出**：传 `fontFamily` 就必须同步设 `--pele-font`，否则节点按 A 字体排、按 B 字体画，标签被裁。
11. **Pele 会把某些标签画到 12px 以下**。本 CLI 从 `fontSize: 16` 起逐级放大，直到最小标签 ≥ 12px（上限 24px）。32 种图型实测：有 2 种原本会出现 9px / 11px 标签，现在被抬到 12px。
12. **一个 `.svg` 只有一个宽高比**。窄容器里要么缩字要么裁切 —— 没有 CSS 可用（standalone 文件没有页面媒体查询上下文给 `<img>` 引用）。窄屏适配交给嵌入它的页面。

## 边界

| 需求 | 走哪 |
|---|---|
| 落盘 SVG 给文档/HTML/生图用 | 本技能 CLI |
| 在原生窗口里看图、可交互、带 provenance | `generative-ui` 技能 |
| 要窄屏双布局、要动效、要交互 | `generative-ui` 的 `flow-mermaid` 模板（它用 Pele 的 HTML 方案，能塞 media query） |
| 终端随手一张 ASCII / mermaid | 直接输出 |
| 长生命周期小应用 | `gapp` |

旧的 `mermaid-flow-image`（Kroki + 不存在的 `./scripts/python/render_mermaid_kroki.py`）已被本技能取代。

## 检查清单

- [ ] 图型与要表达的东西匹配（不是所有东西都画成 flowchart）
- [ ] 含 `()[]{}<>:|` 的标签用引号包住
- [ ] `ok:true`，且 `files[].type` 与预期图型一致（不一致说明检测跑偏）
- [ ] 跑过 `--audit`，`files[].warnings` 为空（或已处理）
- [ ] 交付的是**路径**，不是"已完成"
