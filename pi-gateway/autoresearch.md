# Autoresearch: qqbot 完全对齐 openclaw-qqbot

## Objective
pi-gateway qqbot 插件完全对齐官方 openclaw-qqbot 功能。

**Reference**: [openclaw-qqbot](https://github.com/tencent-connect/openclaw-qqbot)

## 核心指标
```
outbound_msg_count = 1    ← 无重复消息 ✅
command_count       = 4    ← /bot-ping, /bot-help, /bot-version, /bot-logs ✅
test_pass          = 29/29 ✅
type_errors        = 0    ✅
```

## 模块对齐状态

### ✅ 完全实现 (24/26)
| 模块 | 说明 |
|------|------|
| actions.ts | deleteQqbotOutbound, editQqbotOutbound |
| admin-resolver.ts | allowFrom/adminIds 管理员解析 |
| api.ts | send/recv + **onMessageSent hook** + ref_idx 捕获 |
| config.ts | resolveQqbotConfig, hasQqbotCredentials |
| credential-backup.ts | save/load/clearCredentialBackup |
| gateway.ts | WebSocket + **onMessageSent 注册** + heartbeat + reconnect |
| handlers.ts | event parsing + dispatch + slash intercept + quote inject |
| inbound-attachments.ts | 图片/语音/文件附件处理 |
| index.ts | init/start/stop + credential restore on boot |
| known-users.ts | 用户交互记录持久化 |
| media.ts | sendQqbotMedia + **ref_idx meta 传递** |
| outbound.ts | sendQqbotText + sendQqbotKeyboard + **ref_idx meta 传递** |
| proactive.ts | 主动 C2C 消息发送 |
| ref-index-store.ts | REFIDX 索引缓存 + quote 上下文注入 |
| session-store.ts | SessionId/lastSeq 持久化 |
| slash-commands.ts | **完整命令框架** (4命令 + ? 帮助) |
| startup-greeting.ts | Gateway 就绪通知管理员 |
| streaming.ts | 流式适配器 (disabled by default) |
| types.ts | 完整类型定义 |
| typing-keepalive.ts | 每 20s 重发"正在输入"保持状态 |
| utils/image-size.ts | PNG/JPEG 尺寸解析 + markdown 图片格式化 |
| utils/media-tags.ts | **normalizeMediaTags** — AI 标签纠错 |
| utils/platform.ts | 跨平台路径工具 |
| utils/text-parsing.ts | **filterInternalMarkers** + parseFaceTags |
| utils/update-checker.ts | npm registry 版本检查 |

### ❌ 框架依赖 (4/26)
| 模块 | 原因 |
|------|------|
| channel.ts | 依赖 openclaw plugin SDK 的 ChannelPlugin 定义 |
| image-server.ts | HTTP 服务器监听端口，与 pi-gateway 架构冲突 |
| outbound-deliver.ts | 需 blockStreaming 框架支持 |
| reply-dispatcher.ts | 需 blockStreaming 框架支持 |

## 关键实现细节

### onMessageSent Hook (最关键新功能)
```
出站消息 → api.ts sendQqbotMessage() → 捕获 ref_idx
  → gateway.ts onMessageSent 注册
  → ref-index-store.ts setRefIndex()
  → 用户引用 bot 消息时可通过 ref_msg_idx 查找内容
```

### normalizeMediaTags
AI 模型常生成畸形标签 `<qq_img>`, `<img src="...">`, `<qqmedia file="..." />` 等，发送前统一修正为标准格式 `<qqimg>/path</qqimg>`。

### filterInternalMarkers
移除 `[[reply_to: xxx]]`、`@image:xxx.png` 等框架内部标记，防止 AI 错误输出。

## Experiments (14 total)

| # | 描述 | 结果 |
|---|------|------|
| Baseline | streaming disabled + 3命令 + respondWith | ✅ keep |
| #2 | C2C Typing Indicator | ✅ keep |
| #3 | dispatch lock | ✅ keep |
| #4 | 凭证备份恢复 | ✅ keep |
| #5 | REFIDX 引用上下文 | ✅ keep |
| #6 | 完整斜杠命令框架 (4命令) | ✅ keep |
| #7-9 | 新增模块 | ✅ keep |
| #10-11 | admin-resolver + session-store + proactive | ✅ keep |
| #12 | 最终对齐状态 | ✅ keep |
| #13 | **onMessageSent hook + ref_idx 捕获** | ✅ keep |
| #14 | utils 完整化 | ✅ keep |

## Constraints
- 不修改核心消息管道
- 不新增运行时依赖
- 测试和类型检查必须通过
