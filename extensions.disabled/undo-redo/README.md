# Undo/Redo Extension (pi)

This extension adds buffered undo/redo support to pi sessions by running tools inside a sandbox and restoring file snapshots when you navigate between conversation branches.

https://github.com/user-attachments/assets/d9335a48-1c14-4329-8948-1794e85b1456


## What it does

- Wraps built-in tools (`read`, `edit`, `write`, `bash`, `grep`, `find`, `ls`) so file operations happen in a sandbox.
- Tracks file snapshots per conversation leaf and restores them on undo/redo or `/tree` navigation.
- Adds commands for undo/redo and inspecting buffered diffs.
- Replaces the input editor with a custom editor that exposes undo/redo shortcuts.

## Requirements

- pi with extension support.
- Peer dependencies available at runtime:
  - `@mariozechner/pi-coding-agent`
  - `@mariozechner/pi-tui`
- Node dependencies installed for this extension when developing or testing.

## Install

### Install via pi (recommended)

```bash
pi install npm:@justram/pi-undo-redo
```

### Local development / testing

```bash
git clone https://github.com/justram/pi-undo-redo.git
cd pi-undo-redo
npm install
pi -e /absolute/path/to/pi-undo-redo
```

You can also load it via auto-discovery:
- Global: `~/.pi/agent/extensions/undo-redo/`
- Project: `.pi/extensions/undo-redo/`

Or install the local path as a pi package:

```bash
pi install /absolute/path/to/pi-undo-redo
```

## Usage

Once loaded, tools operate in the sandbox automatically. The status bar shows the number of tracked files and total size. File snapshots are saved per conversation leaf and restored when you move around the session tree.

### Commands

- `/undo` — Navigate to the previous leaf and restore buffered files.
- `/redo` — Navigate to the next leaf and restore buffered files.
- `/diff-stack` — Inspect buffered diffs per leaf (UI only).
- `/undo-redo-clear-cache` — Clear the undo/redo extension cache for the current session (snapshots, diffs, and sandbox) and reset history.

### LLM tool

The extension exposes a tool named `undo_redo` so the LLM can manage undo/redo and diffs without UI navigation. Actions:

- `undo` — Move to the previous leaf and restore files.
- `redo` — Move to the next leaf and restore files.
- `list_diffs` — List buffered diffs across leaves.
- `diff` — Show a diff for a specific file and leaf (`path` required, `leafId` optional).

**Tool vs command behavior:** the tool version does not trigger UI navigation and does not rebuild the current turn context. This keeps the current KV cache intact and avoids editor/tree updates. The new leaf is applied on the next user prompt when pi rebuilds context. Use the commands if you want immediate UI navigation and context replay.

### Editor behavior

The extension keeps the standard pi editor behavior and adds undo/redo shortcuts:

- `ctrl+shift+z`: undo (runs `/undo`)
- `ctrl+shift+y`: redo (runs `/redo`)

You can customize these in `~/.pi/agent/keybindings.json` using these keys:

```json
{
  "treeUndo": "ctrl+shift+z",
  "treeRedo": "ctrl+shift+y"
}
```

## How it works

- A sandbox directory is created under the extension cache root and synced with your working directory (honors `.gitignore` plus a default ignore list).
- Tool calls operate on sandbox paths. Writes are synced back to the real workspace, and file snapshots are saved per leaf.
- When you undo/redo or navigate the tree, snapshots are restored to both the sandbox and your real workspace.

## Session behavior

- Each pi session gets its own cache root keyed by session ID.
- `/resume` reuses the same session ID, so cached snapshots and the sandbox are reused. Undo/redo stacks are reset on load, so undo/redo is unavailable until new changes are recorded.
- `/fork` creates a new session ID, so the extension re-initializes with a fresh sandbox/cache for the forked session.

## Cache layout

The extension stores data under:

```
~/.pi/agent/cache/undo-redo/<session-id>/
  blobs/           # File content snapshots by hash
  leaves/          # Per-leaf manifests
  base.json        # Initial snapshot manifest
  sandbox/         # Sandbox working copy
```

## How file tracking works

- The extension maintains a sandbox working copy and a content-addressed blob store.
- We track files by intercepting pi tools and sandboxed bash calls, then snapshotting the touched paths.
- Each snapshot stores file contents keyed by hash and a per-leaf manifest mapping relative paths to hashes.
- On undo/redo or tree navigation, the manifest for the selected leaf is replayed into both the sandbox and the real workspace.

## Development

- Lint and typecheck:
  ```bash
  npm run check
  ```
- Unit tests:
  ```bash
  npm test
  ```

## Notes and limitations

- Only files under the current working directory are tracked.
- We only know about changes that flow through pi tools or the sandboxed bash wrapper. Files modified outside of pi are not detected and may be overwritten when restoring a leaf.
- We assume the working directory is stable for the session. Changing the cwd outside of pi or moving the project root during a session can desync the sandbox.
- We assume file operations are path-based within the project. Renames/moves are treated as delete + add at the path level.
- `/diff-stack` requires interactive UI mode.
