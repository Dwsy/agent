# T-COMMANDS: New Telegram Commands (v3.9)

## Phase 1 — Implemented (commit 3674d2b)

### /think [level]
- No arg → cycles to next thinking level via `cycleThinkingLevel` RPC
- With arg → sets level (off/minimal/low/medium/high/xhigh)
- Requires active session

### /compact [instructions]
- Compacts session context, optional custom instructions
- Shows progress indicator (⏳ → ✅)

### /whoami
- Returns sender ID, name, chat ID, chat type, account ID

## Phase 2 — Implemented

### /bash \<command\>
- Executes shell command on gateway host via `Bun.spawn(["sh", "-c", cmd])`
- Authorization: `isAuthorizedSender` — checks `allowFrom` list
- Output truncated at 4096 chars, timeout 30s
- `!cmd` shortcut in message handler (handlers.ts) — same auth check
- `!!` prefix excluded (reserved, passes through to agent)

### /config [section]
- Read-only config viewer with sensitive value redaction
- No arg → lists config sections
- With arg → shows section as JSON (dot-path traversal: `config channels.telegram`)
- Redacts: token, secret, password, apikey fields
- Authorization: `isAuthorizedSender`

### /restart
- Gated by `gateway.commands.restart: true` (default false)
- Authorization: `isAuthorizedSender`
- Sends SIGUSR1 for graceful restart (supervisor picks up)
- Fallback: `process.exit(0)` after 2s if SIGUSR1 not handled

## Changes

| File | Change |
|------|--------|
| `commands.ts` | +6 LOCAL_COMMANDS, +6 bot.command handlers, +5 helpers, help page 3 |
| `handlers.ts` | +`!cmd` intercept before debounce (~8 lines) |
| `plugin-api-factory.ts` | +`cycleThinkingLevel` method |
