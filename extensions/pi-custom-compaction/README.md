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

## Role-persona compatibility

Role/persona system-prompt injection runs through `before_agent_start`; Pi compaction calls the model directly with a summarization-only system prompt. The role prompt is therefore not injected into this extension's compaction request.

`role-persona-old` also owns `session_before_compact` to extract memories. When an enabled, authenticated custom model is selected, the extensions use two in-process contracts: custom compaction exclusively returns the `CompactionResult`, while role-persona supplies the `<memory>` instruction and persists/strips its output through `role-persona-old.compaction-memory-handoff`. This preserves compaction-time memory extraction without duplicate summary calls or result overrides.

The `structured` prompt explicitly excludes persistent persona rules, system instructions, and long-term memories. They are reinjected by role-persona when the next normal agent turn starts.

## Validation

```bash
npm run check
pi -e /Users/dengwenyu/.pi/agent/extensions/pi-custom-compaction/index.ts
```
