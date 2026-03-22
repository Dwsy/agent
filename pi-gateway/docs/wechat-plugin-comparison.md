# WeChat Plugin 移植对比总结

## 文件清单对比

| 原版文件 | 行数 | 移植版文件 | 行数 | 状态 | 优先级 |
|----------|------|-----------|------|------|--------|
| src/channel.ts | 380 | index.ts | 191 | ⚠️ 需扩展 | P0 |
| src/runtime.ts | 70 | types.ts | 215 | ✅ 已有 | - |
| src/api/api.ts | 240 | api.ts | 124 | ⚠️ 需补充 | P0 |
| src/api/types.ts | 180 | types.ts | 215 | ✅ 已有 | - |
| src/api/config-cache.ts | 80 | - | - | ❌ 缺失 | P1 |
| src/api/session-guard.ts | 60 | - | - | ❌ 缺失 | P1 |
| src/auth/accounts.ts | 320 | config.ts | 58 | ⚠️ 需扩展 | P0 |
| src/auth/login-qr.ts | 350 | - | - | ❌ 缺失 | P0 |
| src/auth/pairing.ts | 120 | handlers.ts | 304 | ⚠️ 部分有 | P1 |
| src/cdn/aes-ecb.ts | 30 | media.ts | 356 | ✅ 已有 | - |
| src/cdn/cdn-upload.ts | 95 | media.ts | 356 | ✅ 已有 | - |
| src/cdn/cdn-url.ts | 25 | media.ts | 356 | ✅ 已有 | - |
| src/cdn/pic-decrypt.ts | 100 | media.ts | 356 | ⚠️ 需验证 | P1 |
| src/cdn/upload.ts | 160 | media.ts | 356 | ✅ 已有 | - |
| src/media/media-download.ts | 175 | - | - | ❌ 缺失 | P1 |
| src/media/mime.ts | 80 | - | - | ❌ 缺失 | P2 |
| src/media/silk-transcode.ts | 75 | - | - | ❌ 缺失 | P2 |
| src/messaging/send.ts | 270 | outbound.ts | 236 | ✅ 已有 | - |
| src/messaging/send-media.ts | 85 | media.ts | 356 | ⚠️ 需集成 | P0 |
| src/messaging/inbound.ts | 200 | handlers.ts | 304 | ✅ 已有 | - |
| src/messaging/process-message.ts | 580 | handlers.ts | 304 | ⚠️ 简化版 | P0 |
| src/messaging/debug-mode.ts | 60 | - | - | ❌ 缺失 | P2 |
| src/messaging/error-notice.ts | 35 | - | - | ❌ 缺失 | P2 |
| src/messaging/slash-commands.ts | 105 | - | - | ❌ 缺失 | P2 |
| src/monitor/monitor.ts | 260 | gateway.ts | 72 | ⚠️ 简化版 | P0 |
| src/storage/state-dir.ts | 15 | - | - | ❌ 缺失 | P1 |
| src/storage/sync-buf.ts | 85 | - | - | ❌ 缺失 | P0 |
| src/util/logger.ts | 135 | - | - | ❌ 缺失 | P2 |
| src/util/random.ts | 20 | - | - | ❌ 缺失 | P2 |
| src/util/redact.ts | 50 | - | - | ❌ 缺失 | P2 |
| src/config/config-schema.ts | 30 | config.ts | 58 | ✅ 已有 | - |
| src/log-upload.ts | 140 | - | - | ❌ 缺失 | P3 |
| - | - | streaming.ts | 102 | ⚠️ 占位 | P3 |
| - | - | actions.ts | 69 | ✅ 已有 | - |

## 功能对齐矩阵

### P0 - 必须实现（MVP）

| 功能 | 原版 | 移植版 | 状态 | 缺失内容 |
|------|------|--------|------|----------|
| **核心消息** |
| 文本收发 | ✅ 270L | ✅ 236L | ✅ | - |
| context_token 缓存 | ✅ 200L | ✅ 304L | ✅ | - |
| 消息去重 | ✅ | ✅ | ✅ | - |
| Markdown 转换 | ✅ | ✅ | ✅ | - |
| 消息分块 | ✅ | ✅ | ✅ | - |
| **QR 登录** |
| 获取 QR 码 | ✅ 350L | ❌ 0L | ❌ | 完整实现缺失 |
| 轮询扫码状态 | ✅ | ❌ | ❌ | - |
| 账号存储 | ✅ 320L | ⚠️ 58L | ⚠️ | 需扩展多账号 |
| QR 刷新（3次） | ✅ | ❌ | ❌ | - |
| **媒体消息** |
| CDN 上传 | ✅ 160L | ✅ 356L | ✅ | - |
| CDN 下载 | ✅ 175L | ⚠️ 356L | ⚠️ | 需验证解密 |
| AES-128-ECB | ✅ 30L | ✅ | ✅ | - |
| 媒体发送集成 | ✅ 85L | ⚠️ | ⚠️ | outbound 需集成 |
| **同步与会话** |
| 同步游标持久化 | ✅ 85L | ❌ 0L | ❌ | 完整缺失 |
| 会话过期处理 | ✅ 60L | ❌ 0L | ❌ | 完整缺失 |
| **网关** |
| Long-poll 循环 | ✅ 260L | ⚠️ 72L | ⚠️ | 需补充重连/退避 |
| 路由分发 | ✅ 580L | ⚠️ 304L | ⚠️ | 需补充完整流程 |

