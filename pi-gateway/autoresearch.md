# Autoresearch: qqbot refactor to match openclaw-qqbot

## Objective

Refactor the pi-gateway qqbot plugin to fix:
1. **Streaming bug**: `onStreamDelta` does delete+resend on every delta → users receive N duplicate messages
2. **Missing slash commands**: No built-in commands like `/bot-ping`, `/bot-help`
3. **Reference**: [openclaw-qqbot](https://github.com/tencent-connect/openclaw-qqbot)

**Key architectural insight from reference**: openclaw uses `blockStreaming: true` in capabilities so the framework collects full response and calls `deliver` once — not `onStreamDelta` per-delta. The pi-gateway doesn't support `blockStreaming` yet, so we must disable streaming and use `respond` for single-shot delivery.

## Metrics
- **Primary**: `outbound_msg_count` — number of outbound API calls per dispatch (target: 1, current streaming: N)
- **Secondary**: `command_recognized` (bool), `test_pass_rate` (%)

## Files in Scope
- `src/plugins/builtin/qqbot/handlers.ts` — event parsing, dispatch, streaming
- `src/plugins/builtin/qqbot/streaming.ts` — streaming adapter
- `src/plugins/builtin/qqbot/config.ts` — default streaming config
- `src/plugins/builtin/qqbot/index.ts` — plugin registration, streaming adapter wiring
- `src/plugins/builtin/qqbot/outbound.ts` — text/media sending
- `src/plugins/builtin/qqbot/commands.ts` — NEW: slash command handlers (to create)
- `src/plugins/builtin/qqbot/tests/unit/` — test files

## Off Limits
- Do NOT touch other plugin directories (telegram, discord, wechat)
- Do NOT modify core message pipeline (src/gateway/message-pipeline.ts)
- Do NOT add new runtime dependencies

## Constraints
- `bun test` must pass after each change
- `bun run tsc --noEmit` must pass (no type errors)
- No change to the public plugin API (ChannelPlugin interface shape)

## What's Been Tried

### Baseline (2026-03-22)
- Current `onStreamDelta` in handlers.ts: every delta triggers delete + send = ~5-10 messages per stream
- No slash command support
- Streaming enabled by default (`streaming.enabled = true`)
- Config defaults: `editThrottleMs=1200`, `streamStartChars=80`
