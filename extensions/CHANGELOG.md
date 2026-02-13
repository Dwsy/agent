# Extensions Changelog

## 2026-02-13

### RPC Mode Compatibility

Added early-return guard for RPC mode (`--mode rpc`) to extensions that rely on `ctx.ui.custom()` or TUI-only methods. In RPC mode `custom()` returns `undefined` while `ctx.hasUI` is `true`, causing silent failures or broken flows.

Affected extensions (owned, non-upstream):

- `safety-gates.ts` — `custom()` confirmation dialog would return undefined, potentially allowing dangerous commands
- `answer.ts` — `custom()` extraction UI would fail silently
- `loop.ts` — `custom()` loop config selector broken
- `output-styles.ts` — `custom()` style picker broken
- `whimsical/index.ts` — `setWorkingMessage` no-op, `setInterval` runs for nothing
- `memories-export/index.ts` — `setWorkingMessage` no-op
- `ralph/index.ts` — mixed `confirm`/`setWidget` usage
- `continue.ts` — `setEditorText` meaningless in RPC
- `workflow-commands.ts` — all 5 commands would early-return anyway

Skipped (not owned):

- `pi-interactive-shell/`, `pi-subagents/` — git submodules (nicobailon)
- `qna.ts`, `custom-footer.ts`, `plan-mode/` — upstream examples
- `interview/` — upstream git repo

Skipped (not loaded in RPC):

- `notify.ts`, `games/`, `usage-extension/`, `handoff.ts`

No change needed (already compatible):

- `token-rate.ts`, `tool-timestamp.ts`, `web-fetch.ts`, `git-commit.ts`, `token-aware-truncation.ts`, `tree-view.ts`
