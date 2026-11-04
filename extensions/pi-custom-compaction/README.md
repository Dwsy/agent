# Pi Custom Compaction

A Pi extension that selects an authenticated Pi model and compaction algorithm for session context checkpoints.

## Install

The extension is auto-discovered from this directory. Start Pi, then run:

```text
/compaction
```

The TUI panel lists models returned by `ctx.modelRegistry.getAvailable()`: it does not duplicate provider, OAuth, or API-key configuration. Configure providers/models through Pi first, then choose one here.

## Commands

```text
/compaction          Open the interactive settings panel
/compaction show     Display the active profile
/compaction path     Display the config file path
/compaction on       Enable the extension
/compaction off      Disable the extension
```

The global configuration is created on first load at:

```text
~/.pi/agent/extensions/pi-custom-compaction/config.json
```

See `config.example.json` for its shape.

The status widget is **off by default**. The model selector supports fuzzy search across model name, provider, and ID, and shows only the model's output price (`$/M tokens`).

## Algorithms

| Algorithm | Behavior |
|---|---|
| `pi-default` | Uses Pi's exported `compact()` with the selected model. This preserves Pi's cut-point calculation, split-turn summaries, iterative summaries, and file-operation tracking. |
| `structured` | Produces a coding checkpoint with Goal, Decisions, Changes, Current State, Risks, Next Steps, and Critical Context; appends Pi-compatible read/modified file tags. |

Both algorithms use Pi's `session_before_compact` hook, so they apply to manual `/compact`, automatic threshold compaction, and overflow recovery.

Both algorithms also share Pi's `retry.*` settings through `retryAssistantCall`: transient provider failures (429/5xx/network/stream drops) retry with exponential backoff and emit a `Compaction retry n/max in Xs` notice per attempt, while deterministic failures (quota/billing exhaustion) fail fast. Only when the retry budget is exhausted does the extension fall back to Pi's default compaction.

## ctx tool (agent-driven compaction)

The extension also registers a progressive LLM tool named `ctx` (`src/ctx.ts`):

```text
ctx action-list                       list actions
ctx action-schema {action}            show one action's obj schema
ctx tree_outline {offset, limit, scope, focus}   attention-signal rows (default scope=branch, cheapest legal keep-points)
ctx tree_show {entryId, full?}        one entry drilled down (bodies clipped unless full=true)
ctx compact_stage {summary, firstKeptEntryId, resume?}   validate against the branch + stage agent-written summary
ctx compact_fire {}                   run a real compaction now with the staged summary
ctx compact_discard {}                drop the stage without compacting
```

Typical flow: `tree_outline focus=key` → `tree_show` → `compact_stage` → `compact_fire`.

`resume` is optional: when set, the committed compaction immediately sends that
text back as a user message, so the agent continues the task instead of stopping
after the compaction notice. Without it, behaviour is unchanged. Failures never
send it, and `compact_status.lastResult` reports `committed; resume sent` versus
plain `committed` so the outcome is checkable without watching notices.

Row legend (signals only, never bodies): `[user] "intent…"`,
`[assistant] tools=read,bash "reply…"`, `[toolResult] tools=bash err! 24.4KB`,
`[compaction] 2.9KB keptFrom=<id>`, `label="…"` on labeled entries.
Thinking blocks and tool-result bodies never appear in outlines — same rule as
Pi's own summary serialization. `scope=tree` (all branches, DFS with depth) is
opt-in; the default `branch` scope lists exactly the legal keep-points.
The staged summary is consumed by the same `session_before_compact` handler
(check runs before the `enabled` gate), so the agent freely chooses the
keep-point instead of the token-based cut. The stage is single-use: firing
consumes it, failures clear it, and a point that is not on the current branch
falls back to normal compaction with a warning. Agent-written summaries bypass
the role-persona `<memory>` handoff (zero-LLM design: the agent already wrote
the text, no extraction pass runs).

## Role-persona compatibility

Role/persona system-prompt injection runs through `before_agent_start`; Pi compaction calls the model directly with a summarization-only system prompt. The role prompt is therefore not injected into this extension's compaction request.

`role-persona-old` also owns `session_before_compact` to extract memories. When an enabled, authenticated custom model is selected, the extensions use two in-process contracts: custom compaction exclusively returns the `CompactionResult`, while role-persona supplies the `<memory>` instruction and persists/strips its output through `role-persona-old.compaction-memory-handoff`. This preserves compaction-time memory extraction without duplicate summary calls or result overrides.

The `structured` prompt explicitly excludes persistent persona rules, system instructions, and long-term memories. They are reinjected by role-persona when the next normal agent turn starts.

## Validation

```bash
npm run check
pi -e /Users/dengwenyu/.pi/agent/extensions/pi-custom-compaction/index.ts
```
