# WeChat Plugin 实现计划

## 项目边界

### 必须实现（MVP）
- 核心消息收发（文本）
- QR 码登录流程
- 媒体消息（图片/视频/文件）
- Context token 缓存
- 同步游标持久化
- 多账号支持
- DM 策略与配对验证
- CDN 加密上传/下载
- 错误处理与重连

### 应该实现
- 语音消息处理（SILK 转码）
- Typing 指示器
- Slash 命令
- 调试模式
- 会话过期处理

### 可以延后
- 媒体下载后的本地处理（缩略图生成）
- 语音转文字（需外部服务）
- 流式模拟（通过消息编辑）

### 明确排除
- 群聊支持（ilink API 限制）
- 消息编辑/删除（ilink API 限制）
- Reaction（ilink API 限制）
- 原生流式输出（ilink API 限制）

### 技术约束
- ilink API 仅支持私聊
- 媒体文件必须 AES-128-ECB 加密
- context_token 必须回传，否则回复无法关联
- 同步游标不持久化会导致消息重复

---

## 阶段 1: 核心架构

### 1.1 项目结构初始化

**任务:**
- [x] 创建 `src/plugins/builtin/wechat/` 目录
- [x] 创建 `types.ts` 定义类型
- [x] 创建 `config.ts` 配置解析
- [x] 创建 `index.ts` 插件入口

**需求:** REQ-9

**涉及组件:** COMP-1, COMP-2, COMP-3

**预计工时:** 2h

---

### 1.2 类型定义

**任务:**
- [x] 定义 `WechatChannelConfig`
- [x] 定义 `WechatAccountConfig`
- [x] 定义 `WechatPluginRuntime`
- [x] 定义 `WechatAccountRuntime`
- [x] 定义 `WeixinMessage` 协议类型
- [x] 定义 `WechatMessageContext`
- [x] 定义 `CDNMedia` 类型

**需求:** REQ-9

**涉及组件:** COMP-2

**依赖:** Task 1.1

**预计工时:** 2h

---

### 1.3 配置解析

**任务:**
- [x] `resolveWechatConfig()` 解析通道配置
- [x] `resolveWechatAccounts()` 解析账号列表
- [x] `loadWechatAccount()` 加载账号数据
- [x] `saveWechatAccount()` 保存账号数据
- [x] 账号 ID 规范化（`xxx@im.bot` → `xxx-im-bot`）

**需求:** REQ-8

**涉及组件:** COMP-3

**依赖:** Task 1.2

**预计工时:** 2h

---

### 1.4 插件入口

**任务:**
- [x] 实现 `ChannelPlugin` 接口
- [x] 声明 `capabilities` 矩阵
- [x] 实现 `init()` 加载配置
- [x] 实现 `start()` 启动网关
- [x] 实现 `stop()` 停止网关
- [x] 实现 `resolveTarget()` 解析目标
- [x] 实现 `outbound.sendText()` 发送文本
- [x] 实现 `security` 适配器

**需求:** REQ-1, REQ-7, REQ-9

**涉及组件:** COMP-1

**依赖:** Task 1.3

**预计工时:** 4h

---

## 阶段 2: API 与网关

### 2.1 ilink API 客户端

**任务:**
- [x] `ilinkRequest()` 基础请求封装
- [x] `buildHeaders()` 构建请求头（含 `Authorization`, `X-WECHAT-UIN`）
- [x] `fetchWechatUpdates()` 长轮询消息
- [x] `sendWechatMessage()` 发送消息
- [x] `generateClientId()` 生成客户端 ID
- [x] 错误处理与重试逻辑

**需求:** REQ-1, REQ-10

**涉及组件:** COMP-4

**依赖:** Task 1.4

**预计工时:** 3h

---

### 2.2 长轮询网关

