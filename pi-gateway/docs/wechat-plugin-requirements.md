# WeChat Plugin 移植需求文档

## 简介

将 `@tencent-weixin/openclaw-weixin` npm 包完整移植到 pi-gateway 插件架构，对齐 telegram 插件的功能完整度。目标是为 pi-gateway 提供微信个人号通道支持，使用 ilink API (HTTP long-poll)。

## 术语表

| 术语 | 定义 |
|------|------|
| **ilink API** | 微信个人号机器人 API，提供 getUpdates/sendMessage 等端点 |
| **context_token** | 每条消息携带的上下文令牌，回复时必须回传以关联对话 |
| **CDN 加密** | 微信媒体文件通过 AES-128-ECB 加密上传/下载 |
| **Long-poll** | HTTP 长轮询机制，客户端 POST getUpdates 并等待消息 |
| **同步游标** | get_updates_buf，用于断线重连后避免重复消息 |
| **typing_ticket** | 用于发送正在输入状态的票据 |
| **ChannelPlugin** | pi-gateway 的通道插件接口 |
| **DM Policy** | 私聊策略：open/allowlist/pairing/disabled |

## 需求

### REQ-1: 核心消息收发

**User Story:** 作为用户，我希望能通过微信私聊与 AI 进行文本对话

#### 验收标准

1. WHEN 收到微信消息，THE 系统 SHALL 正确解析 item_list 提取文本内容
2. WHEN 收到消息，THE 系统 SHALL 缓存 context_token 以 `{accountId}:{userId}` 为 key
3. WHEN 发送回复，THE 系统 SHALL 携带缓存的 context_token
4. THE 系统 SHALL 支持 4000 字符的消息分块发送
5. WHEN context_token 缺失，THE 系统 SHALL 记录警告但仍尝试发送
6. THE 系统 SHALL 将 Markdown 转换为纯文本（移除代码块、图片、链接语法）

---

### REQ-2: QR 码登录

**User Story:** 作为用户，我希望能通过扫描 QR 码连接微信账号

#### 验收标准

1. WHEN 执行登录命令，THE 系统 SHALL 调用 `ilink/bot/get_bot_qrcode` 获取二维码
2. THE 系统 SHALL 显示 QR 码（终端/网页）
3. WHEN 用户扫码确认，THE 系统 SHALL 轮询 `ilink/bot/get_qrcode_status` 直到 `confirmed`
4. WHEN 登录成功，THE 系统 SHALL 保存 `bot_token`、`ilink_bot_id`、`baseUrl` 到本地存储
5. WHEN QR 码过期，THE 系统 SHALL 自动刷新（最多 3 次）
6. THE 系统 SHALL 支持多账号管理，每个账号独立存储 token

---

### REQ-3: 媒体消息处理

**User Story:** 作为用户，我希望能发送和接收图片、视频、文件

#### 验收标准

1. WHEN 发送图片，THE 系统 SHALL 执行以下流程：
   - 计算 MD5 和 AES-128-ECB 密文大小
   - 调用 `getUploadUrl` 获取 `upload_param`
   - 加密并上传到 CDN
   - 发送 `image_item` 消息
