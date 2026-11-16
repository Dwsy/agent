# Mermaid diagrams — Pele owns the details

Mermaid text is rendered by **Pele**. Everything about Pele itself — 选哪种图、32 种语法、
CDN/npm 接法、`render`/`mount` API、`--pele-*` 主题变量、与 Mermaid 原版的差异 — lives in the
`pele-mermaid` skill. Read it instead of guessing:

```
~/.pi/agent/skills/pele-mermaid/SKILL.md      # 入口：32 行选型表 + 必知事实
```

| 你需要 | 读 |
|---|---|
| 选哪种图、怎么写那种图的语法 | that skill's 选型表 → `/Users/dengwenyu/.pi/agent/skills/pele-mermaid/references/types/<type>.md` |
| CDN / `pele.mount` / 按需打包 | `/Users/dengwenyu/.pi/agent/skills/pele-mermaid/references/usage.md` |
| 主题变量、字体、明暗切换 | `/Users/dengwenyu/.pi/agent/skills/pele-mermaid/references/theming.md` |
| 限流、链接与图片白名单 | `/Users/dengwenyu/.pi/agent/skills/pele-mermaid/references/security.md` |
| 把 md 转成独立 .svg 文件 | `/Users/dengwenyu/.pi/agent/skills/pele-mermaid/references/cli.md` |

Only two rules land in this skill:

- In a widget, draw Mermaid with the `flow-mermaid` template (`route` returns
  `templates: ["flow-mermaid"]`). It is already the correct wiring: UMD CDN, `pre.mermaid`,
  `pele.mount(el, el.textContent)`, and a poll fallback for a dropped `onload`. Do not hand-roll a
  second Pele bootstrap.
- Theme by mapping host tokens onto `--pele-*`; never bake a palette.

## Type quick map

| Intent | Syntax |
|---|---|
| Steps with branches / pipeline | `flowchart TD` |
| State machine | `stateDiagram-v2` |
| Messages over time | `sequenceDiagram` |
| Boxes inside boxes (VPC, module map) | `block` |
| System context / containers | `C4Context` / `C4Container` / `C4Component` |
| OOP structure | `classDiagram` |
| Schema / relations | `erDiagram` |
| Schedule / phases | `gantt` |
| Dated event history | `timeline` |

The full 32-type table with links to each syntax page is in the `pele-mermaid` skill.

When the deliverable is a `.svg` **file** rather than something to look at in a window, use that
skill's CLI directly instead of routing through a widget.
