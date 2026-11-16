# Extending routing — `visual-routes.json`

Any skill subdirectory can register visual routes by shipping a `visual-routes.json` manifest
next to its `SKILL.md`. Registered routes take priority over the built-in chain; the first
matching registered route wins (load order: scan-root order, then skill directory name,
deterministic).

```json
{ "routes": [ {
  "id": "latency-report",
  "title": "Latency report",
  "target": "show_widget",
  "patterns": ["latency report", "/p9[0-9] latency/"],
  "modules": ["chart"],
  "templates": ["metric-chart"],
  "style": "analytical",
  "reason": "Latency evidence is best read as a metric chart with source captions.",
  "contentPlan": ["Scope + window", "Metric chart with units", "Source/recency caption"],
  "skillRef": "latency-reporting"
}] }
```

| Field | Required | Values |
|-------|----------|--------|
| `id`, `title`, `reason` | yes | non-empty strings |
| `target` | yes | `markdown` \| `show_widget` \| `show_canvas` |
| `style` | yes | `editorial` \| `analytical` \| `system` \| `comparison` \| `record` \| `workflow` \| `product` \| `illustrative` |
| `patterns` | yes | non-empty; case-insensitive substring, or `/regex/` (compiled case-insensitively) |
| `modules`, `templates` | yes | arrays of non-empty strings (may be empty) |
| `contentPlan` | yes | non-empty array of strings — the minimum completeness contract |
| `skillRef` | no | defaults to the skill directory name; surfaces as `details.skillRefs` |

Scan roots (each holds one skill subdirectory): `~/.pi/agent/skills`, `~/.agents/skills`,
`<cwd>/.pi/skills`, `<cwd>/.agents/skills`. `VISUAL_SKILLS_ROOTS` (colon-separated) replaces them
entirely — tests and sandboxes use that for isolation.

Bad manifests never break routing: invalid JSON, wrong shapes, or bad regex patterns are skipped
and reported in `route` output as `details.warnings` (and the entry simply does not route).

## What a route does and does not decide

A route picks the **medium**, the **style**, and the **minimum content**. It does not validate
the content and it does not enforce the content plan — the only hard gate at render time is
`grounding.status` (see `grounding.md`). A registered route that marks `research: required` is
enforced: `not_applicable` grounding is then rejected for that route's target.

## Writing patterns

Patterns match the user's request, so write them the way a person asks.

- Substring: `"latency report"` matches any request containing those words.
- Regex: `"/p9[0-9] latency/"` — case-insensitive, needs a `/…/` form.
- Regex needs ≥3 characters and a trailing `/`, otherwise it is treated as a literal substring.
- First match wins, so put the most specific pattern first. Two routes matching the same request
  is a bug in the manifest, not a tie to break.

## Progressive flow

`route` → read `skillRefs` skills → render. Match patterns describe what the user asked for; the
skill referenced by `skillRef` owns how that artifact is built and grounded. Never expand every
route guide up front, and never invent content a registered route's contentPlan does not cover.
