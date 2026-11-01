# AGENTS.md — pi-mesh

Multi-pi session awareness & communication mesh, shipped as one pi extension.
Every pi instance on the machine (and, later, remote ones) registers with a hub
daemon; users and agents can see peer states, file activity, git grouping,
transcript history, exchange messages, resume dead sessions into herdr
workspaces, and open live terminals — all without a single extra tool being
registered into any pi.

## Docs

`docs/` is the design space; code is the truth, docs explain why. Read before
changing the matching layer, and update the same change when a contract, module
or hard rule moves.

| Read | When |
| --- | --- |
| `docs/architecture.md` | protocol, state machine, data flows, adding a request type |
| `docs/design.md` | product shape, interaction model, decisions + rejected alternatives |
| `docs/style.md` | visual language (canonical), components, copy, code/test style |
| `docs/ux-verify/VERDICT.md` | real-browser acceptance history and screenshot index |
| `docs/ux-rework-spec.md` | the original Session Workbench spec (historical baseline) |

`docs/ux-*` is frozen evidence: append new rounds, never rewrite old verdicts.

## Architecture

```text
pi extension (index.ts, zero tools)          mesh CLI (src/cli.ts)
  hooks: heartbeat / file activity /           peers files history send
         message+cancel pushes                 cancel follow resume
  skill: skills/pi-mesh (progressive)          /mesh TUI overlay (command.ts)
        │ JSONL over unix socket / named pipe        │
        └──────────────┬─────────────────────────────┘
                       ▼
   hub daemon (src/hub/daemon.ts)  ~/.pi/pi-mesh/mesh.sock
     server.ts   request router + push routing (deliver_message/cancel)
     registry.ts peers, follow graph, resume CAS leases, 7-day retention
     http.ts     REST + SSE + static + /vendor/ (node_modules)
     terminal.ts WS bridge to `herdr terminal session` (JSONL verbatim)
     markdown.ts satteri + expressive-code + mermaid → history HTML
     review.ts   session JSONL → changed-file tree + diffs
                       │
        WebUI (src/hub/public/) — Tailwind + Alpine + Lucide, no build step
        herdr (workspace/agent/terminal/notification) — external binary
```

Identity model: one peer record per pi session (sessionId == session JSONL).
State: `running | waiting | offline | closed` (heartbeat-derived; closed/offline
retained `retentionDays`, default 7). Reviving a session reuses the record.

## Module map

| Path | Responsibility |
| --- | --- |
| `index.ts` | Extension entry: `/mesh` command + `resources_discover` skill + hooks. Registers **zero tools** (hard requirement). |
| `src/protocol.ts` | **SSOT** wire/domain contract (HubRequest/HubPush/PeerView/…, HTTP+WS API comment). Change here first, everything derives. |
| `src/config.ts` | `~/.pi/pi-mesh/config.json` load + fail-fast validation. |
| `src/client.ts` | MeshClient: JSONL request/response + push handling + reconnect. |
| `src/hooks.ts` | pi lifecycle: register, heartbeat, edit/write activity, inbound pushes, truthful `persistence` self-report. Hub problems must never break a session. |
| `src/ensure-hub.ts` | Hub autostart: socket probe → detached `bun daemon.ts --home` → poll; never throws. |
| `src/git-info.ts` | repo / worktree / branch resolution; non-git cwd yields all-null info. |
| `src/command.ts`, `src/mesh-panel.ts` | `/mesh` interactive TUI overlay (`ctx.ui.custom`). |
| `src/cli.ts` | `mesh` CLI. JSON output by default, `--table` for humans. |
| `src/webui.ts` | `mesh web` opener: config port → ensure hub → HTTP probe → platform opener (`--no-open` skips the browser). |
| `src/resume.ts` | herdr orchestration: resume/fork into a workspace, CAS-guarded; `findHerdrHost` resolution (resume-link → agent match). |
| `src/notify.ts` | herdr notifications for followed peers (identity only, no transcript). |
| `src/hub/*` | The daemon side (see diagram). `transcript.ts` reads session JSONL; `markdown.ts` renders history HTML; `terminal.ts` bridges the WS terminal to herdr; `review.ts` turns session tool-calls into a changed-file tree + unified diffs. |
| `src/hub/public/` | WebUI. `app.js` keeps pure helpers at top level for testability. `review.{js,css}` is the self-contained review module (`window.PiMeshReview`). `cdn/` holds pinned tailwind/alpine/lucide for offline start. |
| `skills/pi-mesh/SKILL.md` | The ONLY capability surface for models (progressive skill, CLI-driven). |

## Commands

Run from this directory. Runtime is Bun (≥1.1); the pi extension itself is
loaded by pi's jiti (no build step anywhere).

```sh
bun test                       # full suite — must be green before any handoff
bun test test/registry.test.ts # one suite ('./' prefix not needed here)
node --check src/hub/public/app.js   # WebUI JS sanity (no bundler exists)
bun src/hub/daemon.ts --home <dir>   # run hub against a scratch home
bun src/cli.ts peers --all           # talk to the running hub
```

Live hub for this machine runs in tmux session `pi-mesh-hub`
(`bun src/hub/daemon.ts --home /Users/dengwenyu`). Restart it after changing
hub code — the daemon does not hot-reload.

## Coding rules

- TypeScript ESM; relative imports carry the `.ts` extension; tabs, double
  quotes; match the surrounding file exactly.
- KISS / YAGNI / guard clauses at boundaries / fail fast with explicit errors.
  Comments explain *why*, never *what*.
