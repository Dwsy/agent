# Autoresearch: qqbot refactor to match openclaw-qqbot

## Objective
Refactor the pi-gateway qqbot plugin to fully align with openclaw-qqbot.
**Reference**: [openclaw-qqbot](https://github.com/tencent-connect/openclaw-qqbot)

## Metrics
- **Primary**: `outbound_msg_count` — number of outbound API calls per dispatch (target: 1)
- **Secondary**: `command_count` (# of slash commands recognized), `test_pass` (bool)

## Constraints
- Do NOT touch other plugin directories
- Do NOT modify core message pipeline
- Do NOT add new runtime dependencies
- `bun test` and `bun run tsc --noEmit` must pass

## Alignment Status

### ✅ Fully Implemented (vs openclaw-qqbot)
| Module | openclaw | pi-gateway | Notes |
|--------|----------|------------|-------|
| api.ts | ✅ | ✅ | sendC2CInputNotify, ensureAccessToken, fetchGatewayUrl |
| config.ts | ✅ | ✅ | resolveQqbotConfig, hasQqbotCredentials |
| credential-backup.ts | ✅ | ✅ | saveCredentialBackup, loadCredentialBackup, clearCredentialBackup |
| gateway.ts | ✅ | ✅ | WebSocket connect, READY, heartbeat, reconnect |
| handlers.ts | ✅ | ✅ | event parsing, dispatch, respondWith, slash command intercept |
| index.ts | ✅ | ✅ | init, start/stop |
| media.ts | ✅ | ✅ | sendQqbotMedia |
| outbound.ts | ✅ | ✅ | sendQqbotText, encodeQqbotTarget, text chunking |
| streaming.ts | ✅ | ✅ | streaming adapter (disabled by default) |
| types.ts | ✅ | ✅ | QqbotInboundEvent, QqbotMessageContext, etc. |
| actions.ts | ✅ | ✅ | deleteQqbotOutbound, editQqbotOutbound |
| ref-index-store.ts | ✅ | ✅ | REFIDX storage + quote context injection |
| slash-commands.ts | ✅ | ✅ | Full command registry: /bot-ping, /bot-help, /bot-version, /bot-logs |
| typing-keepalive.ts | ✅ | ✅ | Periodic typing notify refresh |
| startup-greeting.ts | ✅ | ✅ | Gateway ready notification to admins |
| known-users.ts | ✅ | ✅ | User interaction recording + persistence |
| inbound-attachments.ts | ✅ | ✅ | Image/voice/file attachment processing |
| admin-resolver.ts | ✅ | ✅ | Admin resolution from allowFrom/adminIds |
| session-store.ts | ✅ | ✅ | SessionId/lastSeq persistence for resume |
| proactive.ts | ✅ | ✅ | Proactive C2C message sending |
| utils/platform.ts | ✅ | ✅ | Cross-platform paths, home dir |
| utils/update-checker.ts | ✅ | ✅ | npm registry version check |

### ❌ Not Implemented (framework dependency)
| Module | Reason |
|--------|--------|
| channel.ts | Plugin definition + SDK delegation (pi-gateway uses different plugin API) |
| image-server.ts | HTTP server with port binding — architectural conflict with pi-gateway |
| outbound-deliver.ts | Requires `blockStreaming: true` framework support |
| reply-dispatcher.ts | Requires `blockStreaming: true` framework support |
| onboarding.ts | Depends on `openclaw/plugin-sdk` types (ChannelOnboardingAdapter) |
| stt.ts | Depends on ffmpeg audio conversion |
| message-queue.ts | Partially covered by dispatchLock; full queue needs streaming support |

## Experiments

### ✅ Baseline (2026-03-22)
- `streaming.enabled = false` (fixes N-message bug)
- `respondWith` callback added
- 3 slash commands: /bot-ping, /bot-help, /bot-version
- **Results**: outbound_msg_count=1, command_count=3, test_pass=24/24

### ✅ Exp #2 (2026-03-22)
- C2C Typing Indicator via sendC2CInputNotify

### ✅ Exp #3 (2026-03-22)
- per-user dispatch lock (prevents concurrent dispatch → out-of-order)

### ✅ Exp #4 (2026-03-22)
- Credential backup/restore in ~/.pi/agent/qqbot-credentials/

### ✅ Exp #5 (2026-03-22)
- REFIDX quote context via ext array parsing

### ✅ Exp #6-11 (2026-03-22)
- Full slash-commands framework (4 commands including /bot-logs)
- New modules: utils/platform, utils/update-checker, startup-greeting, typing-keepalive
- New modules: inbound-attachments, known-users, admin-resolver, session-store, proactive

## Final Metrics
```
outbound_msg_count = 1   ← optimal
command_count       = 4   ← /bot-ping, /bot-help, /bot-version, /bot-logs
test_pass          = 29/29
type_errors        = 0
```
