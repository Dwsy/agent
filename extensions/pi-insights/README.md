# pi-insights

Pi extension for **local usage analytics**: tokens, cost, cache efficiency, tool
reliability, and code churn, read directly out of your own Pi session
transcripts and served as a local web workbench.

No language model is called anywhere in this extension. Nothing leaves the
machine.

## What it measures, and what it refuses to guess

Every number is derived from a fact recorded in
`~/.pi/agent/sessions/<project>/<stamp>_<uuid>.jsonl`.

| Metric | Derived from |
|--------|--------------|
| Tokens, cost, cache read/write, reasoning | `message.usage` on assistant messages |
| Requests, models, providers | `provider` / `model` / `api` per assistant message |
| Tool calls | `content[].type === "toolCall"`, keyed by tool name |
| Tool errors | `toolResult` messages with `isError: true` |
| Lines added/removed | `write` content and `edit` `oldText`/`newText` arguments |
| Languages | file extension of the path passed to `write` / `edit` |
| Files touched | distinct paths passed to `write` / `edit` |
| Active time | gaps between consecutive entries, discarding gaps over 5 minutes |
| Interruptions, errors | assistant `stopReason` of `aborted` / `error` |
| Compactions | `compaction` entries |
| Session name | the last `session_info` entry |
| Concurrency | sweep line over overlapping session spans |

It deliberately does **not** infer task outcome, satisfaction, "helpfulness",
goal categories, or any other judgement a transcript cannot support. Where a
provider reports no pricing, cost is shown as a reported zero rather than an
estimate, and a metric with no sample renders as an em dash rather than `0`.

## Requirements

- [Pi](https://pi.dev) coding agent (`@earendil-works/pi-coding-agent`)

## Installation

Add to `~/.pi/agent/settings.json`:

```json
"+extensions/pi-insights/src/index.ts"
```

Restart Pi after the settings change.

## Quick start

```text
/insights            # status: UI url, sessions root, cached session count
/insights stats 7d   # one-line factual summary in the TUI
/insights ui         # start the web UI, print the url
/insights open       # start it and open a browser
```

## Slash commands

| Command | Description |
|---------|-------------|
| `/insights` | Status — whether the UI is running, its URL, sessions root, cache size |
| `/insights ui` | Start the server (reusing a live one) and print the URL |
| `/insights open` | Start and open the default browser |
| `/insights port [n]` | Show or persist the UI port |
| `/insights refresh` | Re-read every transcript and rebuild the cache, with progress |
| `/insights stats [range]` | Compact summary in the TUI: sessions, active time, tokens, cost, top model, top tool |

`range` is one of `24h`, `7d`, `30d`, `90d`, `all`, defaulting to `30d`.

## Web UI

Five views, switchable with keys `1`–`5`, state reflected in the URL hash so any
view is linkable.

| View | Content |
|------|---------|
| Overview | Headline metrics, daily activity, hour-of-day and weekday distribution, signals |
| Sessions | Sortable, filterable table; opens a per-session detail panel |
| Models | Per provider/model requests, token split, cost, share of total |
| Tools | Per-tool calls, errors, error rate, session reach |
| Projects | Per-project sessions, active time, tokens, cost, churn |

Zero build step: one stylesheet and eight ES modules loaded directly by the
browser. No bundler, no CDN, no framework, no charting library — charts are
hand-drawn inline SVG. Light and dark themes (`pi-insights-theme`), `zh` / `en`
locales (`pi-insights-locale`), responsive to 390px, `prefers-reduced-motion`
honoured.

Rates always show the numerator and denominator that produced them, and the
header reports its own provenance: files parsed, files skipped, bad lines, bytes
read, scan duration, and whether the data came from cache.

### Signals

Deterministic, threshold-based observations — never model-generated prose. Each
one ships with the measurements that triggered it, so the claim can be checked
rather than trusted. Every rule is guarded by a minimum volume so it cannot fire
on a sample too small to mean anything.

## Web UI port

Priority: runtime `/insights port N` (persisted) →
`~/.pi/agent/usage-data/insights-ui.json` → `PI_INSIGHTS_UI_PORT` → default
**32212**. If the port is taken by another pi-insights instance, that instance is
reused after a health check on `GET /api/status`.

## HTTP API

Bound to `127.0.0.1` only. JSON responses are `application/json; charset=utf-8`
with `Cache-Control: no-store`; errors are `{ "error": string }`.

| Method | Path | Query | Response |
|--------|------|-------|----------|
| GET | `/api/status` | — | version, sessions root, cache dir, cached session count, warm ranges |
| GET | `/api/report` | `range`, `refresh` | the full `InsightsReport` |
| GET | `/api/session` | `path` | one `SessionDetail` |
| POST | `/api/refresh` | — | `{ scan }` after a full rebuild |
| GET | `/api/stream` | — | SSE `progress` events while a scan runs |

An unknown `range` is a `400`, never a silent fallback. `/api/session` resolves
the path and prefix-checks it against the sessions root after `realpath`;
anything outside is `403` whether or not it exists.

## On-disk layout

```
~/.pi/agent/usage-data/
  insights/            one JSON per transcript, keyed by path hash, mode 0600
  insights-ui.json     persisted UI port
```

The cache is invalidated per file on `mtime` or `size` change, so a rescan only
re-reads what actually changed. A corrupt entry is treated as a miss.

## Privacy

Transcripts are read locally and never uploaded. The UI binds to loopback only.
The cache stores derived counts plus session names and touched file paths — it
does not copy message bodies. Session transcripts themselves may contain
prompts, so keep the cache directory as private as the sessions directory.

## Performance

A cold scan of ~6,800 transcripts (~4.9 GB) takes roughly 55 seconds; subsequent
reports over the same range are served from cache in about a second. Parsing is
streamed line by line with bounded concurrency.

## Development

```bash
node scripts/run-tests.mjs        # unit tests (bun resolves the TypeScript directly)
node scripts/verify-public-ui.mjs # static UI gate: no emoji, no CDN, i18n parity, a11y basics
npm test                          # both
```

`docs/contract.md` is the frozen interface between the collector, the server,
and the web UI; `src/types.ts` is its normative TypeScript form.

## License

MIT
