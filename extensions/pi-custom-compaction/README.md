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

The progressive `ctx` tool reads raw session history and commits an agent-written
checkpoint through Pi's native compaction lifecycle. Arguments belong inside
`obj`:

```js
ctx({ action: "action-list", obj: {} })
ctx({ action: "action-schema", obj: { action: "compact_stage" } })
ctx({ action: "tree_outline", obj: { focus: "key", limit: 20 } })
ctx({ action: "tree_show", obj: { entryId: "<id from tree_outline>" } })

// Default: only the summary enters the next model context.
ctx({ action: "compact_stage", obj: {
  summary: "## Goal\n...\n## Progress\n...\n## Next step\n...",
  retention: "summary-only",
  resume: "Continue with the next step." // optional
} })
ctx({ action: "compact_fire", obj: {} })
// The extension stops this run at turn_end and compacts after agent_end.
// Query compact_status on the next turn.
```

`summary-only` (the default) retains no raw dialogue from before the compaction.
The extension creates a metadata-only boundary after the firing turn, so the
outline reads, tool results, staged summary arguments, and fire calls do not
remain in model context. New user messages arrive after the checkpoint.
Raw entries remain on disk and are still readable with `tree_outline` /
`tree_show`; compaction does not delete history.

The committed summary carries the same `<read-files>` / `<modified-files>`
tags that Pi's own compaction appends, listing the files read and modified in
the range the checkpoint drops. Without them the next agent would lose track
of which files were touched, since the raw tool calls are gone from context.
The tags are cumulative: a file list from an earlier compaction is carried
forward, because that history now exists only as a summary. The agent does not
need to write them; the extension appends them to the staged text.

To intentionally keep a raw tail, opt in explicitly:

```js
ctx({ action: "compact_stage", obj: {
  summary: "Summary of the earlier work...",
  retention: "keep-tail",
  firstKeptEntryId: "<id from branch tree_outline>"
} })
```

`keep-tail` retains **every raw entry from that id through the firing turn**,
including new tool calls made after staging. Selecting the user message at the
start of a task therefore keeps that entire task's dialogue. A keep-point without
explicit `retention: "keep-tail"` is rejected to prevent accidental retention.

Available actions:

| Action | Arguments inside obj |
| --- | --- |
| `action-list` | `{}`: contract and all actions |
| `action-schema` | `{action: "<name>"}`: schema, example, notes |
| `tree_outline` | `{offset?, limit?, scope?, focus?}`: raw branch/tree attention signals |
| `tree_show` | `{entryId, full?}`: one entry; bodies clipped unless `full=true` |
| `compact_stage` | `{summary, retention?, firstKeptEntryId?, resume?}` |
| `compact_fire` | `{}`: stop the current run, then compact |
| `compact_status` | `{}`: staged, armed, inProgress, retention, lastResult |
| `compact_discard` | `{}`: discard the stage and disarm before firing |

Following the same event order as `pi-context`, `turn_end` stops further model
turns and `agent_end` starts the transition. Compaction is never invoked from
inside the tool. Only the matching manual operation may consume the stage;
automatic compaction and unrelated `/compact` calls leave it untouched.
A stale keep-point cancels the operation instead of silently falling back.
Failures clear the active operation and do not send `resume`. Success is verified
against the staged summary, boundary, and operation ID before reporting
`committed` or sending `resume`. Session switches, reloads, and tree navigation
clear pending state and invalidate late callbacks.

Pi still checks native compaction eligibility first. If the session is too small,
`compact_status.lastResult` reports the failure; it never claims a commit.

Outline rows show tool names, errors, sizes, labels, and prior keep-points.
Thinking and tool-result bodies stay out of outlines; drill down with
`tree_show` when writing the summary. Agent-written summaries bypass the
role-persona `<memory>` extraction pass.

## Role-persona compatibility

Role/persona system-prompt injection runs through `before_agent_start`; Pi compaction calls the model directly with a summarization-only system prompt. The role prompt is therefore not injected into this extension's compaction request.

`role-persona-old` also owns `session_before_compact` to extract memories. When an enabled, authenticated custom model is selected, the extensions use two in-process contracts: custom compaction exclusively returns the `CompactionResult`, while role-persona supplies the `<memory>` instruction and persists/strips its output through `role-persona-old.compaction-memory-handoff`. This preserves compaction-time memory extraction without duplicate summary calls or result overrides.

The `structured` prompt explicitly excludes persistent persona rules, system instructions, and long-term memories. They are reinjected by role-persona when the next normal agent turn starts.

## Validation

```bash
npm run check
pi -e /Users/dengwenyu/.pi/agent/extensions/pi-custom-compaction/index.ts
```
