# Session Fork Slim

A Pi extension that exports your current session to a slimmed-down JSONL file — removing thinking traces, tool execution noise, and other non-essential entries while preserving the actual conversation flow.

## Features

- **Interactive TUI overlay** — 4-step wizard: stats → filter selection → preview → export
- **Configurable filtering** — choose what to remove (thinking, tool calls, read results, etc.)
- **Clean output** — removes `thinking` blocks, `toolCall` metadata, and execution noise from messages
- **Valid session format** — output is a loadable Pi session file with proper header and parent chain
- **Copy-paste resume** — displays the exact `pi --session <path>` command to continue

## Installation

```bash
# Clone or copy to extensions directory
git clone <repo> ~/.pi/agent/extensions/session-fork-slim

# Or manually:
cp -r session-fork-slim ~/.pi/agent/extensions/
```

## Usage

Start Pi with the extension loaded:

```bash
pi -e ~/.pi/agent/extensions/session-fork-slim
```

Then run the command inside any session:

```
/export-slim
```

### Workflow

| Step | Screen | Action |
|------|--------|--------|
| 1 | 📄 Session Stats | Review entry counts by type |
| 2 | 🗑️ Filter Selection | `Space` to toggle, `Enter` to confirm |
| 3 | 📊 Export Preview | Review remove/keep counts |
| 4 | ✅ Success | Auto-closes in 5s, shows resume command |

**Keys:** `Enter` confirm, `Esc` cancel, `Space` toggle checkbox

## Filter Options

| Option | Default | Description |
|--------|---------|-------------|
| 🧠 Thinking & model changes | ✓ | Remove `thinking_level_change` and `model_change` entries |
| 📖 Read tool results | ✓ | Remove `tool_result` entries from `read` tool |
| 🔧 Tool calls | ✓ | Remove `tool_call` execution entries |
| 📋 Other tool results | ○ | Remove non-read tool results (bash, edit, etc.) |

## Output

Files are written to the same directory as the source session:

```
<sessions-dir>/<original-name>-slim-<timestamp>.jsonl
```

Example:
```
2026-04-19T09-40-54_019da51d-slim-2026-04-19T09-41-08.jsonl
```

Resume the slimmed session:
```bash
pi --session /Users/.../sessions/...-slim-....jsonl
```

## Project Structure

```
session-fork-slim/
├── index.ts      # Extension entry point, command registration
├── ui.ts         # TUI overlay components (4-step wizard)
├── slim.ts       # Core slimming logic, session file generation
├── types.ts      # Type definitions and constants
└── README.md     # This file
```

## Technical Details

- **Preserves:** `user`/`assistant` messages (content only), `custom` entries, `branch_summary`, `compaction`, `label`, `session_info`
- **Strips:** `thinking` blocks from message content, `toolCall` references, internal execution metadata
- **Rebuilds:** Parent chain (`parentId`) to maintain valid tree structure
- **Generates:** New session header with fresh ID, original `cwd` preserved

## Requirements

- Pi >= 0.67.x
- Interactive TUI mode (`hasUI` required)

## License

MIT
