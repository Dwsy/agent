# pi-mesh

Multi-pi session awareness & communication mesh — shipped as one pi extension.

Every pi instance on the machine registers with a local hub daemon. Users and
agents can see peer states, file activity, git grouping, transcript history,
exchange messages, resume dead sessions into herdr workspaces, and open live
terminals — all without a single extra tool being registered into any pi.

## Design principles

1. **Zero tools.** No tool is registered into any pi. The capability surface is
   the progressive skill `skills/pi-mesh` plus the `mesh` CLI.
2. **Passive hub.** The hub only maintains the registry, routes pushes, and
   reads session files. It spawns a process only when the user explicitly
   triggers resume / new session / terminal.
3. **Identity continuity.** Resuming a session is "the same session coming
   back alive", not a new one.
4. **State changes semantics, not position.** Peers are always sorted by
   `startedAt` (+ `sessionId`), never by heartbeat — heartbeats must not
   reshuffle the list.
5. **Workbench, not dashboard.** Two-pane layout, row lists, persistent detail;
   no card streams, no modal drawers.
6. **Delete over add.** Prefer structure over labels, subtitles, decoration.

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

Identity model: one peer record per pi session (`sessionId` == session JSONL).
State: `running | waiting | offline | closed` (heartbeat-derived; closed/offline
retained `retentionDays`, default 7). Reviving a session reuses the record.

## Quick start

```sh
# Run from this directory. Bun ≥ 1.1, Node ≥ 18.
bun test                       # full suite — must be green before any handoff
bun src/hub/daemon.ts --home <dir>   # run hub against a scratch home
bun src/cli.ts peers --all           # talk to the running hub
```

The live hub for this machine runs in tmux session `pi-mesh-hub`
(`bun src/hub/daemon.ts --home /Users/dengwenyu`). It does not hot-reload —
restart it after changing hub code.

## Capability surface (CLI)

```sh
MESH="bun src/cli.ts"
$MESH peers [--all|--table]        # discover peers
$MESH files <prefix>               # file activity
$MESH history <prefix> --limit 20  # transcript history
$MESH send <prefix> --mode steer|followUp "..."
$MESH resume <prefix> [--fork]     # resume into a herdr workspace
$MESH follow|unfollow <prefix>     # state-change notifications
$MESH cancel <prefix>              # abort a peer's current run
$MESH web [--no-open]              # open the WebUI
```

Session ids accept any unique prefix (prefer a slice into the unique tail).

## WebUI

Session Workbench: two-pane layout — left `SessionList` (360–720px draggable)
plus right `DetailPane` with three tabs: 会话 / 变更 / 终端. State filter has
only four values: 全部 / 在线 / 离线 / 已关闭. Online includes running + waiting.
Sorting is stable by `startedAt` + `sessionId`, never heartbeat.

Breakpoints: ≥1180 two columns; 900–1179 list full-width + floating detail;
<900 single column; 390 bottom tab bar.

## Non-goals

- SSH cross-machine mesh (protocol reserves `machineId`, not done before Phase 5)
- Auto resume (resume must be a human decision)
- Filesystem watcher (only `edit`/`write` tool calls count)
- Multi-user / auth (single machine, single user; 127.0.0.1 is the boundary)
- TUI messaging / mouse

## Documentation

`docs/` is the design space; code is the truth, docs explain why.

| Doc | When to read |
|---|---|
| `docs/architecture.md` | protocol, state machine, data flows, adding a request type |
| `docs/design.md` | product shape, interaction model, decisions + rejected alternatives |
| `docs/style.md` | visual language, components, copy, code/test style |
| `docs/ux-verify/VERDICT.md` | real-browser acceptance history + screenshot index |
| `docs/ux-rework-spec.md` | original Session Workbench spec (historical baseline) |
| `AGENTS.md` | module map, commands, coding/testing rules, landmines |

`docs/ux-*` is frozen evidence: append new rounds, never rewrite old verdicts.

## Runtime constants

| Item | Value |
|---|---|
| heartbeat interval | 15s |
| offline threshold | 45s (≥3× heartbeat, enforced by config validation) |
| retention | 7 days (offline/closed) |
| ephemeral purge | 10 min silence |
| files per peer | 50 (newest first) |
| resume lease TTL | 60s |
| persist debounce | 500ms |
| HTTP bind | 127.0.0.1 |
| max files per peer | 50 |

## Security

- HTTP binds to `127.0.0.1` only; control mode equals local shell access.
- Notifications/toasts carry identity only, never transcript content.
- Session JSONLs may contain secrets typed into pi; history is sanitized,
  review is read-only.
- Server-rendered markdown is not a trust boundary — satteri passes raw HTML
  through verbatim; the browser-side sanitize (DOMPurify) is the boundary.

## License

Private. Part of the `~/.pi` agent home.
