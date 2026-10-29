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
`bun visual-cli.ts` (see §3) — no `visualize_read_me` / `show_widget` / `show_canvas` /
`browse_widgets` tools are registered; the system prompt carries none of this. Learn the calling
system here, then work route → render.

## 1. The flow — route first, render second

```bash
VISUAL=~/.pi/agent/extensions/generative-ui/visual-cli.ts
bun $VISUAL route '<the user's actual goal>'     # pick medium/style/content/research
bun $VISUAL widget --title <t> --html-file <f> --grounding '{…}'   # or canvas
bun $VISUAL browse list                          # history / reopen / saved html
```

1. `route` returns compact JSON `details` (route id, target, style, research, modules,
   templates, `skillRefs`) and persists plan state to `<widgets>/last-plan.json`.
2. If `details.skillRefs` names a skill, read **that skill** before rendering — its route
   registered through `visual-routes.json` (§6) owns the content contract.
3. Render with `widget` or `canvas` following the route's target. The first render whose
   target matches the plan is enforced against it (§4) and consumes it.

<critical>
Do not ask the user to choose Canvas vs Widget, visual style, modules, or templates. Pass the
request set to the user's actual goal and let `route` decide.
Respect the returned retrieval policy. When required, or when if_missing facts are not already grounded, use the available
search/file/code/data tools before rendering. Never copy demo values from a skeleton into a
factual artifact. If the target is `markdown`, answer in normal text instead of forcing a visual.
</critical>

**Progressive by design.** `route` is compact by default. Add `--expand` only when you need the
full guidance text in one shot; otherwise read `skillRefs` skills on demand. Do not preload every
guide.

## 2. What makes a good artifact

- Create a visual only when it materially improves understanding or a decision; one dominant view.
- For static labeled-node diagrams prefer the Mermaid template over hand-positioned SVG; use
  HTML/SVG for spatial, dynamic, or adjustable visuals.
  Do not choose Canvas merely because data is present — pick the smallest medium that fits
  (Mermaid < widget < canvas).
- The first render must be useful. Add only controls the user requested;
  never invent filter, search, reset, dashboard, or KPI panels.
  Keep presentation-only interactions local.
- Theme: always use host CSS variables or @gen-ui/canvas tokens for UI chrome; never bake one
  light/dark palette. Hardcoded #hex for UI chrome is a bug unless the art module applies.
- Use semantic HTML and native controls (button/input/select/textarea) with associated labels.
  At 320px wide, content wraps without clipping or internal scrolling.
- Give charts, SVGs, canvases, and custom widgets an accessible name; pair color encodings with
  text, shape, or line style.
- The host provides data-tooltip support backed by Floating UI and global Lucide icons; never load
  either library yourself.
- Keep data inline and artifacts below 2 MB. No fetch, XMLHttpRequest, WebSocket, or unapproved
  external resources.
- The route's content plan is a minimum completeness contract: context, dominant artifact,
  evidence/detail, source/recency, and action only when actually needed.

## 3. CLI reference

Output is always one JSON document on stdout: `{ "ok": true, … }` or
`{ "ok": false, "error": { "message" } }`; errors exit 1.

```bash
VISUAL=~/.pi/agent/extensions/generative-ui/visual-cli.ts

bun $VISUAL route '<request>' [--modules a,b] [--templates t1,t2] [--expand]
bun $VISUAL widget --title <t> (--html-file <f> | --html '<s>' | stdin)
       [--grounding '<json>' | --grounding-file <f>]
       [--width n] [--height n] [--floating] [--interactive] [--no-open]
bun $VISUAL canvas --title <t> (--tsx-file <f> | --tsx '<s>')
       [--grounding '<json>' | --grounding-file <f>]
       [--width n] [--height n] [--floating] [--interactive] [--no-open]
bun $VISUAL browse list [--limit n]
bun $VISUAL browse reopen <file> [--interactive]
bun $VISUAL browse html <file>
```

