# Telegram Bot: pi-gateway vs OpenClaw 功能差距分析

基于 OpenClaw `src/telegram/` (88 个 .ts 文件) 与 pi-gateway `src/plugins/builtin/telegram.ts` (200 行) 的逐项对比。

## 已对齐的功能

| 功能 | OpenClaw | pi-gateway | 状态 |
|------|----------|------------|------|
| grammy 库 | grammy + @grammyjs/* | grammy | 对齐 |
| DM 接收和回复 | bot.on("message") | bot.on("message:text") | 对齐 |
| 群组消息 | group + supergroup | group + supergroup | 对齐 |
| requireMention | per-group 配置 | per-group 配置 | 对齐 |
| DM pairing | 8 字符码 + approve | 8 字符码 + approve | 对齐 |
| allowlist/allowFrom | 多层策略 | 4 种策略 | 对齐 |
| 打字指示器 | sendChatAction("typing") | sendChatAction("typing") | 对齐 |
| 消息分片 | 4096 字符限制 | 4096 字符限制 | 对齐 |
| /new (session reset) | 重置 session | RPC new_session | 对齐 |
| /status | session 状态 | session 状态 | 对齐 |
| 论坛话题 (topics) | message_thread_id 路由 | topicId 路由 | 对齐 |
| Session key 格式 | agent:{id}:telegram:group:{chatId} | 同格式 | 对齐 |

## 未对齐的功能 (需要迭代)

### P0 — 核心缺失

| 功能 | OpenClaw 实现 | pi-gateway 现状 | 差距 |
|------|-------------|----------------|------|
| **图片/媒体接收** | download.ts: 下载文件 -> base64 -> agent | 只处理 text 消息 | 需要 `bot.on("message:photo")` + 下载 + base64 |
| **Markdown -> HTML 格式化** | format.ts: 完整 Markdown IR -> Telegram HTML | 纯文本发送 | 需要 `parse_mode: "HTML"` + Markdown 转换 |
| **流式回复 (Draft Streaming)** | draft-stream.ts: 实时编辑消息显示打字中内容 | 等完整回复后一次发送 | 需要发初始消息 -> editMessageText 更新 |
| **消息去抖 (Debounce)** | inbound-debounce: 快速连续消息合并为一条 | 无去抖 | 连发多条消息会分别触发 agent |
| **sequentialize 中间件** | @grammyjs/runner sequentialize | 无 | 同一 chat 的消息可能乱序 |
| **apiThrottler** | @grammyjs/transformer-throttler | 无 | 高频操作可能触发 Telegram rate limit |

### P1 — 重要增强

| 功能 | OpenClaw 实现 | 差距 |
|------|-------------|------|
| **多 Telegram 账号** | accounts.ts: 多 bot token 多实例 | 只支持单 token |
| **Webhook 模式** | webhook.ts + webhook-set.ts | 只有 polling 模式 |
| **原生 slash 命令注册** | bot-native-commands.ts: 700 行，注册到 Telegram API | 只有 grammy bot.command 本地处理 |
| **Callback query (inline buttons)** | inline-buttons.ts + model-buttons.ts | 无按钮交互 |
| **贴纸处理** | sticker-cache.ts: 识别贴纸 + 缓存描述 | 无 |
| **语音消息** | voice.ts: 发送语音泡 | 无 |
| **Reaction 回复** | reaction-level.ts: 用 emoji reaction 确认 | 无 |
| **编辑消息检测** | bot-handlers.ts: edited_message 处理 | 只处理新消息 |
| **群组迁移** | group-migration.ts | 无 |
| **代理支持** | proxy.ts: HTTP proxy 透传 | 无 |

### P2 — 锦上添花

| 功能 | OpenClaw 实现 | 差距 |
|------|-------------|------|
| 群组历史回溯 | historyLimit, groupHistories | 无 |
| 发送消息缓存 | sent-message-cache.ts | 无 |
| update offset 持久化 | update-offset-store.ts | 无 |
| per-topic 技能/提示覆盖 | topic config + skill filters | 无 |
| API 请求日志 | api-logging.ts | 无 |
| 网络错误恢复 | network-errors.ts + retry | 无 |
| caption 智能分片 | caption.ts + draft-chunking.ts | 无 |

## 建议迭代优先级

```
Phase 1 (补齐核心):
  1. 图片/媒体接收 (photo + document + voice)
  2. Markdown -> Telegram HTML 格式化
  3. sequentialize + apiThrottler 中间件
  4. 消息去抖

Phase 2 (体验提升):
  5. 流式回复 (editMessageText 模式)
  6. 原生 slash 命令注册到 Telegram API
  7. Inline buttons (model 切换等)
  8. Webhook 模式 (生产部署)

Phase 3 (进阶):
  9. 多账号支持
  10. 语音消息 / 贴纸
  11. Reaction 确认
  12. 代理支持
```

## 代码量对比

| | OpenClaw | pi-gateway |
|--|---------|------------|
| Telegram 相关文件 | 88 个 .ts | 1 个 .ts |
| 估算代码行数 | ~8,000+ 行 | ~200 行 |
| 测试文件 | 40+ 个 test | 0 |

OpenClaw 的 Telegram 实现经过 2 年迭代，覆盖了几乎所有 Telegram Bot API 能力。pi-gateway 当前是 MVP 级别，核心消息收发通路已通，但格式化、媒体、流式等体验层需要逐步补齐。
