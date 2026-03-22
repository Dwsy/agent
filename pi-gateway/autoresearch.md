# Autoresearch: qqbot 完全对齐 openclaw-qqbot

## 状态：完成 ✅
18 次实验，指标持续稳定。

## 核心指标
```
outbound_msg_count = 1    ← 无重复消息
command_count       = 4    ← /bot-ping, /bot-help, /bot-version, /bot-logs
test_pass          = 29/29
type_errors        = 0
```

## 模块接入状态

所有模块函数均已接入 pi-gateway 生命周期：

| 函数 | 接入位置 |
|------|---------|
| `checkStartupGreeting` | gateway.ts READY 事件 |
| `triggerUpdateCheck` | index.ts init() |
| `recordUserInteraction` | handlers.ts handleQqbotEvent() |
| `flushRefIndex` | index.ts stop() |
| `flushKnownUsers` | index.ts stop() |
| `onMessageSent` hook | gateway.ts startQqbotGateway() |
| `normalizeMediaTags` | outbound.ts sendQqbotText/sendQqbotKeyboard, media.ts sendQqbotMedia |
| `filterInternalMarkers` | outbound.ts sendQqbotText/sendQqbotKeyboard |
| `parseFaceTags` | handlers.ts stripMentions() |
| `setTyping` (streaming) | streaming.ts → sendC2CInputNotify |

## 管道概览

```
入站: WebSocket → gateway.ts → handlers.ts → dispatch → Agent
         ↓ onMessageSent hook
      ref-index-store.ts (缓存 ref_idx)
         ↓ parseFaceTags + stripMentions
      已知用户记录 (known-users.ts)

出站: Agent 响应 → outbound.ts → normalizeMediaTags + filterInternalMarkers
                              ↓
                          sendQqbotMessage (api.ts)
                              ↓ onMessageSent hook
                          ref-index-store.ts (缓存 bot 消息 ref_idx)
```

## Experiments (18 total)
Baseline + #2-#18: 全部 keep

## Constraints
- 不修改核心消息管道
- 不新增运行时依赖
- 测试和类型检查必须通过
