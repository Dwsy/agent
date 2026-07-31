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

Use `/computer-use-mode full` to activate the individual `computer_use_<action>` tools, `/computer-use-mode progressive` to return to the single gateway, or `/computer-use-mode` to toggle. Run `/computer-use-status` to verify the runtime and current mode.

## Configuration

- `CODEX_HOME`: override the Codex data directory
- `COMPUTER_USE_CLIENT_PATH`: override the full Computer Use client path
- `COMPUTER_USE_CODEX_LAUNCHER_PATH`: override the signed Codex launcher
- `COMPUTER_USE_BRIDGE_DEBUG=1`: print bridge diagnostics to stderr

## Test

```sh
cd ~/.pi/agent/extensions/computer-use
npm test
```

The test uses a fake local MCP client. It verifies tool discovery, automatic elicitation acceptance, and screenshot preservation without controlling real applications.

## Security

This extension can expose screenshots and accessibility text and can click, type, scroll, and drag in local applications. Tool results may be sent to the configured model provider as conversation context. Install and use it only when that data flow is acceptable.
