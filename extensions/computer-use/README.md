# Pi Computer Use

A Pi extension adapted from [`songkeys/kimi-computer-use`](https://github.com/songkeys/kimi-computer-use). It starts the locally installed OpenAI Computer Use MCP client through the signed Codex launcher, dynamically registers its tools in Pi, and preserves screenshot image blocks.

## Requirements

- macOS
- ChatGPT or Codex with Computer Use installed and working
- Accessibility and Screen Recording permissions granted to the Computer Use runtime

Default paths:

- Client: `$CODEX_HOME/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient`
- Signed launcher: `/Applications/ChatGPT.app/Contents/Resources/codex`, then `/Applications/Codex.app/Contents/Resources/codex`

`CODEX_HOME` defaults to `~/.codex`.

## Use

The directory is already under `~/.pi/agent/extensions/`. Run `/reload` or start a new Pi session.

The default mode is **progressive** and exposes one tool: `computer_use`.

- `action: "action-list"` lists available actions.
- `action: "action-schema"`, `obj: { "action": "get_app_state" }` shows that action's input/output definition.
- `action: "get_app_state"`, `obj: { "app": "Calculator" }` executes a discovered action.

The gateway declares an `outputSchema`, so codemode scripts receive structured
`{ content: [...] }` results (text and image blocks) from `tools.computer_use(...)` and can
chain observe → act → re-observe calls in one script:

```js
const state = await tools.computer_use({ action: "get_app_state", obj: { app: "com.google.Chrome" } });
for (const c of state.content ?? []) c.type === "image" ? image(c) : text(c.text.slice(0, 400));
```

Read-only actions (`list_apps`, `get_app_state`) are retried once on a fresh transport after
transient upstream server errors (`-100xx`, e.g. the Codex runtime restarting); mutating actions
are never replayed automatically.

Use `/computer-use-mode skill` to switch to the **skill** mode, `/computer-use-mode progressive`
to return to the single gateway, or `/computer-use-mode` to toggle. Run `/computer-use-status` to
verify the runtime and current mode. The `computer-use` skill is advertised in both modes and
loads on demand. No system prompts are injected: the skill routes itself through its frontmatter
description, and the gateway tool's prompts instruct the agent to read the skill first (workflow and
confirmations taxonomy).

In **skill** mode no Computer Use tools are exposed to the model. Instead the extension registers the `computer-use` skill, which drives the same MCP service from Node.js:

```sh
node ~/.pi/agent/extensions/computer-use/skill/scripts/cu.mjs list
node ~/.pi/agent/extensions/computer-use/skill/scripts/cu.mjs schema get_app_state
node ~/.pi/agent/extensions/computer-use/skill/scripts/cu.mjs call get_app_state '{"app":"Calculator"}'
```

The mode is persisted in `.mode` next to the extension and honored on `/reload` and new sessions; switching into skill mode prompts you to run `/reload` so the skill loads.

## Architecture

One shared daemon owns the single Computer Use process chain; every Pi session is a thin
client, so N sessions cost one chain instead of N.

```text
Pi session A ─┐
Pi session B ─┼─ unix socket ─> computer-use-daemon ─> bridge ─> codex sandbox ─> Sky client
Pi session C ─┘                     (one chain)
```

The daemon starts on demand (first client that finds no socket spawns it detached), and exits
after 10 idle minutes with zero clients, killing the whole bridge process tree. `tools/call`
requests are serialized across clients because the GUI is a single shared resource.

## Configuration

- `CODEX_HOME`: override the Codex data directory
- `COMPUTER_USE_CLIENT_PATH`: override the full Computer Use client path
- `COMPUTER_USE_CODEX_LAUNCHER_PATH`: override the signed Codex launcher
- `COMPUTER_USE_BRIDGE_DEBUG=1`: print bridge diagnostics to stderr
- `COMPUTER_USE_DAEMON_SOCK`: override the daemon socket path (default `$TMPDIR/pi-computer-use-daemon.sock`)
- `COMPUTER_USE_DAEMON_IDLE_MS`: idle time before the daemon exits (default `600000`)
- `COMPUTER_USE_DAEMON_DEBUG=1`: print daemon diagnostics to stderr

## Test

```sh
cd ~/.pi/agent/extensions/computer-use
npm test
```

The tests use a fake local MCP client. `test/mcp-client.test.mjs` verifies tool discovery,
automatic elicitation acceptance, screenshot preservation, transient-error recovery, idle
shutdown of the whole process tree, and multi-client sharing of one daemon. `test/smoke-index.mjs`
verifies extension registration: the three modes, skill discovery paths, system-prompt selection,
and mode persistence.

## Security

This extension can expose screenshots and accessibility text and can click, type, scroll, and drag in local applications. Tool results may be sent to the configured model provider as conversation context. Install and use it only when that data flow is acceptable.