| Command | Notes |
|---------|-------|
| `route` | Auto-routes the goal; `--modules`/`--templates` are expert overrides only. Persists plan state; `--expand` adds the full guidance text to `content`. |
| `widget` | HTML fragment (no DOCTYPE/html/head/body) or raw `<svg>…</svg>`. Interactive widgets must call `window.glimpse.send` / `sendWidgetEvent` / `sendPrompt` / `sendAnnotation`. Default 800x600. |
| `canvas` | Single-file TSX, default-export the top-level component, compiled host-side (React 18, `@gen-ui/canvas`). Interactive canvases return data via `sendToAgent` / `sendPrompt`. Compile errors come back verbatim — fix the TSX and retry. Default 900x640. |
| `browse` | History is newest first. `html` on a canvas returns its **TSX source** — that is what you edit and re-render. `browse` skips plan enforcement. |

Flags: `--no-open` saves without opening a window (use when the user does not need a popup);
`--interactive` blocks until the window settles and returns the message; `--floating` keeps the
window always on top. `--title` is a short snake_case id used for the window title and saved
filename.

## 4. Grounding — required on every render

Every `widget`/`canvas` call must carry `--grounding` (inline JSON or `--grounding-file`):

```json
{ "status": "grounded",
  "evidence_scope": "Current latency evidence",
  "sources": [ { "label": "Latency report", "kind": "web",
                 "locator": "https://example.com/latency-report", "as_of": "2026-08-19" } ] }
```

- `status: "grounded"` — factual/evidence artifacts; needs ≥1 concrete source
  (`kind` = conversation | file | code | web | data; `locator` = absolute URL or file/code/
  conversation/dataset locator, no generic placeholders). The host renders a visible provenance
  footer and persists the declaration.
- `status: "not_applicable"` — creative/structural only; explain why in `evidence_scope`, no
  sources.

**Plan interplay** (this is why you run `route` first):

- Plan state lives in `<widgets>/last-plan.json` until the first render whose target matches it.
- If the plan's research is `required`, `grounding.status` must be `grounded` with concrete
  provenance — `not_applicable` is rejected.
- Evidence/structure-bearing routes reject `not_applicable`; only purely creative routes
  (illustration, ui-mockup, interactive-explainer) accept it with a reason.
- A render never steals another target's plan: while a `show_widget` plan is pending, a canvas
  render is free (and vice versa) — the plan survives for its own render. A failed render keeps
  the plan too.

## 5. Windows outlive the CLI

A short-lived bun process cannot own windows, so each render is handed to a detached holder
process (internal `__hold` command — never call it directly). Consequences:

- The window stays open after the CLI exits; the saved HTML file is the source of truth.
- `--interactive` makes the CLI block and poll until the first settling message
  (`window.glimpse.send` / `sendToAgent` payload), a window close, an error, or a 120s timeout.
  The result JSON then carries `messageData`, `event`, and `closedReason` (`"User sent data"` |
  `"Window closed"` | `"Error: …"` | `"Timeout"`). Canvas `canvas_action` traffic never settles a
  render — only real user/agent-return messages do.
- Without `--interactive` the render returns immediately with `opened: true` and any messages are
  appended to the widget's event log in the background.
- `--no-open` skips window creation entirely (`opened: false`) — the artifact is still saved and
  indexed.

## 6. Extending routing — `visual-routes.json`

Any skill subdirectory can register visual routes by shipping a `visual-routes.json` manifest
next to its `SKILL.md`. Registered routes take priority over the built-in chain; the first
matching registered route wins (load order: scan-root order, then skill directory name,
deterministic).

```json
{ "routes": [ {
  "id": "latency-report",
  "title": "Latency report",
  "target": "show_widget",
  "patterns": ["latency report", "/p9[0-9] latency/"],
  "modules": ["chart"],
  "templates": ["metric-chart"],
  "style": "analytical",
  "reason": "Latency evidence is best read as a metric chart with source captions.",
  "contentPlan": ["Scope + window", "Metric chart with units", "Source/recency caption"],
  "skillRef": "latency-reporting"
} ] }
```

