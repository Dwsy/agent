---
name: pi-mesh
description: "Multi-pi session awareness (pi-mesh). Discover peer pi sessions on this machine, check their state (running/waiting/offline), git branch & worktree grouping (pi 分组), recent file activity (pi 文件活动), and transcript history; send a message to another pi (steer or followUp, pi 互发消息), cancel its run, or follow/unfollow peers for state-change notifications (关注/取关). Use when the user wants to collaborate with another pi instance or mentions: multi-pi, pi mesh, peer pi, other pi sessions, pi 状态, pi 互发消息, pi 分组, pi 文件活动, pi 关注. Registers no tools; everything goes through the mesh CLI described here."
---

# pi-mesh — talk to other pi sessions

One job: inspect peer pi sessions on this machine and drive them. No tools are
registered for this — everything runs through the `mesh` CLI. If it prints
`hub not running`, the mesh daemon is down: tell the user, retry once later.

Set once at the top of your shell work:

```bash
MESH="bun /Users/dengwenyu/.pi/agent/extensions/pi-mesh/src/cli.ts"
```

(If this skill moved, the CLI is at `<skill-dir>/../../src/cli.ts`.)

## Discover peers

Every command prints JSON by default, so pipe into `jq`. Add `--table` for
aligned columns meant for human eyes.

```bash
$MESH peers              # JSON: running peers only, full PeerView[]
$MESH peers --all        # JSON: include waiting / offline / closed peers
$MESH peers --table      # human table: session, state, pid, branch, ...
```

`SESSION` in the `--table` view is the **last** 8 chars of the id — session ids
share a timestamp prefix (`01a18bb1-…`), so the tail is what distinguishes them.

Wherever a `<sessionIdPrefix>` is expected, any unique prefix of the session id
works. Because the leading chars are a shared timestamp, prefer a slice that
reaches into the unique tail (e.g. `01a18bb1-63f1`), otherwise the prefix is
ambiguous. An ambiguous prefix prints the candidates — retry with a longer one.
Group peers by `git.branch` / `git.worktree` / `git.commonRoot` to find sessions
working in the same repository.

## Inspect a peer

```bash
$MESH files <sessionIdPrefix>               # JSON FileActivity[], newest first
$MESH files <sessionIdPrefix> --table       # human rows
$MESH history <sessionIdPrefix> --limit 20  # JSON TranscriptEntry[]
$MESH history <sessionIdPrefix> --table     # human rows
```

Read history/files before messaging a peer so you address what it is actually
doing.

## Message another pi

```bash
$MESH send <sessionIdPrefix> --mode steer "look at src/foo.ts first"
$MESH send <sessionIdPrefix> --mode followUp "when free, summarize the diff"
```

- `steer` — interrupt-ish: delivered before the peer's next model call. Use for
  urgent corrections that should shape the peer's current work.
- `followUp` — queued and delivered after the peer's current run settles. Use
  for non-urgent asks.

The command prints `{ ok, targetSessionId, mode, disposition }`, where
`disposition` is `started` / `queued` / `handled`. Sending a message auto-follows
the target (see below); `$PI_SESSION_ID` (set by pi's bash tool) identifies this
session as the sender.

## Resume a session in its own herdr workspace (恢复)

```bash
$MESH resume <sessionIdPrefix>                 # reopen in a dedicated herdr workspace
$MESH resume <sessionIdPrefix> --fork          # fork into a new conversation
$MESH resume <sessionIdPrefix> --print         # show the commands only
```

- Works for `offline` / `closed` peers; live peers are refused (a hub CAS
  lease arbitrates concurrent resumes of one session file — no double-open).
- Creates (or reuses) a herdr workspace `pi-<tail8>` running `pi --session`;
  requires `herdr` on PATH.
- The resumed pi re-registers as the SAME session (identity is continuous);
  lineage shows up in `resumptions` on the peer record.

## Follow / unfollow peers (关注)

State-change notifications only reach you for peers you follow:

```bash
$MESH follow <sessionIdPrefix>    # 关注: get notified on state changes
$MESH unfollow <sessionIdPrefix>  # 解绑关注
```

- Sending a message auto-follows the target; `unfollow` detaches.
- A followed peer changing state (running / waiting / offline / closed) lands
  in this session as a hidden note plus a UI toast — no turn is triggered.
- The acting session is `$PI_SESSION_ID` (pi bash tool sets it) or
  `--from <sessionId>`.

## Cancel a peer's run

```bash
$MESH cancel <sessionIdPrefix>
```

Aborts the peer's current agent run (like pressing Escape in that session).

## Peer states

- `running` — an agent run is streaming right now.
- `waiting` — idle, heartbeating normally.
- `offline` — heartbeat lost (process gone or hub unreachable). Shown after
  ~3x the heartbeat interval (45s by default).
- `closed` — session ended. Kept for 7 days for history, configurable via
  `retentionDays` in `~/.pi/pi-mesh/config.json`.
