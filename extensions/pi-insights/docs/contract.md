# pi-insights contract

Frozen interface between the three layers. `src/types.ts` is the normative
TypeScript source; this file adds the HTTP surface, module boundaries, and the
rules every layer must respect.

## Principle

Every number shown to the user is read from a Pi session transcript. No
language model is called anywhere in this extension, and no metric is
estimated from a proxy signal. When a fact is unavailable, the field is absent
and the UI renders a dash — it does not substitute a plausible-looking value.

## Layers

| Layer | Owns | Must not touch |
|-------|------|----------------|
| Collector + analyzer | `src/collector/**`, `src/analyzer/**`, `src/cache.ts`, `test/**` | `src/server/**`, `public/**` |
| Server + extension | `src/server/**`, `src/index.ts`, `package.json`, `README.md` | `src/collector/**`, `src/analyzer/**`, `public/**` |
| Web UI | `public/**` | everything under `src/` |

`src/types.ts` and this file are shared and read-only for all three layers. A
layer that needs a contract change stops and reports it rather than editing.

## Source data

Sessions live at `~/.pi/agent/sessions/<project-dir>/<stamp>_<uuid>.jsonl`,
one JSON object per line. Project directories are the cwd with `/` replaced by
`-`, wrapped in `--`. A scan must walk **all** files in **all** project
directories — not just the newest file per directory.

Entry shapes actually present in the transcripts:

```jsonc
{"type":"session","version":3,"id":"019f…","timestamp":"2026-08-10T03:56:14.852Z","cwd":"/Users/me/proj"}
{"type":"session_info","id":"2bc6c5a1","parentId":"e6d4cd42","timestamp":"…","name":"GPM连接器获取性能优化"}
{"type":"model_change","id":"38943b7a","parentId":null,"timestamp":"…","provider":"3838-completions","modelId":"ark-code-latest"}
{"type":"thinking_level_change","timestamp":"…"}
{"type":"compaction","id":"…","parentId":"…","timestamp":"…","summary":"## Goal…"}
{"type":"branch_summary","id":"…","fromId":"…","timestamp":"…","summary":"…"}
{"type":"label","id":"…","targetId":"…","timestamp":"…","label":"notification-jdbc-resume"}
{"type":"custom_message","customType":"name-session","content":"…"}
{"type":"custom","customType":"pi-grok-workflow/v1","data":{}}
{"type":"message","id":"a8bce200","parentId":"05c10b24","timestamp":"…","message":{}}
```

Message payloads:

```jsonc
// assistant
{"role":"assistant","api":"openai-responses","provider":"3838","model":"gprivider-chat5-5",
 "usage":{"input":26463,"output":152,"cacheRead":0,"cacheWrite":0,"reasoning":0,"totalTokens":26615,
          "cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},
 "stopReason":"toolUse","timestamp":1786334252414,
 "content":[{"type":"text","text":"…"},
            {"type":"toolCall","id":"call_1|fc_…","name":"write","arguments":{"path":"…","content":"…"}}]}

// user
{"role":"user","content":[{"type":"text","text":"…"}],"timestamp":1786334252414}

// tool result
{"role":"toolResult","toolCallId":"call_1|fc_…","toolName":"bash",
 "content":[{"type":"text","text":"…"}],"details":{},"isError":true,"timestamp":"…"}
```

`stopReason` values seen: `toolUse`, `stop`, `aborted`, `error`.

### Derivation rules

- **Tokens and cost** — sum `message.usage` on assistant messages only. Cost is
  `usage.cost.total`. Providers that report no pricing yield `0`; the UI must
  distinguish "zero cost reported" from "no data".
- **Tool calls** — count `content[].type === "toolCall"`, keyed by `name`.
- **Tool errors** — count `toolResult` messages with `isError === true`.
- **Lines added/removed** — from tool-call arguments, never from output text:
  - `write`: `arguments.content` line count is added; the file counts as one write.
  - `edit`: for each entry in `arguments.edits`, add the `newText` line count
    and remove the `oldText` line count.
  - A line is a `\n`-separated segment; a trailing newline does not create one.
- **Languages** — lowercase extension of `arguments.path` from write/edit calls.
  No extension maps to `other`.
- **Active minutes** — sum the gaps between consecutive entry timestamps,
  discarding any gap over `IDLE_GAP_MINUTES` (5). This models focused time; wall
  clock is reported separately.
- **Concurrency** — sessions overlap when their `[startedAt, endedAt]` spans
  intersect. `peakConcurrentSessions` is the maximum overlap depth via a sweep
  over start/end events.
- **Session name** — the `name` of the last `session_info` entry, else absent.
  Never synthesize a name from message text.
- **Truncation** — any free text carried into `SessionEvent.label` is cut to 120
  characters at a character boundary.

## HTTP API

Served on `127.0.0.1` only. All responses are `application/json; charset=utf-8`
with `Cache-Control: no-store`. Errors use `{ "error": string }` with a 4xx/5xx
status.

| Method | Path | Query | Response |
|--------|------|-------|----------|
| GET | `/api/status` | — | `StatusResponse` |
| GET | `/api/report` | `range`, `refresh` | `InsightsReport` |
| GET | `/api/session` | `path` (required) | `SessionDetail` |
| POST | `/api/refresh` | — | `{ scan: ScanStats }` |
| GET | `/api/stream` | — | SSE; `progress` events during a scan |
| GET | `/*` | — | static file from `public/`, `index.html` fallback |

```ts
interface StatusResponse {
  ok: true;
  version: string;
  sessionsDir: string;
  cacheDir: string;
  cachedSessions: number;
  /** Ranges already warm in cache, cheapest first. */
  ranges: RangeKey[];
}
```

- `range` defaults to `30d` and must be one of `24h | 7d | 30d | 90d | all`.
  An unknown value is a 400, not a silent fallback.
- `refresh=1` bypasses the cache for that request.
- `/api/session?path=` accepts only paths inside the sessions root, resolved
  and prefix-checked after `realpath`. Anything else is 403.
- SSE `progress` payload: `{ done: number, total: number, phase: "scan" | "parse" | "aggregate" }`.

## Cache

`~/.pi/agent/usage-data/insights/` holds one JSON per session keyed by file
path hash, invalidated on `mtimeMs` or `size` change. A scan reuses cached
per-session records and only re-reads changed files. Aggregation is never
cached — it is cheap once records exist.

## Frontend rules

- Zero build. `public/index.html` loads one stylesheet and ES modules directly.
  No bundler, no CDN, no remote font, no framework runtime.
- No emoji anywhere in the UI. Icons are inline SVG with `currentColor`.
- Charts are hand-drawn inline SVG. No charting dependency.
- Light and dark themes via `data-theme` on `<html>`, persisted under
  `pi-insights-theme`; `system` follows `prefers-color-scheme`.
- Locale `zh` / `en` persisted under `pi-insights-locale`, defaulting to `zh`
  when `navigator.language` starts with `zh`, else `en`. Every visible string
  comes from `public/js/i18n.js`; no hardcoded copy in markup or view code.
- Responsive down to 390px with no horizontal scroll and no clipped content.
- `prefers-reduced-motion` disables transitions and animated chart reveals.
- Numbers are formatted through `public/js/format.js` — thousands separators,
  compact token counts (`26.6k`), currency to 4 decimals under $1.
- Every metric card states its unit and, where a rate is shown, the numerator
  and denominator that produced it.