**任务:**
- [x] `startWechatGateway()` 启动轮询循环
- [x] `stopWechatGateway()` 停止轮询
- [x] 轮询间隔动态调整（`longpolling_timeout_ms`）
- [x] 重连逻辑（指数退避）
- [x] 错误日志记录
- [x] AbortSignal 支持

**需求:** REQ-5, REQ-10

**涉及组件:** COMP-5

**依赖:** Task 2.1

**预计工时:** 3h

---

### 2.3 同步游标管理

**任务:**
- [x] `getSyncBufPath()` 获取游标文件路径
- [x] `loadSyncBuf()` 加载游标
- [x] `saveSyncBuf()` 保存游标
- [x] 每次收到消息后更新游标
- [x] 重启后恢复游标

**需求:** REQ-5

**涉及组件:** COMP-12

**依赖:** Task 2.2

**预计工时:** 1h

---

## 阶段 3: 消息处理

### 3.1 入站消息解析

**任务:**
- [x] `parseWechatMessage()` 解析 ilink 消息
- [x] 提取文本（`item_list` → text）
- [x] 提取媒体（image/video/file/voice）
- [x] 提取引用消息（`ref_msg`）
- [x] 提取语音转文字（`voice_item.text`）
- [x] 构建 `WechatMessageContext`

**需求:** REQ-1

**涉及组件:** COMP-6

**依赖:** Task 2.2

**预计工时:** 3h

---

### 3.2 Context Token 缓存

**任务:**
- [x] `contextTokens: Map<string, string>` 缓存结构
- [x] `setContextToken(accountId, userId, token)` 存储
- [x] `getContextToken(accountId, userId)` 获取
- [x] 日志记录（脱敏 token）
- [x] 多账号隔离

**需求:** REQ-1

**涉及组件:** COMP-6

**依赖:** Task 3.1

**预计工时:** 1h

---

### 3.3 消息去重

**任务:**
- [x] `dedup: Map<string, number>` 去重缓存
- [x] `isDuplicate(messageId)` 检查
- [x] TTL 清理（30 分钟）
- [x] 最大条目限制（1000 条）

**需求:** REQ-5

**涉及组件:** COMP-16

**依赖:** Task 3.1

**预计工时:** 1h

---

### 3.4 DM 策略与配对验证

**任务:**
- [x] `checkDmPolicy()` 检查 DM 策略
- [x] `createPairingCode()` 生成配对码
- [x] `isSenderAllowed()` 白名单检查
- [x] 支持 `open/allowlist/pairing/disabled` 四种策略
- [x] 配对码过期处理

**需求:** REQ-7

**涉及组件:** COMP-14

**依赖:** Task 3.1

**预计工时:** 2h

---

### 3.5 消息路由与分发

**任务:**
- [x] `handleWechatMessage()` 主处理器
- [x] 调用 `parseWechatMessage()`
- [x] 调用 `checkDmPolicy()`
- [x] 调用 `isDuplicate()`
- [x] 调用 `api.resolveAgentRoute()`
- [x] 调用 `api.dispatch()` 分发消息
- [x] 实现 `respond` 回调

**需求:** REQ-1

**涉及组件:** COMP-6

**依赖:** Task 3.2, 3.3, 3.4

**预计工时:** 3h

---

## 阶段 4: 出站消息

### 4.1 文本消息发送

**任务:**
- [x] `sendWechatText()` 发送文本
- [x] `markdownToPlainText()` Markdown 转换
- [x] `chunkWechatText()` 消息分块（4000 字符）
- [x] 构建 `SendMessageReq`
- [x] 携带 `context_token`
- [x] 错误处理与日志

**需求:** REQ-1

**涉及组件:** COMP-7, COMP-15

**依赖:** Task 2.1

**预计工时:** 2h

---

### 4.2 键盘消息发送

**任务:**
- [x] `sendWechatKeyboard()` 发送键盘
- [x] 将 `InlineKeyboardMarkup` 转换为编号列表
- [x] 调用 `sendWechatText()` 发送

