# T-COMMANDS: New Telegram Commands (v3.9)

## Implemented (Phase 1)

### /think [level]
- No arg → cycles to next thinking level via `cycleThinkingLevel` RPC
- With arg → sets level via `setThinkingLevel` RPC
- Valid levels: off, minimal, low, medium, high, xhigh
- Requires active session

### /compact [instructions]
- Compacts session context via `compactSession` API
- Optional custom instructions passed through
- Shows progress indicator (⏳ → ✅)

### /whoami
- Returns sender ID, name, chat ID, chat type, account ID
- No auth required — useful for debugging allowlist/pairing

## Pending Dwsy Confirmation (Phase 2)

### /bash <command>
- **Risk:** High — executes shell on gateway host
- **Proposed auth:** Reuse `allowFrom` list (only allowlisted senders can use)
- **Scope:** ExecGuard integration for command sanitization
- **Estimated:** ~60 lines

### /config [show|get <path>]
- **Phase 2a:** Read-only (show full config or get specific path)
- **Phase 2b (deferred):** set/unset with jsonc persistence
- **Estimated:** ~40 lines (read-only)

### /restart
- **Risk:** Medium — restarts gateway process
- **Gated by:** `commands.restart: true` in config (already exists)
- **Open question:** SIGUSR1 (graceful) vs process.exit (hard restart via supervisor)
- **Estimated:** ~20 lines

## Changes Made

| File | Change |
|------|--------|
| `commands.ts` | +3 LOCAL_COMMANDS entries, +3 bot.command handlers (~55 lines) |
| `plugin-api-factory.ts` | +cycleThinkingLevel method (~5 lines) |
| `commands.ts` help page 2 | Updated to show management commands |
