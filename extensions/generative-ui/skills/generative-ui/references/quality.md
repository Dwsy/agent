# Artifact quality — what makes a good visual

- Delivery is done at `ok: true`: the host already compiled the TSX or validated the HTML, and
  compile errors come back verbatim. Do not screenshot or re-open the window to confirm a render
  you just made — that spends tokens re-reading a result the CLI already proved. Look at the
  window only when the user reports a defect or the artifact feeds a decision.

- Create a visual only when it materially improves understanding or a decision; one dominant view.
- For static labeled-node diagrams prefer the Mermaid template over hand-positioned SVG; use
  HTML/SVG for spatial, dynamic, or adjustable visuals.
  Do not choose Canvas merely because data is present — pick the smallest medium that fits
  (Mermaid < widget < canvas).
- The first render must be useful. Add only controls the user requested;
  never invent filter, search, reset, dashboard, or KPI panels.
  Keep presentation-only interactions local.
- Omit any section, chart, or table that has no data — never render an empty state,
  placeholder text, a "No data" message, or an empty chart frame.
- Show each dataset once: no second chart form, repeated table, or background band
  encoding the same values.
- Built-in charts render their own legend (2+ series; `PieChart` always). Do not add a
  second one; `references/sdk.md` lists the exact chart signatures.
- Leave no empty child in a flex or grid container; toggle `hidden` together with its content.
- Pre-delivery self-check: one dominant element, variety in composition, and a scan for
  gradients / shadows / emoji / rainbow / identical card walls / decorative colored borders.
- Theme: always use host CSS variables or @gen-ui/canvas tokens for UI chrome; never bake one
  light/dark palette. Hardcoded #hex for UI chrome is a bug unless the art module applies.
  Canvas TSX may use Tailwind utilities for layout/spacing/typography, but colors must still come
  from host tokens (e.g. `bg-[var(--color-background-secondary)]`).
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

## Choosing between the three visual families

| Family | Best for | Cost |
|---|---|---|
| Mermaid (in a widget) | A labeled graph: flow, state, sequence, schema. Auto layout. | Syntax must be valid; no custom geometry. |
| Hand-drawn `<svg>` | Spatial or mechanical things: a request path through a cache, a cross-section, a hierarchy. | Coordinate math; easy to get wrong. |
| Canvas (TSX) | Stateful, composed UI: dashboards, diff review, forms, task lists. | Heaviest; needs React and host primitives. |

The route picks the family. Override only when the route's choice is plainly wrong, and say why
in the artifact.

## Step-through UI

The host ships a step mechanism. Use it instead of writing stepper JavaScript.

```html
<div data-steps>
  <ol data-step-captions>
    <li>First: request arrives</li>
    <li>Second: stock checked</li>
    <li>Third: stock reserved</li>
  </ol>
  <div data-step="1">Request queued</div>
  <div data-step="2">Checking stock</div>
  <div data-step="3">Stock reserved</div>
  <div data-step-in="1 3">Visible from step 1 onward</div>
  <div data-step-controls>
    <button data-step-prev aria-label="Previous step">‹</button>
    <button data-step-next aria-label="Next step">›</button>
    <input type="range" aria-label="Step">
  </div>
</div>
```

| Attribute | Meaning |
|---|---|
| `data-steps` | On the container. Makes it a stepper. |
| `data-step="N"` | On an element. Visible only while step N is current. |
| `data-step-in="1 3"` | On an element. Visible from its first listed step onward (sticky). Gets `.is-current` while one of its steps is active, `.is-reached` once it is behind. |
| `data-step-captions` | On a list. Its `<li>` children map onto the sorted step numbers; the current one gets `.is-current` and `aria-current="step"`. |
| `data-step-prev` / `data-step-next` / `data-step-play` | On buttons. The runtime wires them and manages the disabled state. `data-step-play` auto-advances every 3.5s. |
| `data-step-open="N"` | On the container. Which step to open on. Default: the first. |

The runtime themes itself from host tokens (`--color-*`). Restyle by overriding
`[data-step-controls]`, `[data-step-captions]`, or the `.is-current` / `.is-reached` classes.

**Degradation**: the container only hides non-current steps after the runtime initialises
(`is-steps-ready` class). If the script never runs, every step stays visible — so never hide
content by hand and never rely on the hiding to carry meaning on its own.

**No JavaScript needed.** Do not write a stepper by hand; the runtime handles state, the disabled
buttons, the range sync, and the play loop.

## Anti-patterns

- Hand-placing a flowchart in SVG when Mermaid's layout engine would get it right for free.
- A rainbow of node colors used for decoration rather than meaning.
- Inventing plausible numbers to fill a chart skeleton. Retrieve them or leave the slot empty.
- Building a dashboard nobody asked for because the tool can.
