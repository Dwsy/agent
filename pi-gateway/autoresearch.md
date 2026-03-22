# Autoresearch: qqbot 完全对齐 openclaw-qqbot

## 参考版本
**openclaw-qqbot@1.5.5** — npm 最新版，2026-03 对齐

## 状态：完成 ✅
25 次实验，指标持续稳定。

## 核心指标
```
outbound_msg_count = 1    ← 无重复消息
command_count       = 4    ← /bot-ping, /bot-help, /bot-version, /bot-logs
test_pass          = 97/97 ← 覆盖 14 个测试文件
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
| `normalizeMediaTags` | outbound.ts sendQqbotText/sendQqbotKeyboard, media.ts |
| `filterInternalMarkers` | outbound.ts sendQqbotText/sendQqbotKeyboard |
| `parseFaceTags` | handlers.ts stripMentions() |
| `setTyping` (streaming) | streaming.ts → sendC2CInputNotify |

## 测试覆盖（14 文件，97 测试）

| 测试文件 | 覆盖内容 |
|---------|---------|
| `qqbot-config.test.ts` | 配置解析 |
| `qqbot-credential-backup.test.ts` | 凭证备份/恢复 |
| `qqbot-events.test.ts` | 事件解析 |
| `qqbot-outbound.test.ts` | 出站消息（分片/键盘/被动回复） |
| `qqbot-targets.test.ts` | 目标编码/解析 |
| `qqbot-media-tags.test.ts` | normalizeMediaTags |
| `qqbot-text-parsing.test.ts` | filterInternalMarkers/parseFaceTags/buildAttachmentSummaries |
| `qqbot-ref-index.test.ts` | ref-index-store |
| `qqbot-outbound-utils.test.ts` | guessFileType/chunkQqbotText |
| `qqbot-slash-commands.test.ts` | getCommandCount/getPluginVersion |
| `qqbot-admin-resolver.test.ts` | isAdmin/resolveAdminOpenIds/getFirstAdmin |
| `qqbot-utils-extra.test.ts` | normalizeQqbotTarget/formatVoiceText |
| `qqbot-reply-state.test.ts` | ensurePassiveSendAllowed/rememberQqbotReplyState |
| `streaming-bench.test.ts` | benchmark（基准测试） |

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

## Experiments (25 total)
Baseline + #2-#25: 全部 keep

## Constraints
- 不修改核心消息管道
- 不新增运行时依赖
- 测试和类型检查必须通过