### P1 - 应该实现

| 功能 | 原版 | 移植版 | 状态 | 缺失内容 |
|------|------|--------|------|----------|
| **账号管理** |
| 多账号索引 | ✅ | ⚠️ | ⚠️ | 需扩展 |
| 账号 ID 规范化 | ✅ | ❌ | ❌ | - |
| **消息处理** |
| 引用消息解析 | ✅ | ✅ | ✅ | - |
| 语音转文字 | ✅ | ✅ | ✅ | voice_item.text |
| **错误处理** |
| 错误通知 | ✅ 35L | ❌ 0L | ❌ | - |
| Route Tag | ✅ | ❌ | ❌ | - |
| **媒体增强** |
| MIME 类型检测 | ✅ 80L | ❌ 0L | ❌ | - |
| 图片解密 | ✅ 100L | ⚠️ | ⚠️ | 需验证 |

### P2 - 可以延后

| 功能 | 原版 | 移植版 | 状态 | 缺失内容 |
|------|------|--------|------|----------|
| **Typing** |
| getTypingTicket | ✅ | ❌ 0L | ❌ | 完整缺失 |
| sendTyping | ✅ | ❌ 0L | ❌ | - |
| Typing 保活 | ✅ | ❌ 0L | ❌ | - |
| **语音** |
| SILK 转码 | ✅ 75L | ❌ 0L | ❌ | 完整缺失 |
| **命令与调试** |
| Slash 命令 | ✅ 105L | ❌ 0L | ❌ | 完整缺失 |
| 调试模式 | ✅ 60L | ❌ 0L | ❌ | 完整缺失 |
| **工具** |
| 结构化日志 | ✅ 135L | ❌ 0L | ❌ | 完整缺失 |
| 脱敏 | ✅ 50L | ❌ 0L | ❌ | 完整缺失 |

### P3 - 明确排除

| 功能 | 原版 | 移植版 | 状态 | 原因 |
|------|------|--------|------|------|
| 群聊支持 | ❌ | ❌ | - | ilink API 限制 |
| 消息编辑 | ❌ | ❌ | - | ilink API 限制 |
| 消息删除 | ❌ | ❌ | - | ilink API 限制 |
| Reaction | ❌ | ❌ | - | ilink API 限制 |
| 原生流式 | ❌ | ⚠️ 102L | 占位 | 协议不支持 |
| 日志上传 | ✅ 140L | ❌ | 排除 | 非核心 |

## 需要新增的文件

| 文件 | 行数估算 | 职责 |
|------|----------|------|
| accounts.ts | ~300 | QR 登录、账号存储、多账号管理 |
| session.ts | ~100 | 同步游标、会话过期 |
| commands.ts | ~100 | Slash 命令处理 |
| logger.ts | ~150 | 结构化日志（脱敏） |
| mime.ts | ~80 | MIME 类型检测 |

## 需要扩展的文件

| 文件 | 当前行数 | 目标行数 | 需要补充 |
|------|----------|----------|----------|
| index.ts | 191 | ~350 | 多账号管理、完整生命周期 |
| api.ts | 124 | ~250 | getConfig, sendTyping, QR 登录 API |
| gateway.ts | 72 | ~200 | 同步游标、会话过期、重连退避 |
| handlers.ts | 304 | ~500 | 媒体下载、错误通知、命令处理 |
| config.ts | 58 | ~150 | 多账号配置、账号存储 |

## 工作量估算

| 阶段 | 任务数 | 预计工时 |
|------|--------|----------|
| Phase 1: 核心架构 | 4 | 10h |
| Phase 2: API 与网关 | 3 | 7h |
| Phase 3: 消息处理 | 5 | 10h |
| Phase 4: 出站消息 | 3 | 4h |
| Phase 5: 媒体处理 | 4 | 11h |
| Phase 6: 账号与登录 | 3 | 8h |
| Phase 7: 高级功能 | 5 | 12h |
| Phase 8: 测试与文档 | 3 | 13h |
| **总计** | **30** | **75h** |

## 对比 telegram 插件

| 维度 | telegram | 移植版 wechat | 差距 |
|------|----------|---------------|------|
| 总行数 | 6379 | 1789 | 4590 |
| 文件数 | 31 | 11 | 20 |
| 核心功能 | 完整 | 部分 | 需补充 |
| 流式支持 | ✅ 原生 | ❌ 不支持 | - |
| 媒体支持 | ✅ 完整 | ⚠️ 部分 | 需完善 |
| 群聊支持 | ✅ | ❌ | - |
| 命令系统 | ✅ | ❌ | 需实现 |
| 调试功能 | ✅ | ❌ | 需实现 |

## 下一步行动

### 立即执行（P0）

1. **创建 `accounts.ts`** - 实现 QR 登录和账号存储
2. **创建 `session.ts`** - 实现同步游标持久化
3. **扩展 `api.ts`** - 添加 getConfig, sendTyping, QR 登录 API
4. **扩展 `gateway.ts`** - 添加同步游标、会话过期、重连逻辑
5. **集成 `media.ts`** - 在 `outbound.ts` 中调用上传函数

### 短期目标（P1）

1. 完善错误处理和错误通知
2. 添加 MIME 类型检测
3. 验证图片解密流程

### 中期目标（P2）

1. 实现 Typing 指示器
2. 实现 Slash 命令
3. 实现调试模式
4. 添加结构化日志

### 长期目标（P3）

1. SILK 语音转码
2. 流式模拟（可选）
