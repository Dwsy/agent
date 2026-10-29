---
name: gapp
description: Create, modify, and operate Glimpse-APPs via the gapp-cli bun script — bundle layout, tools.json/tools.mjs authoring contract, progressive domain-tool calls, and native-feel WebView UI.
---

# GAPP agent skill

Two jobs: **authoring** (create/modify a GAPP) and **operating** (call a GAPP's domain tools). All operations run through `bun gapp-cli.ts` (see §5); the system prompt carries only the app id list.

## 1. Bundle layout — who writes what

A GAPP lives at `<cwd>/.pi/gapp/<id>/` (project) or `~/.pi/gapp/<id>/` (global):

| File | Written by | Purpose |
|------|-----------|---------|
| `meta.json` | `gapp-cli upsert` | id/name/scope/enabled/instances |
| `state.json` | `gapp-cli upsert` + every tool call | **SSOT** — the only thing the UI renders |
| `index.html` | `gapp-cli upsert` | render layer; reads state, never fetches disk |
| `tools.json` | **you, by hand** | tool catalog `{ "tools": [...] }` |
| `tools.mjs` | **you, by hand** | `gappToolHandlers` — runs in Host Node |
| `tui.mjs` | optional | terminal renderer |

<critical>
`gapp-cli upsert` writes **only** `meta.json`, `state.json`, `index.html`. It never creates
`tools.json` or `tools.mjs`. Domain tools are app-owned files you must write yourself.
`bun gapp-cli.ts tools <id>` discovers tools from `tools.json` on disk — no file, no tools.
</critical>

Authoring order: write `tools.json` + `tools.mjs` → `gapp-cli upsert` (html) → `gapp-cli tools <id>` → `gapp-cli call`.

## 2. `tools.mjs` contract

Export `gappToolHandlers`; each handler takes `{ state, arguments, context }` and **must** return `{ state, result? }`:

```js
export const gappToolHandlers = {
  refresh({ state, arguments: args }) {
    return { state: buildState(), result: { ok: true } };
  },
};
```

- It runs in the **Host Node process**, so it may read the filesystem/git — that is how a GAPP shows live data instead of hardcoded values.
- Returned `state` replaces `state.json` and is pushed to any open window automatically.
- A handler that throws surfaces as `handler_error` to the caller.

## 3. `tools.json` contract

```json
{ "tools": [ { "name": "refresh", "description": "Re-read from disk.", "inputSchema": { "type": "object", "properties": {} } } ] }
```

`name` (valid identifier), non-empty `description`, and an object `inputSchema` are required — an invalid entry is silently dropped from the catalog.

## 4. Sharing one implementation with the UI

The window gets `window.__GAPP_TOOLS_MODULE_URL__`. Import it so WebView, TUI, Host, and `gapp_call` run the same code:

```js
const mod = await import(window.__GAPP_TOOLS_MODULE_URL__);
const out = mod.gappToolHandlers.refresh({ state: GappStore.get(), arguments: {} });
GappStore.replace(out.state);
```

Render from state only. If state is empty on first paint, call the tool once, then `GappStore.subscribe(render)`.

## 5. Operating an existing GAPP — the CLI

All operations go through one bun script (no `gapp_*` tools are registered):

```bash
GAPP=~/.pi/agent/extensions/generative-ui/gapp/gapp-cli.ts
bun $GAPP list [--online|--all]          # app list (index refs valid elsewhere)
bun $GAPP tools [id]                     # domain tool catalog ← REQUIRED before call
bun $GAPP call <id> <tool> --args '{…}'  # run a domain tool (preferred write path)
bun $GAPP get-state <id>                 # read state.json (SSOT)
bun $GAPP set-state <id> --state '{…}' [--merge]   # fallback when no tool fits (--merge = top-level key merge, NOT numeric increment)
bun $GAPP open <id>                      # open window (daemon-owned)
bun $GAPP reload <id> [--window]         # hot reload after editing tools.mjs/html
bun $GAPP upsert --name <n> --html-file <f> …      # create/update bundle
bun $GAPP set-status <id> --disable|--archive      # lifecycle
```

Add `--cwd <path>` when operating outside the app's project; add `--local` to skip the daemon (disk only). Output is one JSON document on stdout.

<critical>
Every output carries `dir` (the bundle path). **If `tools` returns `[]`, the app is renderer-only — that is NOT a cwd/path error.** Fall back to `get-state`/`set-state`. Never `fd`/`find` the filesystem to locate a bundle; `list` output already contains each app's `dir`.
</critical>

**Empty `tools` has three distinct readings — check `hasToolsJson` + `note`:**

| Output | Meaning | Action |
|--------|---------|--------|
| `hasToolsJson: false` + note | renderer-only app (no tools.json) | `get-state`/`set-state` fallback |
| `hasToolsJson: true`, `tools: []` | tools.json entries invalid (missing name/description/inputSchema) | fix tools.json |
| `GAPP not found` error | wrong id | `bun $GAPP list` for valid ids |

Id resolution scans **all registered projects** (the gapp registry), not just the session cwd — an app from another project resolves fine without `--cwd`.

**Progressive flow: never invent domain tool names.** See app → `bun $GAPP tools <id>` → `call` → `get-state`/`set-state` fallback → `upsert`/`open`.

Prefer `call` over `set-state`: a tool recomputes state from truth, a hand-written state blob goes stale.

### Inbound

- `[GAPP event]` → re-read with `get-state` or `tools`+`call`, then report briefly.
- `[GAPP generate]` → main session; **content only**, no chit-chat.

## 6. Hot reload

Editing `tools.mjs` does **not** need a daemon restart:

- The next tool call re-executes the file automatically once its mtime changes.
- `bun $GAPP reload <id>` (or `POST /v1/gapp/apps/:id/reload`) forces a re-execute
  even when the mtime is unchanged.
- `bun $GAPP reload <id> --window` also rebuilds the live window — use it after
  `index.html` / `meta.json` / `state.json` edits.

Bun keys its module cache by resolved path and ignores URL query strings, so a
plain `import(url + "?mtime=…")` keeps returning the first-loaded copy forever.
`app-module.ts` owns that invalidation; never re-introduce a raw dynamic import
of app-owned files.

## 7. Gotchas

- `upsert` requires html (`--html-file` / `--html`); you cannot update state alone. Omitting state preserves the existing `state.json`.
- Never inline large data as `state` — have `tools.mjs` compute it from disk and call the tool instead.
- `instances: "single"` refuses to open if another session holds the window (`already_connected`). Use `--no-open` and open later.
- `state.json` is the contract between renderer and tools. Keep it small and render-ready; drop fields the UI does not draw.

## 8. Native-feel WebView UI

A GAPP is a WebView inside a native window — apply native-feel **T1 (the rendering-surface seam)** and **T3 (adopt the platform; don't compete)**:

- Leave title bars, traffic lights, notifications, and confirmations to the Host/OS; do not fake them in HTML or add web toasts/modal scrims.
- Use Host theme variables, `color-scheme: light dark`, and system fonts; never hardcode brand accents, window shadows, or window rounding.
- No `cursor: pointer` on rows/buttons; only editable content is selectable; keep native scrolling, no JS smooth scrolling.
- No route fades, skeletons, or decorative spring motion; honor `prefers-reduced-motion` and give controls a pressed state.
- Semantic HTML, visible `:focus-visible`, every action keyboard reachable, Escape cancels the current transient UI.
- The only exception is a GAPP explicitly built as a desktop/window simulator (e.g. Nova Launchpad): simulated chrome is content, not GAPP chrome.