- No npm dependencies unless established and justified (current: `ws`,
  `satteri` + `satteri-expressive-code` + `@xingwangzhe/satteri-mermaid`,
  `@wterm/dom` + `@wterm/ghostty`, `dompurify`, `@pierre/diffs` + `diff`).
  Prefer porting small logic over adding packages. Import-map entries point at
  `/vendor/...` — note `hast-util-to-html` must resolve to the NESTED copy
  under `@pierre/diffs/node_modules` (version skew with the hoisted one).
- WebUI: no build step. Bare specifiers resolve through the `<script
  type="importmap">` in `index.html` to `/vendor/<pkg>/...` (served from
  node_modules by `http.ts`). Lazy-load heavy stacks (wterm, sanitizer) on
  first use.
- Theming: every color goes through CSS custom properties (`--bg`, `--panel`,
  `--border`, `--text`, `--muted`, `--accent`, `--running/--waiting/
  --offline/--closed`). Never hard-code hex in markup/JS. Light is the default
  theme; `data-theme="light|dark"` + localStorage `pi-mesh.theme`.
- UI hard rules (canonical: `docs/style.md`): Lucide-only icons, never emoji;
  zero native `<select>`/checkbox chrome; fade-only motion (100–120ms, one
  animation system per element); every colour through a CSS variable.
- XSS policy: everything interpolated into the DOM passes `esc()` unless it is
  sanitized HTML (`DOMPurify.sanitize`, the boundary for server-rendered
  markdown — satteri passes raw HTML through verbatim).
- The hub stays passive: process spawning is limited to the scoped,
  user-initiated resume/terminal flows (`herdr`/`pi` only). No watchers, no
  auto-resume, no daemons inside the daemon.

## Testing rules

- `bun test` is the gate; a change without a test is not done. Assert the
  positive path; an empty result set must not pass.
- Hub/daemon tests use `mkdtempSync` homes (`--home`), **never** the real
  `~/.pi/pi-mesh`. Point `HOME` at the temp dir when spawning the CLI.
- Never run mutating `herdr` commands against real workspaces in tests; use
  fakes (`HerdrApi` seam in `resume.ts`) or throwaway workspaces created and
  closed within the test.
- WebUI tests are static-contract + extracted pure-helper behavioural tests
  (see `test/webui.test.ts`); `node --check` on `app.js` after every edit.

## Landmines (learned the hard way)

1. **Raw bytes ≠ strings.** Terminal mouse payloads contain bytes ≥128; base64
   them latin1-style (`btoa(String.fromCharCode(...))`), never via a UTF-8
   encoder — silent corruption kills all mouse input.
2. **Never sort by `lastHeartbeat`.** Per-peer heartbeat ticks reshuffle lists
   constantly. Order by `startedAt` (+ sessionId tiebreak) — registry, TUI and
   WebUI all do.
3. **`execFileSync` deadlocks** when the same process must answer a socket the
   child talks to. Use `promisify(execFile)` whenever in-process clients are
   involved.
4. **YAML frontmatter `description` containing `": "` must be quoted** or the
   skill fails to load ("Nested mappings are not allowed…").
5. The npm package named `wterm` is a squatted placeholder (0.0.1 "TEST") —
   the real terminal stack is `@wterm/dom` + `@wterm/ghostty` (+ `@wterm/core`).
   `satteri` is pinned to 0.10.x (`@xingwangzhe/satteri-mermaid` peer range).
6. `herdr terminal session` wire protocol is undocumented: JSONL both ways —
   in: `terminal.input` (base64 `bytes`), `terminal.resize` (cols/rows),
   `terminal.scroll` (direction/lines — mutates shared pane scroll),
   `terminal.release`; out: `{"bytes": b64}` + `terminal.closed`. Probe unknown
   fields via serde errors on a throwaway pane only.
7. Session JSONLs contain secrets typed into pi. Transcripts never enter
   notifications; history rendering is sanitized; the WebUI binds 127.0.0.1.
8. Browser paint pumps (wterm/rAF) stall while `document.hidden` — an attach
   made in a backgrounded tab can show an empty viewport even though the
   frames arrived. Always flush on `visibilitychange`→visible (see the
   `_termVisibilityHandler` pattern) and mount UI only after its host has
   real, non-zero bounds.
9. **ANSI text inside terminal output is not a mode change.** Scanning whole
   frames for `ESC[?1003h` let displayed text poison the mouse-tracking state
   (clicks degraded to selection, wheel to PgUp/Dn). Scan only the frame's
   state prologue, and never let untrusted tracking hijack the encoding path.
10. **Invalid Lucide names break hydration guards.** `panel-open` does not
    exist; the guard stayed true and `createIcons` re-ran forever (120%+ CPU,
    modal freeze). Validate icon names and assert the hydration pass runs once.
11. **Never run CSS keyframes and Alpine `x-transition` on the same element** —
    the inline `scale()` replaces the static `translateX(-50%)` and the popup
    lands 280px off (or invisible). One motion system per element. Likewise,
    row `⋯` and right-click menus must not share one state variable: they both
    opened at the same pixel (P1 double-menu bug).
12. `ctx.ui.custom` sizing lives in `overlayOptions` (`width`, `maxHeight`,
    `anchor`), not at the top level — top-level keys are silently ignored and
    the overlay falls back to its default size.
13. **Never `unref()` a timer a CLI must wait on.** `mesh web` cold-starts the
    hub and awaits sleeps; with an unref'd timer the bare CLI had no live
    handle, exited 0 mid-wait and printed nothing. `ensure-hub.ts`'s `sleep`
    is ref'd on purpose — do not "optimize" it back.

## Parallel-agent lanes

When several agents work here concurrently, assign disjoint file ownership
(e.g. "terminal section of `app.js`" vs "new `review.*` files only"), targeted
`edit` calls only — never full-file rewrites of shared files.
