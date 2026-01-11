# Ralph Wiggum for Pi Coding Agent

> "Ralph is deterministically bad in an undeterministic world."

Implementation of the Ralph Wiggum technique for iterative AI development loops in the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

**Minimum Pi version:** 0.35.0

## What is Ralph?

Ralph is a development technique for autonomous iterative AI loops. At its core:

> **Original article:** [https://ghuntley.com/ralph/](https://ghuntley.com/ralph/) by Geoffrey Huntley

```bash
while :; do cat PROMPT.md | pi ; done
```

The same prompt is fed repeatedly to an AI agent. The "self-referential" aspect comes from the AI seeing its own previous work in files and git history - not from feeding output back as input.

## Features

- ✅ Iteration loop with `--max-iterations` limit
- ✅ Completion promise detection via `<promise>TAG</promise>` tags
- ✅ Iteration counter displayed in status bar
- ✅ Widget display showing loop progress above editor
- ✅ Custom message renderer for Ralph loop messages
- ✅ `Ctrl+R` keyboard shortcut to cancel loop
- ✅ CLI flags for command-line quick start
- ✅ Prompt from file support (`--file`)
- ✅ Status preservation across sessions
- ✅ Strict validation (requires prompt + either max-iterations or completion-promise)
- ✅ Optional subagent mode flag (reserved for future use)
- ✅ Detailed completion summaries with iteration count and duration
- ✅ Error recovery (continues loop on errors - errors are part of iteration)
- ✅ New message rejection when loop is active (requires `/cancel-ralph`)

## Quick Start

### Installation

The extension includes a `package.json` manifest for auto-discovery. Install it to your extensions directory:

```bash
# Option 1: Clone to global extensions (recommended)
git clone https://github.com/yourusername/pi-ralph.git ~/.pi/agent/extensions/pi-ralph

# Option 2: Load with --extension flag
pi --extension ./index.ts

# Option 3: Symlink for development
ln -s $(pwd) ~/.pi/agent/extensions/pi-ralph
```

The `package.json` manifest allows pi to auto-discover the extension when cloned to an extensions directory.

### Usage

```bash
# Start a Ralph loop
/ralph-loop "Build a REST API" --max-iterations 50 --completion-promise "DONE"

# Start from a prompt file
/ralph-loop --file PROMPT.md --max-iterations 20

# Cancel active loop
/cancel-ralph

# Get help
/ralph-help
```

### CLI Quick Start

Start Ralph directly from the command line:

```bash
pi --ralph PROMPT.md --ralph-max 50 --ralph-promise "DONE"
```

### Keyboard Shortcuts

- **Ctrl+R** - Cancel Ralph loop immediately

### Completion

To signal completion, output:

```xml
<promise>DONE</promise>
```

When detected (exact string match), the loop terminates with a summary.

## Examples

### Basic Loop

```bash
/ralph-loop "Build a todo REST API" --max-iterations 50 --completion-promise "DONE"
```

### With Quoted Prompt

```bash
/ralph-loop "Fix the authentication bug" --completion-promise "FIXED" --max-iterations 10
```

### From File

```bash
/ralph-loop --file PROMPT.md --max-iterations 20 --completion-promise "COMPLETE"
```

### Debugging Mode (Finite with no promise)

```bash
/ralph-loop "Try to implement feature X" --max-iterations 20
```

## Philosophy

Ralph is based on principles:

1. **Iteration > Perfection** - Let the loop refine work
2. **One item per loop** - Focus on single task per iteration
3. **Errors are data** - Failures inform prompt tuning
4. **Eventual consistency** - Trust the loop to converge
5. **Backpressure is everything** - Tests and validation reject bad code

## Architecture

**Single Extension:** `index.ts`
- Main extension file exporting a default function receiving `ExtensionAPI`
- Package manifest in `package.json` declares the entry point for auto-discovery
- Registers three commands: `/ralph-loop`, `/cancel-ralph`, `/ralph-help`
- Registers CLI flags: `--ralph`, `--ralph-max`, `--ralph-promise`
- Registers keyboard shortcut: `Ctrl+R`
- Registers custom message renderer for `ralph-loop` messages
- Manages loop state in `.pi/ralph-loop.local.md`
- Uses `session_start` event to restore UI state and handle CLI flags
- Uses `agent_start` event to update status line and detect new user input
- Uses `agent_end` event to detect completion and re-inject prompts
- Uses `session_shutdown` event to clean up UI state

**State File:** `.pi/ralph-loop.local.md`
- YAML frontmatter with loop metadata
- Original prompt after `---` separator
- Persists across sessions

**UI Elements:**
- Status bar: Shows `Ralph: N/M` in footer
- Widget: Shows progress panel above editor with iteration, promise, and duration
- Custom renderer: Shows `🔄 [Ralph #N]` prefix on loop messages

## When to Use Ralph

**Good for:**
- Well-defined tasks with clear success criteria
- Greenfield projects
- Tasks requiring iteration (getting tests to pass)
- Tasks with automatic verification

**Not good for:**
- Existing codebases
- Tasks requiring human judgment
- One-shot operations
- Unclear success criteria

## Testing

Run the test script:

```bash
./test.sh
```

Expected output:

```
=== Ralph Wiggum Extension - Quick Tests ===

✅ PASSED: Extension compiles without errors
✅ PASSED: State file format looks correct
✅ PASSED: Extension file exists
✅ PASSED: Help text embedded in extension
✅ PASSED: Extension exports ExtensionAPI handler
✅ PASSED: All three commands registered
✅ PASSED: Required event handlers present
✅ PASSED: Correct package imports

=== All tests passed! ===
```

## Credits

- **Original technique:** Geoffrey Huntley - [https://ghuntley.com/ralph/](https://ghuntley.com/ralph/)
- **Claude Code plugin:** [Anthropic](https://github.com/anthropics/claude-code)
- **Pi port:** Adapted for Pi Coding Agent architecture

## Documentation

| Document | Description |
|----------|-------------|
| [Implementation Plan](docs/implementation-plan.md) | Comprehensive review and implementation roadmap |
| [Porting Plan](docs/claude-porting-plan.md) | Detailed architecture comparison |