| Field | Required | Values |
|-------|----------|--------|
| `id`, `title`, `reason` | yes | non-empty strings |
| `target` | yes | `markdown` \| `show_widget` \| `show_canvas` |
| `style` | yes | `editorial` \| `analytical` \| `system` \| `comparison` \| `record` \| `workflow` \| `product` \| `illustrative` |
| `patterns` | yes | non-empty; case-insensitive substring, or `/regex/` (compiled case-insensitively) |
| `modules`, `templates` | yes | arrays of non-empty strings (may be empty) |
| `contentPlan` | yes | non-empty array of strings — the minimum completeness contract |
| `skillRef` | no | defaults to the skill directory name; surfaces as `details.skillRefs` |

Scan roots (each holds one skill subdirectory): `~/.pi/agent/skills`, `~/.agents/skills`,
`<cwd>/.pi/skills`, `<cwd>/.agents/skills`. `VISUAL_SKILLS_ROOTS` (colon-separated) replaces them
entirely — tests and sandboxes use that for isolation.

Bad manifests never break routing: invalid JSON, wrong shapes, or bad regex patterns are skipped
and reported in `route` output as `details.warnings` (and the entry simply does not route).

<critical>
Progressive flow: `route` → read `skillRefs` skills → render. Match patterns describe what the
user asked for; the skill referenced by `skillRef` owns how that artifact is built and grounded.
Never expand every route guide up front, and never invent content a registered route's
contentPlan does not cover.
</critical>

## 7. Complex diagrams (Pele)

Mermaid-syntax diagrams beyond simple flowcharts are rendered with **Pele** (one UMD CDN build,
all diagram types). Pick the type by intent — full selection guide: https://pele.run/examples.md

| Intent | Syntax |
|--------|--------|
| Steps with branches / pipeline / state machine | `flowchart TD`, `stateDiagram-v2` |
| Boxes inside boxes (VPC, module map, block layout) | `block` |
| System context / containers / components | `C4Context` / `C4Container` / `C4Component` |
| OOP structure, namespaces | `classDiagram` |
| Messages over time | `sequenceDiagram` |
| Schedule / phases with dates | `gantt` |
| Schema / relations | `erDiagram` |
| Dated event history | `timeline` |

CDN usage — UMD global only, never `type="module"` / `import`; keep the source in `pre.mermaid`
and pass `el.textContent` so the text stays readable until scripts run:

```html
<pre class="mermaid">flowchart TD
  A --> B
</pre>
<script src="https://cdn.jsdelivr.net/npm/pele@1/dist/pele.global.js" onload="initPele()"></script>
<script>
function initPele() {
  for (const el of document.querySelectorAll("pre.mermaid")) pele.mount(el, el.textContent);
}
// Shell _runScripts may drop onload — poll window.pele as a fallback before timing out.
</script>
```

- `pele.mount(el, el.textContent)` renders into the container at container width and re-lays out
  on resize. `mount()` shows errors inline (color `--pele-error`) instead of throwing.
- Theme via `--pele-*` CSS variables on the container or any ancestor — map them to host tokens
  (`--pele-fg: var(--color-text-primary)`, `--pele-bg: var(--color-background-primary)`,
  `--pele-surface: var(--color-background-secondary)`, `--pele-line`, `--pele-border`,
  `--pele-muted`, `--pele-font`, `--pele-series-1..8`). Light/dark flips without re-render:
  https://pele.run/theming.md
- API: `mount(el, source, opts?) → { update(), refresh() }`; `render(source, opts?) →
  { svg, width, height, type }` (sync, throws `PeleError` — check `err instanceof PeleError`):
  https://pele.run/api.md
- The `flow-mermaid` template is exactly this Pele setup: `bun $VISUAL route '<goal>'` returns
  `templates: ["flow-mermaid"]`, or expand it with `--templates flow-mermaid`.
