# CLI reference

Everything runs through `bun visual-cli.ts`. Output is always one JSON document on stdout:
`{ "ok": true, … }` or `{ "ok": false, "error": { "message" } }`; errors exit 1.

```bash
VISUAL=~/.pi/agent/extensions/generative-ui/visual-cli.ts

bun $VISUAL route '<request>' [--modules a,b] [--templates t1,t2] [--expand]
bun $VISUAL widget --title <t> (--html-file <f> | --html '<s>' | stdin)
       [--grounding '<json>' | --grounding-file <f>]
       [--width n] [--height n] [--floating] [--interactive] [--no-open]
bun $VISUAL canvas --title <t> (--tsx-file <f> | --tsx '<s>')
       [--grounding '<json>' | --grounding-file <f>]
       [--width n] [--height n] [--floating] [--interactive] [--no-open] [--lang zh-Hans]
bun $VISUAL browse list [--limit n]
bun $VISUAL browse reopen <file> [--interactive]
bun $VISUAL browse html <file>
```

| Command | Notes |
|---------|-------|
| `route` | Auto-routes the goal; `--modules`/`--templates` are expert overrides only. Persists plan state; `--expand` adds the full guidance text to `content`. |
| `widget` | HTML fragment (no DOCTYPE/html/head/body) or raw `<svg>…</svg>`. Interactive widgets must call `window.glimpse.send` / `sendWidgetEvent` / `sendPrompt` / `sendAnnotation`. Default 800x600. |
| `canvas` | Single-file TSX, default-export the top-level component, compiled host-side (React 18, `@gen-ui/canvas`, Tailwind v4 utilities). Tailwind CSS is generated statically from literal class names in the TSX at compile time. Interactive canvases return data via `sendToAgent` / `sendPrompt`. Compile errors come back verbatim — fix the TSX and retry. Default 900x640. |
| `browse` | History is newest first. `html` on a canvas returns its **TSX source** — that is what you edit and re-render. `browse` skips plan enforcement. |

Flags: `--no-open` saves without opening a window (use when the user does not need a popup);
`--interactive` blocks until the window settles and returns the message; `--floating` keeps the
window always on top. `--title` is a short snake_case id used for the window title and saved
filename.

## Choosing the medium

| Command | Input | Use when |
|---|---|---|
| `widget` | HTML fragment or raw `<svg>` | One static or lightly interactive visual. Host CSS variables, host theme. |
| `canvas` | Single-file TSX (React 18) | Stateful or composed UI: dashboards, diff review, forms, task lists. |

Pick the smallest medium that fits: Mermaid-in-widget < widget < canvas. Data alone does not
justify a canvas.

## Widget specifics

- A fragment has no `<html>`/`<head>`/`<body>`; the host wraps it in a card and provides the page
  background.
- Interactivity goes through the host bridge: `window.glimpse.send`, `sendWidgetEvent`,
  `sendPrompt`, `sendAnnotation`. A widget that calls these returns data to the agent.
- `window._themeVars()` returns `{dark, text, textSecondary, bg, bgSecondary, border, chartTick,
  chartGrid}` when present — use it to resolve a theme at runtime instead of baking one.
- The host injects Floating UI (tooltips) and Lucide (icons) globally. Never load either yourself.

## Canvas specifics

- Default-export the top-level component; the host compiles it.
- SDK primitives plus `useHostTheme()` keep it in the host theme. Full prop signatures live in
  `references/sdk.md` (generated closed export list); read it before using an unfamiliar component.
- `--lang zh-Hans` sets the saved document's `lang` so CJK text uses the right glyph shapes.
  It is optional and defaults to no `lang` attribute.
- Tailwind utilities can be used in `className`. They are compiled into static CSS from the raw TSX source, so class names must appear as literals; no CDN or runtime JIT is involved. Preflight is disabled, and colors must still use host CSS variables or SDK tokens. `dark:` follows `prefers-color-scheme`. SDK primitives accept `style` instead of `className`, so apply utilities to plain DOM elements.
- Return data with `sendToAgent` / `sendPrompt`.

## Browse

`browse list` shows the history newest first. `browse html <file>` on a canvas returns the TSX
source — that is the thing to edit and re-render, not the compiled output. `browse` never enforces
a plan, so it is the way to reopen a saved artifact without triggering grounding checks.
