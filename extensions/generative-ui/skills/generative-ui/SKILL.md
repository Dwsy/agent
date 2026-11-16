---
name: generative-ui
description: 本机唯一可视化通道（generative-ui 插件）。任何可视化、图表、图示、看板、仪表盘、分析报告、架构图、流程图、对比、模拟器、UI 原型、解释视频的需求，第一动作都是读本 skill，再 route → widget / canvas 渲染到 glimpseui 原生窗口。同义触发：visualization, chart, diagram, dashboard, widget, canvas, mermaid, grounded report, provenance。不要退回「写静态 HTML 文件再让用户自己打开」的做法 —— 那不开原生窗口，也没有宿主校验的 provenance。
---

# Generative UI — visual render skill

> **本机唯一可视化渲染通道。** 任何视觉产物需求的第一动作都是读本 skill。
> 不要退回「写静态 HTML 文件，再让用户自己打开」的做法 —— generative-ui 的差别在于
> request-first 路由（markdown / widget / canvas）、宿主强制的 grounding 与 provenance、
> 直接渲染到 glimpseui 原生窗口。
>
> 与 GAPP 的分界：GAPP（`.pi/gapp/`）是需要交互和域工具的长生命周期小应用，见 `gapp`
> skill；「看一眼的数据可视化」走本 skill，「长期操作的界面」才走 GAPP。
>
> 终端里的轻量 ASCII / mermaid 图仍可直接输出，不必开窗口。

One job: turn a natural-language goal into the right visual artifact. Everything runs through
`bun visual-cli.ts` — no `visualize_read_me` / `show_widget` / `show_canvas` /
`browse_widgets` tools are registered; the system prompt carries none of this.

## 1. The flow — route first, render second

```bash
VISUAL=~/.pi/agent/extensions/generative-ui/visual-cli.ts
bun $VISUAL route '<the user\'s actual goal>'     # picks medium/style/content/research
bun $VISUAL widget --title <t> --html-file <f> --grounding '{…}'   # or canvas
bun $VISUAL browse list                          # history / reopen / saved html
```

1. `route` returns compact JSON `details` (route id, target, style, research, modules,
   templates, `skillRefs`) and persists plan state to `<widgets>/last-plan.json`.
2. If `details.skillRefs` names a skill, read **that skill** before rendering — its route
   registered through `visual-routes.json` owns the content contract.
3. Render with `widget` or `canvas` following the route's target. The first render whose
   target matches the plan is enforced against it and consumes it.

<critical>
Do not ask the user to choose Canvas vs Widget, visual style, modules, or templates. Pass the
request set to the user's actual goal and let `route` decide.
Respect the returned retrieval policy. When required, or when if_missing facts are not already grounded, use the available
search/file/code/data tools before rendering. Never copy demo values from a skeleton into a
factual artifact. If the target is `markdown`, answer in normal text instead of forcing a visual.
</critical>

`route` is compact by default. Add `--expand` only when you need the full guidance text in one
shot; otherwise read `skillRefs` skills on demand. Do not preload every guide.

## 2. Which host for which deliverable

| Deliverable | Use |
|---|---|
| One visual in a native window, host-themed | **this skill** — `route` → `widget`/`canvas` |
| A full HTML page: explainer, diff review, plan, slide deck, narrated video | `visual-explainer` |
| A standalone `.svg` file | `pele-mermaid` CLI |
| A long-lived app with domain tools | `gapp` |

The distinction is the deliverable, not the topic. One diagram in a window is this skill; ten
figures in one page with a browser check is `visual-explainer`.

## 3. Reference map — read only what the task needs

| Read | When |
|---|---|
| `references/cli.md` | Before the first render: command surface, widget vs canvas, host bridge, browse. |
| `references/sdk.md` | Before writing Canvas TSX with unfamiliar SDK props: the closed `@gen-ui/canvas` export list. |
| `references/quality.md` | While building an artifact: medium choice, theme, a11y, anti-patterns. |
| `references/grounding.md` | Before writing `--grounding`: status, sources, plan interplay. |
| `references/windows.md` | When a render returns but you expected a message, or the window behaved oddly. |
| `references/visual-routes.md` | To add or debug a `visual-routes.json` manifest. |
| `references/mermaid.md` | When the artifact contains a Mermaid diagram. |
| `references/visual-explainer.md` | When the deliverable is a full HTML page. |

Each file is standalone — read it, act, move on. Do not read the whole set up front.

## 4. Hard rules

- Every `widget`/`canvas` call carries `--grounding`. The host rejects a render that declares
  `not_applicable` on an evidence-bearing route. Details: `references/grounding.md`.
- Theme with host CSS variables or `@gen-ui/canvas` tokens. Hardcoded `#hex` for UI chrome is a
  bug.
- Canvas TSX supports Tailwind utilities compiled at build time from literal class names; keep
  colors on host tokens. Details: `references/cli.md`.
- Keep data inline, artifacts under 2 MB, no fetch / XHR / WebSocket, no unapproved external
  resources.
- Give every chart, SVG, canvas, and widget an accessible name.
- `ok: true` means the host compiled and validated it. Do not screenshot or reopen the window to
  confirm — that re-reads a result the CLI already proved.
