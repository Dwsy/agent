# Grounding — required on every render

Every `widget`/`canvas` call must carry `--grounding` (inline JSON or `--grounding-file`):

```json
{ "status": "grounded",
  "evidence_scope": "Current latency evidence",
  "sources": [ { "label": "Latency report", "kind": "web",
                 "locator": "https://example.com/latency-report", "as_of": "2026-08-19" } ] }
```

| Field | Meaning |
|---|---|
| `status` | `grounded` (factual/evidence artifacts) or `not_applicable` (creative/structural only). |
| `evidence_scope` | What the artifact's evidence covers. For `not_applicable`, why there is none. |
| `sources[].label` | Human-readable name of the source. |
| `sources[].kind` | `conversation` \| `file` \| `code` \| `web` \| `data`. |
| `sources[].locator` | Absolute URL, file path, code location, conversation id, or dataset locator. No generic placeholders. |
| `sources[].as_of` | When the source was true. |

- `grounded` needs ≥1 concrete source. The host renders a visible provenance footer and persists
  the declaration.
- `not_applicable` carries no sources and must explain itself in `evidence_scope`.

## Plan interplay

Plan state lives in `<widgets>/last-plan.json` until the first render whose target matches it.

- If the plan's `research` is `required`, `grounding.status` must be `grounded` with concrete
  provenance — `not_applicable` is rejected.
- Evidence/structure-bearing routes reject `not_applicable`. Only the purely creative routes
  (`illustration`, `ui-mockup`, `interactive-explainer`) accept it with a reason.
- A render never steals another target's plan: while a `show_widget` plan is pending, a canvas
  render is free (and vice versa) — the plan survives for its own render. A failed render keeps
  the plan too.

This is why `route` comes first: the route decides what the artifact is, and the plan records
what evidence that artifact needs.

## What counts as a source

A locator must point at something a reader could check.

| Good | Bad |
|---|---|
| `/abs/path/report.md` | "the report" |
| `https://example.com/latency-report` | "example.com" |
| `src/queue/worker.ts:42` | "the worker code" |
| a conversation id | "the earlier discussion" |

`kind` is how the host categorises it, so it stays consistent with the locator's real form.