2. WHEN 接收图片，THE 系统 SHALL 从 CDN 下载并解密
3. THE 系统 SHALL 根据文件扩展名/MIME 类型识别媒体类型
4. THE 系统 SHALL 支持以下媒体类型：image/*, video/*, application/* (文件)
5. IF 上传失败，THE 系统 SHALL 重试最多 3 次（仅服务端错误）

---

### REQ-4: 语音消息

**User Story:** 作为用户，我希望能接收语音消息并转换为文字

#### 验收标准

1. WHEN 收到语音消息，THE 系统 SHALL 从 CDN 下载并解密
2. THE 系统 SHALL 检测 SILK 编码格式
3. IF 语音消息包含 `voice_item.text` 字段，THE 系统 SHALL 直接使用转写文本
4. IF 需要本地转码，THE 系统 SHALL 将 SILK 转换为 WAV/MP3
5. THE 系统 SHALL 支持配置外部语音转文字服务

---

### REQ-5: 同步与持久化

**User Story:** 作为系统，我需要保证消息不丢失、不重复

#### 验收标准

1. THE 系统 SHALL 持久化 `get_updates_buf` 同步游标
2. WHEN 重启服务，THE 系统 SHALL 从上次位置继续同步
3. THE 系统 SHALL 维护消息去重缓存（TTL 30分钟，max 1000 条）
4. WHEN 收到 errcode -14（会话过期），THE 系统 SHALL 暂停轮询 8 分钟
5. THE 系统 SHALL 在连续 3 次失败后执行指数退避重连

---

### REQ-6: Typing 指示器

**User Story:** 作为用户，我希望能看到"正在输入"提示

#### 验收标准

1. WHEN 开始生成回复，THE 系统 SHALL 调用 `sendTyping({ status: 1 })`
2. WHEN 回复完成，THE 系统 SHALL 调用 `sendTyping({ status: 2 })`
3. THE 系统 SHALL 每 5 秒发送一次 typing 保活
4. IF 获取 typing_ticket 失败，THE 系统 SHALL 静默降级（不发送 typing）

---

### REQ-7: 配对验证与安全

**User Story:** 作为用户，我需要控制谁能与我的机器人对话

#### 验收标准

1. THE 系统 SHALL 支持 dmPolicy 配置：open/allowlist/pairing/disabled
2. WHEN dmPolicy 为 pairing 且用户未配对，THE 系统 SHALL 返回配对码
3. THE 系统 SHALL 支持 allowFrom 白名单
4. THE 系统 SHALL 验证每条消息的 senderId 是否在允许列表

---

### REQ-8: 多账号支持

**User Story:** 作为用户，我希望能同时连接多个微信账号

#### 验收标准

1. THE 系统 SHALL 支持配置多个账号
2. 每个账号 SHALL 独立维护 context_token 缓存
3. 每个账号 SHALL 独立维护同步游标
4. THE 系统 SHALL 支持指定默认账号
5. THE 系统 SHALL 支持 `accountId:chatId` 格式的 target 路由

---

### REQ-9: 插件架构集成

**User Story:** 作为开发者，我需要插件与 pi-gateway 完美集成

#### 验收标准

1. THE 系统 SHALL 实现 `ChannelPlugin` 接口的所有方法
2. THE 系统 SHALL 正确声明 capabilities 矩阵
3. THE 系统 SHALL 支持 `resolveTarget` 解析 target 字符串
4. THE 系统 SHALL 支持 `ChannelSecurityAdapter` 安全适配器
5. THE 系统 SHALL 支持 `ChannelStreamingAdapter` 流式适配器（占位）

---

### REQ-10: 错误处理与日志

**User Story:** 作为运维人员，我需要清晰的日志和错误处理

#### 验收标准

1. THE 系统 SHALL 记录所有 API 调用（脱敏 token）
2. THE 系统 SHALL 记录每条入站消息的关键信息（sender, text length, itemTypes）
3. WHEN 发送失败，THE 系统 SHALL 记录完整错误栈
4. THE 系统 SHALL 支持调试模式，记录全链路耗时
5. THE 系统 SHALL 记录 CDN 上传/下载的详细步骤

---

### REQ-11: Slash 命令

**User Story:** 作为用户，我希望能通过命令控制机器人

#### 验收标准

1. THE 系统 SHALL 支持 `/help` 命令显示帮助
2. THE 系统 SHALL 支持 `/status` 命令显示连接状态
3. THE 系统 SHALL 支持 `/debug` 命令切换调试模式
4. WHEN 命令被处理，THE 系统 SHALL 跳过 AI 管道直接返回

---

### REQ-12: 调试模式

**User Story:** 作为开发者，我需要诊断性能问题

#### 验收标准

1. WHEN 调试模式开启，THE 系统 SHALL 记录：
   - 平台延迟（eventTime → receivedAt）
   - 入站处理耗时（auth + route + mediaDownload）
   - AI 生成耗时
   - 发送耗时
2. THE 系统 SHALL 在回复末尾附加调试信息
3. 调试模式 SHALL 通过环境变量或 `/debug` 命令切换
