# Changelog

All notable changes to this project will be documented in this file.

Version numbers correspond to the Pi Coding Agent version this release is compatible with.

## [0.36.0] - 2026-01-05

### Fixed (Critical)
- **Fixed `sendMessage()` API call** - Changed from `pi.sendMessage(msg, true)` to `pi.sendMessage(msg, { triggerTurn: true, deliverAs: "followUp" })` per Pi v0.35+ API
- **Fixed `isLoopReinjection()` logic bug** - Function was always returning false due to impossible condition (`entry.type !== "message"` followed by `entry.type === "custom"`)
- **Added `session_start` state restoration** - UI state (status bar, widget) now restored when session reloads with active Ralph loop

### Added (Phase 2: API Alignment)
- **Widget display** - Shows loop progress above editor with iteration count, completion promise, and duration
- **Custom message renderer** - Ralph loop messages now render with `🔄 [Ralph #N]` prefix and support expanded/compact views
- **`Ctrl+R` keyboard shortcut** - Quick cancel of active Ralph loop
- **CLI flags** - `--ralph`, `--ralph-max`, `--ralph-promise` for command-line quick start
- **`--file` option** - Read prompt from file: `/ralph-loop --file PROMPT.md --max-iterations 20`
- **Human-readable duration** - Shows "1h 5m" instead of raw seconds

### Improved
- **Error handling** - Better try-catch around file operations with graceful degradation
- **Type safety** - Removed `(state as any)[key]` casts, using explicit field assignments
- **`session_shutdown` handler** - Now clears status bar and widget on exit (was empty no-op)
- **Help text** - Updated with CLI quick start and keyboard shortcuts documentation
- **Test script** - Default path now points to local `./index.ts` for development

### Architecture
- Uses `ctx.ui.setWidget()` for progress display above editor
- Uses `pi.registerMessageRenderer()` for custom message rendering
- Uses `pi.registerShortcut()` for Ctrl+R binding
- Uses `pi.registerFlag()` for CLI flag registration
- Follows plan-mode.ts patterns for widget/status management

## [0.32.0] - 2026-01-02

### Added
- Initial implementation of Ralph Wiggum technique for Pi Coding Agent
- Three commands: `/ralph-loop`, `/cancel-ralph`, `/ralph-help`
- Iteration loop with `--max-iterations` limit
- Completion promise detection via `<promise>TAG</promise>` tags
- Iteration counter displayed in status bar
- Status preservation across sessions
- Strict validation (requires prompt + either max-iterations or completion-promise)
- Optional subagent mode flag (reserved for future use)
- Detailed completion summaries with iteration count and duration
- Error recovery (continues loop on errors)
- New message rejection when loop is active (requires `/cancel-ralph`)
- Automated test script (`test.sh`)

### Fixed (from code review)
- Critical: Argument parsing now handles quoted and unquoted arguments correctly
- Critical: Fixed duplicate YAML condition for null handling
- Critical: Added proper loop re-injection detection to prevent infinite confirmations
- Important: Duration tracking now persists across session restarts
- Important: Added state file validation to catch corrupted files
- Important: Message content filtering now handles images correctly
- Minor: Renamed status key for clarity
- Minor: Added error handling in cancel command

### Architecture
- Single hook file (`index.ts`) that registers all commands
- State file (`.pi/ralph-loop.local.md`) persists across sessions
- Uses Pi's `agent_end` event to detect completion and re-inject prompts
- Uses Pi's `agent_start` event to update status line and detect new user input