**需求:** REQ-1

**涉及组件:** COMP-7

**依赖:** Task 4.1

**预计工时:** 1h

---

### 4.3 Markdown 格式转换

**任务:**
- [x] 移除代码块语法
- [x] 移除图片语法
- [x] 转换链接为纯文本
- [x] 移除加粗/斜体标记
- [x] 移除标题标记
- [x] 保留换行

**需求:** REQ-1

**涉及组件:** COMP-15

**依赖:** 无

**预计工时:** 1h

---

## 阶段 5: 媒体处理

### 5.1 AES-128-ECB 加密

**任务:**
- [x] `encryptAesEcb()` 加密
- [x] `decryptAesEcb()` 解密
- [x] `aesEcbPaddedSize()` 计算密文大小
- [x] 单元测试

**需求:** REQ-3

**涉及组件:** COMP-8

**依赖:** 无

**预计工时:** 2h

---

### 5.2 CDN 上传

**任务:**
- [x] `getUploadUrl()` 获取上传参数
- [x] `uploadBufferToCdn()` 上传加密数据
- [x] `uploadWechatMedia()` 完整上传流程
- [x] `uploadWechatImage()` 上传图片
- [x] `uploadWechatVideo()` 上传视频
- [x] `uploadWechatFile()` 上传文件
- [x] 重试逻辑（3 次）
- [x] 错误处理

**需求:** REQ-3

**涉及组件:** COMP-8

**依赖:** Task 5.1, Task 2.1

**预计工时:** 4h

---

### 5.3 CDN 下载

**任务:**
- [x] `downloadWechatMedia()` 下载并解密
- [x] `downloadRemoteMediaToTemp()` 下载远程文件
- [x] MIME 类型检测
- [x] 临时文件管理

**需求:** REQ-3

**涉及组件:** COMP-8

**依赖:** Task 5.1

**预计工时:** 2h

---

### 5.4 媒体消息发送

**任务:**
- [x] `sendWechatMedia()` 发送媒体
- [x] 根据文件类型路由到不同上传函数
- [x] 构建 `image_item`/`video_item`/`file_item`
- [x] 发送带 caption 的媒体
- [x] 错误处理与通知

**需求:** REQ-3

**涉及组件:** COMP-7, COMP-8

**依赖:** Task 5.2, Task 4.1

**预计工时:** 3h

---

## 阶段 6: 账号与登录

### 6.1 QR 码登录流程

**任务:**
- [x] `startWechatLoginWithQr()` 获取 QR 码
- [x] `waitForWeixinLogin()` 等待扫码
- [x] `pollQRStatus()` 轮询状态
- [x] QR 码刷新（最多 3 次）
- [x] 终端显示 QR 码（qrcode-terminal）
- [x] 超时处理（480s）

**需求:** REQ-2

**涉及组件:** COMP-11

**依赖:** Task 2.1

**预计工时:** 4h

---

### 6.2 账号存储

**任务:**
- [x] `listWeixinAccountIds()` 列出账号
- [x] `registerWeixinAccountId()` 注册账号
- [x] `saveWechatAccount()` 保存账号数据
- [x] `loadWechatAccount()` 加载账号数据
- [x] `clearWechatAccount()` 删除账号
- [x] 文件权限设置（0600）

**需求:** REQ-2, REQ-8

**涉及组件:** COMP-11

**依赖:** Task 1.3

**预计工时:** 2h

---

### 6.3 多账号管理

**任务:**
- [x] `WechatPluginRuntime.accounts` Map
- [x] 每个账号独立 `WechatAccountRuntime`
- [x] 每个账号独立 context token 缓存
- [x] 每个账号独立同步游标
- [x] 每个账号独立去重缓存
- [x] 默认账号选择逻辑

**需求:** REQ-8

**涉及组件:** COMP-1

**依赖:** Task 6.2

**预计工时:** 2h

---

## 阶段 7: 高级功能

