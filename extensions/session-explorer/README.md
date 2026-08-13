# Session Explorer

Browse, search and read past coding-agent sessions in a local web UI.

Pi keeps every session as a JSONL transcript under `~/.pi/agent/sessions/`.
After a few thousand of them that history stops being usable: you know you
solved something two months ago but not which project, which day, or which of
the 7,000 files it is in. This turns that pile into something you can search in
milliseconds and actually read.

```
/explorer
```

The command starts a server on `127.0.0.1` and opens a browser. `/explorer 7788`
pins the port; `/explorer --no-open` just prints the URL.

## What it does

**Search across every message, including Chinese.** Full-text search runs over
message content, not just session titles, and returns the matching line with the
term highlighted. Clicking a result opens that session scrolled to that exact
message.

**Read a transcript as a conversation.** Two thirds of a raw transcript is tool
output sitting far from the call that asked for it. Here each call collapses to
one scannable line — the tool name plus the argument that identifies it, such as
`read src/server.ts` — and expands to show arguments and output on demand.
Reasoning blocks fold the same way. Compactions, branch points and model
switches appear as quiet rules so the timeline stays honest.

**Filter down to what you meant.** By project, by model, by time window, sorted
by recency, message count, cost or tokens.

**Read Codex sessions too.** Pi's index also covers `~/.codex/sessions/`, so
those transcripts appear in the list and in search. They are parsed from their
own format and marked with a `Codex` badge.

Keyboard: `/` or `⌘K` focuses search, `j` / `k` move through results, `Esc`
clears or closes. The URL carries the full view, so a reload or a shared link
lands in the same place.

## How it works

Pi already maintains a SQLite index of its sessions at
`~/.pi/agent/sessions/sessions.db`, including an FTS5 table over message text.
This extension reads it — read-only, never writing, since Pi may be updating it
while you browse — which is what makes searching 600,000 messages take
milliseconds instead of a scan over gigabytes of JSONL. Individual transcripts
are read from their files, which remain the source of truth.

### Searching Chinese

Pi's indexer normalizes text before storing it: Latin words survive whole and
every CJK character becomes its own token, so `代码修改总结` is indexed as
`代 码 修 改 总 结`. A naive query for `性能优化` is a single token that matches
nothing, which is why CJK search appears broken if you query the index directly.
The query builder applies the same normalization, so `性能优化` becomes the
phrase `"性 能 优 化"` and matches. Whitespace separates independent terms:
`playwright 测试` finds messages containing both.

### Layers

| Path | Responsibility |
|------|----------------|
| `src/index-db.ts` | Read-only queries against Pi's index: list, filter, search |
| `src/query.ts` | Human query to FTS5 expression, and snippet highlighting |
| `src/transcript.ts` | Pi JSONL to a normalized item list, with an LRU cache |
| `src/codex.ts` | The same, for Codex rollout files |
| `src/server.ts` | HTTP API and static serving, bound to loopback |
| `public/` | Zero-build UI: plain ES modules, no framework, no bundler |

`src/types.ts` is the contract between them.

### Data honesty

Every figure shown is read from a transcript or from Pi's index. Nothing is
inferred by a model or estimated from a proxy. Where a fact is unavailable —
Codex sessions carry no cost data, for instance — the field is omitted rather
than rendered as a confident `$0`. Long payloads are clipped for transport and
labelled with the original length.

### Security

The server binds to `127.0.0.1`. Transcript reads are allow-listed against
Pi's index: a path is readable only if the index already knows about it, so
arbitrary files are unreachable even inside the sessions directory. All UI text
is inserted as text nodes, never as markup, so transcript content cannot become
HTML.

## Development

```bash
npm test              # parser and query unit tests
node scripts/serve.mjs   # run without Pi; PORT=7788 to pin the port
```

Requires Node 22+ for `node:sqlite` and native TypeScript execution.
