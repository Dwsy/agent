# Windows outlive the CLI

A short-lived bun process cannot own windows, so each render is handed to a detached holder
process (internal `__hold` command — never call it directly). Consequences:

- The window stays open after the CLI exits; the saved HTML file is the source of truth.
- `--interactive` makes the CLI block and poll until the first settling message
  (`window.glimpse.send` / `sendToAgent` payload), a window close, an error, or a 120s timeout.
  The result JSON then carries `messageData`, `event`, and `closedReason` (`"User sent data"` |
  `"Window closed"` | `"Error: …"` | `"Timeout"`). Canvas `canvas_action` traffic never settles a
  render — only real user/agent-return messages do.
- Without `--interactive` the render returns immediately with `opened: true` and any messages are
  appended to the widget's event log in the background.
- `--no-open` skips window creation entirely (`opened: false`) — the artifact is still saved and
  indexed.

## Practical consequences

- After `ok: true` the window is already up. Do not open it again to "check".
- The saved file under `<widgets>/` is the artifact of record. `browse list` finds it,
  `browse reopen` opens it, `browse html` reads its source.
- A render that returns `ok: false` still may have produced a file — read the error message
  before assuming nothing happened.
