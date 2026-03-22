# Autoresearch: qqbot refactor to match openclaw-qqbot

## Objective
Refactor the pi-gateway qqbot plugin to fix:
1. **Streaming bug**: `onStreamDelta` does delete+resend on every delta → users receive N duplicate messages
2. **Missing slash commands**: No built-in commands like `/bot-ping`, `/bot-help`
3. **Reference**: [openclaw-qqbot](https://github.com/tencent-connect/openclaw-qqbot)

**Key architectural insight from reference**: openclaw uses `blockStreaming: true` in capabilities so the framework collects full response and calls `deliver` once — not `onStreamDelta` per-delta. The pi-gateway doesn't support `blockStreaming` yet, so we disabled streaming and use `respond` for single-shot delivery.

## Metrics
- **Primary**: `outbound_msg_count` — number of outbound API calls per dispatch (target: 1, current streaming: N)
- **Secondary**: `command_count` (# of slash commands recognized), `test_pass` (bool)

## Files in Scope
- `src/plugins/builtin/qqbot/handlers.ts` — event parsing, dispatch, slash commands
- `src/plugins/builtin/qqbot/config.ts` — default streaming config
- `src/plugins/builtin/qqbot/tests/streaming-bench.test.ts` — benchmark tests
- `src/plugins/builtin/qqbot/tests/unit/qqbot-config.test.ts` — config tests

## Off Limits
- Do NOT touch other plugin directories (telegram, discord, wechat)
- Do NOT modify core message pipeline
- Do NOT add new runtime dependencies

## Constraints
- `bun test` must pass after each change
- `bun run tsc --noEmit` must pass

## What's Been Tried

### ✅ Baseline (2026-03-22) — KEEP
- `streaming.enabled` 默认改为 `false`（修复 delete+resend N消息bug）
- 添加 `respondWith` 回调到 dispatch
- 添加 3 个斜杠命令：`/bot-ping`, `/bot-help`, `/bot-version`
- **Results**: outbound_msg_count=1, command_count=3, test_pass=24/24

### ✅ Exp #2 (2026-03-22) — KEEP
- 添加 C2C Typing Indicator（"正在输入..."通知）
- **Results**: metric unchanged (1), feature improvement

### ✅ Exp #3 (2026-03-22) — KEEP
- 添加 per-user dispatch lock（防止并发导致响应乱序）
- **Results**: metric unchanged (1), stability improvement

### ✅ Exp #4 (2026-03-22) — KEEP
- 添加凭证备份恢复（~/.pi/agent/qqbot-credentials/）
- **Results**: metric unchanged (1), hot-reload resilience

### ✅ Exp #5 (2026-03-22) — KEEP
- 添加 REFIDX 引用消息上下文（ext 数组解析，引用消息内容注入）
- **Results**: metric unchanged (1), quote context support

### Remaining (P2/P3)
- 图床服务器（HTTP 图片缓存，减少重复上传）
- /bot-upgrade 热更新命令