### 7.1 会话过期处理

**任务:**
- [ ] 检测 `errcode -14`
- [ ] `pauseSession()` 暂停轮询
- [ ] `getRemainingPauseMs()` 获取剩余暂停时间
- [ ] `isSessionPaused()` 检查是否暂停
- [ ] 8 分钟后自动恢复

**需求:** REQ-5

**涉及组件:** COMP-12

**依赖:** Task 2.2

**预计工时:** 2h

---

### 7.2 Typing 指示器

**任务:**
- [ ] `getConfig()` 获取 typing_ticket
- [ ] `sendTyping()` 发送输入状态
- [ ] 集成到消息处理流程
- [ ] 保活逻辑（每 5 秒）
- [ ] 失败降级

**需求:** REQ-6

**涉及组件:** COMP-4, COMP-6

**依赖:** Task 2.1, Task 3.5

**预计工时:** 2h

---

### 7.3 语音消息处理

**任务:**
- [ ] SILK 格式检测
- [ ] SILK 转 WAV/MP3
- [ ] 集成外部语音转文字服务（可选）
- [ ] 使用 `voice_item.text` 转写文本

**需求:** REQ-4

**涉及组件:** COMP-8

**依赖:** Task 5.3

**预计工时:** 4h

---

### 7.4 Slash 命令

**任务:**
- [ ] `/help` 显示帮助
- [ ] `/status` 显示状态
- [ ] `/debug` 切换调试模式
- [ ] 命令路由逻辑

**需求:** REQ-11

**涉及组件:** COMP-13

**依赖:** Task 4.1

**预计工时:** 2h

---

### 7.5 调试模式

**任务:**
- [ ] 环境变量切换（`WECHAT_DEBUG=1`）
- [ ] 命令切换（`/debug`）
- [ ] 全链路耗时记录
- [ ] 在回复末尾附加调试信息

**需求:** REQ-12

**涉及组件:** COMP-6, COMP-17

**依赖:** Task 7.4

**预计工时:** 2h

---

## 阶段 8: 测试与文档

### 8.1 单元测试

**任务:**
- [ ] `api.ts` 测试
- [ ] `media.ts` 加密/解密测试
- [ ] `handlers.ts` 解析测试
- [ ] `format.ts` 转换测试
- [ ] `dedup.ts` 去重测试

**需求:** REQ-10

**涉及组件:** 所有组件

**依赖:** Phase 1-7

**预计工时:** 6h

---

### 8.2 集成测试

**任务:**
- [ ] QR 登录流程测试
- [ ] 消息收发测试
- [ ] 媒体上传下载测试
- [ ] 会话过期测试
- [ ] 重连测试

**需求:** REQ-10

**涉及组件:** 所有组件

**依赖:** Task 8.1

**预计工时:** 4h

---

### 8.3 文档

**任务:**
- [ ] README.md
- [ ] 配置示例
- [ ] API 文档
- [ ] 故障排查指南

**需求:** REQ-10

**涉及组件:** 无

**依赖:** Phase 1-7

**预计工时:** 3h

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| ilink API 文档不完整 | 高 | 参考 openclaw-weixin 源码 |
| QR 登录流程变更 | 高 | 使用官方 CLI 验证 |
| CDN 加密算法变更 | 中 | 使用相同版本 AES-128-ECB |
| context_token 机制变更 | 高 | 参考 openclaw-weixin 实现 |
| SILK 转码兼容性 | 低 | 使用 silk-wasm 库 |

## 里程碑

| 里程碑 | 完成标准 | 预计日期 |
|--------|----------|----------|
| M1: MVP | 文本消息收发 + QR 登录 | Week 1 |
| M2: Media | 图片/视频/文件发送接收 | Week 2 |
| M3: Production | 会话管理 + 错误处理 + 多账号 | Week 3 |
| M4: Polish | 语音 + Typing + 命令 + 测试 | Week 4 |
