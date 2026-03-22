# WeChat Plugin 系统设计文档

## 概述

WeChat Plugin 是 pi-gateway 的通道插件，实现微信个人号消息收发。采用 HTTP long-poll 协议，支持多账号、媒体加密、QR 登录等完整功能。架构参考 telegram 插件，对齐 pi-gateway 插件规范。

## 系统架构

### 组件映射

| 组件 ID | 名称 | 类型 | 职责 | 接口 |
|---------|------|------|------|------|
| COMP-1 | index.ts | 入口 | 插件注册、生命周期管理 | ChannelPlugin |
| COMP-2 | types.ts | 类型 | TypeScript 类型定义 | - |
| COMP-3 | config.ts | 配置 | 配置解析、账号解析 | - |
| COMP-4 | api.ts | API | ilink HTTP 客户端 | getUpdates, sendMessage, getUploadUrl, getConfig, sendTyping |
| COMP-5 | gateway.ts | 网关 | Long-poll 循环、重连逻辑 | startWechatGateway, stopWechatGateway |
| COMP-6 | handlers.ts | 处理器 | 消息解析、路由、分发 | handleWechatMessage |
| COMP-7 | outbound.ts | 出站 | 文本/键盘发送 | sendWechatText, sendWechatKeyboard |
| COMP-8 | media.ts | 媒体 | CDN 加密上传/下载 | uploadWechatMedia, downloadWechatMedia |
| COMP-9 | streaming.ts | 流式 | 流式占位符（微信不支持原生流式） | createWechatStreamingAdapter |
| COMP-10 | actions.ts | 动作 | 消息操作（删除/编辑 - 不支持） | deleteMessage, editMessage |
| COMP-11 | accounts.ts | 账号 | QR 登录、账号存储 | startWechatLogin, waitForLogin, saveWechatAccount |
| COMP-12 | session.ts | 会话 | 同步游标、会话过期 | saveSyncBuf, loadSyncBuf, pauseSession |
| COMP-13 | commands.ts | 命令 | Slash 命令处理 | handleSlashCommand |
| COMP-14 | security.ts | 安全 | DM 策略、配对验证 | checkDmPolicy, createPairingCode |
| COMP-15 | format.ts | 格式 | Markdown → 纯文本 | markdownToPlainText |
| COMP-16 | dedup.ts | 去重 | 消息 ID 去重缓存 | isDuplicate, cleanupDedup |
| COMP-17 | logger.ts | 日志 | 结构化日志（脱敏） | logger.withAccount() |

### 高层架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        pi-gateway                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ RPC Server   │  │ Session Mgr  │  │ Agent Router │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
└─────────┼───────────────────────────────────────────────────────┘
          │ ChannelPlugin API
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     WeChat Plugin                               │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   index.ts  │───▶│  gateway.ts │◀──▶│   api.ts    │         │
│  │  (lifecycle)│    │ (long-poll) │    │ (ilink API) │         │
│  └─────────────┘    └──────┬──────┘    └─────────────┘         │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                │
│         ▼                  ▼                  ▼                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ handlers.ts │    │  session.ts │    │  media.ts   │        │
│  │ (inbound)   │    │ (sync buf)  │    │ (CDN enc)   │        │
│  └──────┬──────┘    └─────────────┘    └─────────────┘        │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ outbound.ts │    │  accounts.ts│    │ security.ts │        │
│  │ (send text) │    │ (QR login)  │    │ (dm policy) │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼ ilink API (HTTPS)
┌─────────────────────────────────────────────────────────────────┐
│                    ilinkai.weixin.qq.com                        │
│  /ilink/bot/get_bot_qrcode    /ilink/bot/get_qrcode_status     │
│  /ilink/bot/getupdates        /ilink/bot/sendmessage           │
│  /ilink/bot/getuploadurl      /ilink/bot/getconfig             │
│  /ilink/bot/sendtyping                                          │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼ CDN
┌─────────────────────────────────────────────────────────────────┐
│                novac2c.cdn.weixin.qq.com/c2c                    │
│  AES-128-ECB 加密上传/下载                                       │
└─────────────────────────────────────────────────────────────────┘
```

## 数据流规范

### 主要数据流

#### 1. 入站消息流

```
1. ilink Server → gateway.ts: POST /getupdates 返回消息列表
2. gateway.ts → handlers.ts: handleWechatMessage(msg)
3. handlers.ts: 解析 item_list → 提取 text/media
4. handlers.ts: 缓存 context_token: Map<accountId:userId, token>
5. handlers.ts → security.ts: checkDmPolicy(senderId)
6. handlers.ts → dedup.ts: isDuplicate(messageId)
7. handlers.ts → api.dispatch(): 路由到 agent
8. agent → handlers.ts: reply callback
9. handlers.ts → outbound.ts: sendWechatText(target, text, contextToken)
10. outbound.ts → api.ts: sendMessage({ context_token })
```

**数据转换：**
- Step 3: `WeixinMessage` → `WechatMessageContext`
- Step 9: Markdown → 纯文本（移除语法）

#### 2. 出站媒体流

```
1. agent → outbound.ts: sendWechatMedia(target, filePath, contextToken)
2. outbound.ts → media.ts: uploadWechatMedia(filePath, toUserId)
3. media.ts: 读取文件 → 计算 MD5 → 生成 AES-128 密钥
4. media.ts → api.ts: getUploadUrl({ filekey, media_type, aeskey })
5. api.ts → ilink: POST /getuploadurl → upload_param
6. media.ts: encryptAesEcb(plaintext, aeskey)
7. media.ts → CDN: POST upload_param → x-encrypted-param
8. media.ts: 返回 { downloadEncryptedQueryParam, aeskey }
9. outbound.ts → api.ts: sendMessage({ image_item: { media } })
```

**数据转换：**
- Step 3: Buffer → { rawsize, rawfilemd5, filesize, aeskey }
- Step 6: Buffer (明文) → Buffer (密文)

#### 3. QR 登录流

```
1. accounts.ts: startWechatLogin()
2. accounts.ts → ilink: GET /get_bot_qrcode?bot_type=3
3. ilink → accounts.ts: { qrcode, qrcode_img_content }
4. accounts.ts: 显示 QR 码（终端/网页）
5. accounts.ts: 轮询 pollQRStatus()
6. accounts.ts → ilink: GET /get_qrcode_status?qrcode=xxx
7. ilink → accounts.ts: { status: "scaned" | "confirmed" }
8. WHEN confirmed: 保存 { bot_token, ilink_bot_id, baseUrl, userId }
```

## 集成点

### 内部集成点

| 源 | 目标 | 协议 | 数据格式 | 用途 |
|---|------|------|----------|------|
| handlers.ts | api.dispatch() | 函数调用 | MessageSource | 消息路由 |
| handlers.ts | api.getAvailableModels() | 函数调用 | string[] | 模型列表 |
| gateway.ts | handlers.ts | 回调 | WeixinMessage | 消息分发 |
| outbound.ts | types.ts | 类型引用 | WechatTarget | 目标编码 |

### 外部集成点

#### ilink API

**类型:** REST API over HTTPS  
**认证:** `Authorization: Bearer <bot_token>`  
**基础 URL:** `https://ilinkai.weixin.qq.com`

| 端点 | 方法 | 用途 | 频率限制 |
|------|------|------|----------|
| `/ilink/bot/get_bot_qrcode` | GET | 获取登录 QR 码 | 登录时 |
| `/ilink/bot/get_qrcode_status` | GET | 查询扫码状态 | 1s 轮询 |
| `/ilink/bot/getupdates` | POST | 长轮询消息 | 35s 超时 |
| `/ilink/bot/sendmessage` | POST | 发送消息 | 按需 |
| `/ilink/bot/getuploadurl` | POST | 获取 CDN 上传参数 | 媒体发送 |
| `/ilink/bot/getconfig` | POST | 获取账号配置 | 获取 typing_ticket |
| `/ilink/bot/sendtyping` | POST | 发送输入状态 | 5s 保活 |

**错误处理：**
- 429 Rate Limit: 指数退避，最大 30s
- errcode -14 Session Expired: 暂停 8 分钟
- 网络错误: 重试 3 次，间隔 2s

#### CDN

**类型:** HTTPS 上传/下载  
**基础 URL:** `https://novac2c.cdn.weixin.qq.com/c2c`  
**加密:** AES-128-ECB with PKCS7 padding

**上传流程：**
```typescript
// 1. 获取上传参数
const { upload_param } = await getUploadUrl({ filekey, aeskey, ... })

// 2. 构建 CDN URL
const cdnUrl = `${cdnBaseUrl}/cgi-bin/mmwebwx-bin/webwxupload?${upload_param}`

// 3. POST 加密数据
const encrypted = encryptAesEcb(plaintext, aeskey)
const res = await fetch(cdnUrl, { method: "POST", body: encrypted })

// 4. 从响应头获取下载参数
const downloadParam = res.headers.get("x-encrypted-param")
```

**下载流程：**
```typescript
// 1. 构建 CDN URL
const cdnUrl = `${cdnBaseUrl}/cgi-bin/mmwebwx-bin/webwxupload?${encrypt_query_param}`

// 2. GET 加密数据
const encrypted = Buffer.from(await (await fetch(cdnUrl)).arrayBuffer())

// 3. 解密
const decrypted = decryptAesEcb(encrypted, Buffer.from(aesKey, "hex"))
```

## 组件详细设计

### 1. index.ts（入口）

**职责:** 插件注册、生命周期管理、多账号协调

**关键类/函数:**
```typescript
interface WechatPluginRuntime {
  api: GatewayPluginApi;
  channelCfg: WechatChannelConfig;
  accounts: Map<string, WechatAccountRuntime>;  // accountId → runtime
}

interface WechatAccountRuntime {
  accountId: string;
  token: string;
  baseUrl: string;
  cdnBaseUrl: string;
  pollTimer?: ReturnType<typeof setTimeout>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  disposed: boolean;
  contextTokens: Map<string, string>;  // userId → token
  syncBuf: string;  // get_updates_buf
  syncBufPath: string;  // 文件路径
  dedup: Map<string, number>;  // messageId → timestamp
  streamPlaceholders: Map<string, { target: string; messageId: string }>;
  typingTicket?: string;
  sessionPaused: boolean;
  sessionPauseUntil?: number;
}
```

**生命周期:**
```typescript
async init(api: GatewayPluginApi) {
  // 1. 解析配置
  // 2. 加载账号（从 ~/.pi/wechat/accounts/*.json）
  // 3. 构建 securityAdapter
}

async start() {
  // 对每个 enabled 账号：
  // 1. loadSyncBuf()
  // 2. startWechatGateway()
}

async stop() {
  // 对每个账号：
  // 1. stopWechatGateway()
  // 2. saveSyncBuf()
  // 3. 清理定时器
}
```

### 2. api.ts（API 客户端）

**职责:** 封装 ilink HTTP 调用

**关键函数:**
```typescript
// 基础请求封装
async function ilinkRequest<T>(runtime, path, opts): Promise<T>

// 长轮询
async function fetchWechatUpdates(runtime): Promise<WeixinMessage[]>

// 发送消息
async function sendWechatMessage(runtime, req): Promise<{ messageId: string }>

// 获取上传 URL
async function getUploadUrl(runtime, req): Promise<GetUploadUrlResp>

// 获取配置（含 typing_ticket）
async function getConfig(runtime, ilinkUserId, contextToken): Promise<GetConfigResp>

// 发送 typing 状态
async function sendTyping(runtime, req): Promise<void>

// QR 登录
async function fetchQRCode(baseUrl, botType): Promise<QRCodeResponse>
async function pollQRStatus(baseUrl, qrcode): Promise<StatusResponse>
```

**请求头:**
```typescript
{
  "Content-Type": "application/json",
  "AuthorizationType": "ilink_bot_token",
  "Authorization": `Bearer ${token}`,
  "X-WECHAT-UIN": randomBase64Uint32(),
  "SKRouteTag": routeTag,  // 可选
}
```

### 3. gateway.ts（网关）

**职责:** Long-poll 循环、重连逻辑、会话过期处理

**关键逻辑:**
```typescript
async function startWechatGateway(runtime, onMessage) {
  const poll = async () => {
    if (runtime.disposed) return;

    try {
      const resp = await fetchWechatUpdates(runtime);
      
      // 更新同步游标
      if (resp.get_updates_buf) {
        saveSyncBuf(runtime.syncBufPath, resp.get_updates_buf);
        runtime.syncBuf = resp.get_updates_buf;
      }

      // 处理消息
      for (const msg of resp.msgs ?? []) {
        await onMessage(msg);
      }

      // 更新 timeout
      if (resp.longpolling_timeout_ms) {
        nextTimeoutMs = resp.longpolling_timeout_ms;
      }

      runtime.pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    } catch (err) {
      // 会话过期
      if (err.code === -14) {
        pauseSession(runtime, 8 * 60 * 1000);  // 8 分钟
      }
      
      // 重连逻辑
      runtime.reconnectTimer = setTimeout(poll, backoffDelay);
    }
  };

  await poll();
}
```

**会话过期处理:**
```typescript
function pauseSession(runtime, durationMs: number) {
  runtime.sessionPaused = true;
  runtime.sessionPauseUntil = Date.now() + durationMs;
}

function isSessionPaused(runtime): boolean {
  if (!runtime.sessionPaused) return false;
  if (Date.now() >= runtime.sessionPauseUntil) {
    runtime.sessionPaused = false;
    return false;
  }
  return true;
}
```

### 4. handlers.ts（消息处理器）

**职责:** 消息解析、路由、分发

**消息解析:**
```typescript
function parseWechatMessage(msg: WeixinMessage): WechatMessageContext {
  // 1. 提取文本（支持 voice_item.text）
  // 2. 提取媒体（image/video/file/voice）
  // 3. 提取引用消息
  // 4. 构建 MessageSource
}
```

**媒体下载:**
```typescript
async function downloadMediaFromItem(item, runtime): Promise<WechatInboundMedia> {
  const cdnUrl = `${runtime.cdnBaseUrl}/cgi-bin/mmwebwx-bin/webwxupload?${item.media.encrypt_query_param}`;
  const encrypted = await fetch(cdnUrl);
  const decrypted = decryptAesEcb(encrypted, Buffer.from(item.media.aes_key, "base64"));
  // 保存到临时文件
}
```

**路由与分发:**
```typescript
async function handleWechatMessage(runtime, msg) {
  // 1. 解析消息
  const ctx = parseWechatMessage(msg);
  
  // 2. 缓存 context_token
  if (ctx.contextToken) {
    setContextToken(runtime, ctx.senderId, ctx.contextToken);
  }
  
  // 3. 去重
  if (isDuplicate(runtime, ctx.messageId)) return;
  
  // 4. DM 策略检查
  const policy = checkDmPolicy(runtime, ctx.senderId);
  if (policy === "blocked") return;
  if (policy === "pairing") {
    const code = createPairingCode(runtime, ctx.senderId);
    await sendWechatText(runtime, target, `配对验证码: ${code}`);
    return;
  }
  
  // 5. 路由
  const route = runtime.api.resolveAgentRoute(source, ctx.text);
  const sessionKey = runtime.api.resolveSessionKey(source, route.agentId);
  
  // 6. 分发
  await runtime.api.dispatch({
    source,
    sessionKey,
    text: route.text,
    respond: async (reply) => {
      await sendWechatText(runtime, target, reply, contextToken);
    },
  });
}
```

### 5. media.ts（媒体处理）

**职责:** CDN 加密上传/下载

**AES-128-ECB 实现:**
```typescript
function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}
```

**上传流程:**
```typescript
async function uploadWechatMedia(runtime, filePath, toUserId, mediaType) {
  // 1. 读取文件
  const plaintext = await fs.readFile(filePath);
  const rawsize = plaintext.length;
  const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex");
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = crypto.randomBytes(16).toString("hex");
  const aeskey = crypto.randomBytes(16);

  // 2. 获取上传参数
  const { upload_param } = await getUploadUrl(runtime, {
    filekey, media_type: mediaType, to_user_id: toUserId,
    rawsize, rawfilemd5, filesize, aeskey: aeskey.toString("hex"),
  });

  // 3. 上传加密数据
  const encrypted = encryptAesEcb(plaintext, aeskey);
  const cdnUrl = `${runtime.cdnBaseUrl}/cgi-bin/mmwebwx-bin/webwxupload?${upload_param}`;
  const res = await fetch(cdnUrl, { method: "POST", body: encrypted });
  const downloadParam = res.headers.get("x-encrypted-param");

  return { filekey, downloadParam, aeskey, fileSize: rawsize, fileSizeCiphertext: filesize };
}
```

### 6. accounts.ts（账号管理）

**职责:** QR 登录、账号存储、多账号索引

**账号存储:**
```
~/.pi/wechat/
├── accounts.json          # 账号 ID 索引
└── accounts/
    ├── default.json       # { token, baseUrl, userId, savedAt }
    └── work-account.json
```

**QR 登录:**
```typescript
async function startWechatLogin(runtime, opts): Promise<WechatQrStartResult> {
  const { qrcode, qrcode_img_content } = await fetchQRCode(baseUrl, "3");
  // 存储 active login 状态
  activeLogins.set(sessionKey, { qrcode, qrcodeUrl, startedAt: Date.now() });
  return { qrcodeUrl: qrcode_img_content, sessionKey };
}

async function waitForWechatLogin(runtime, sessionKey, timeoutMs): Promise<WechatQrWaitResult> {
  const deadline = Date.now() + timeoutMs;
  
  while (Date.now() < deadline) {
    const status = await pollQRStatus(baseUrl, activeLogin.qrcode);
    
    switch (status.status) {
      case "confirmed":
        // 保存账号
        saveWechatAccount(normalizeId(status.ilink_bot_id), {
          token: status.bot_token,
          baseUrl: status.baseurl,
          userId: status.ilink_user_id,
        });
        return { connected: true, accountId: status.ilink_bot_id };
      
      case "expired":
        // 刷新 QR 码（最多 3 次）
        if (refreshCount < 3) {
          const newQr = await fetchQRCode(baseUrl, "3");
          activeLogin.qrcode = newQr.qrcode;
        }
        break;
    }
    
    await sleep(1000);
  }
  
  return { connected: false, message: "登录超时" };
}
```

### 7. session.ts（同步与会话）

**职责:** 同步游标持久化、会话状态管理

**同步游标:**
```typescript
function getSyncBufPath(accountId: string): string {
  return path.join(WECHAT_STATE_DIR, accountId, "sync-buf.json");
}

function loadSyncBuf(filePath: string): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return data.get_updates_buf ?? null;
  } catch {
    return null;
  }
}

function saveSyncBuf(filePath: string, buf: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ get_updates_buf: buf, savedAt: Date.now() }));
}
```

### 8. commands.ts（命令）

**职责:** Slash 命令处理

**命令列表:**
```typescript
const COMMANDS = {
  "/help": "显示帮助信息",
  "/status": "显示连接状态、账号信息",
  "/debug": "切换调试模式",
  "/clear": "清除对话历史",
};

async function handleSlashCommand(text, context): Promise<{ handled: boolean }> {
  const [cmd] = text.trim().split(/\s+/);
  
  switch (cmd) {
    case "/help":
      await context.send(buildHelpText());
      return { handled: true };
    
    case "/status":
      const status = await getStatus(context.accountId);
      await context.send(formatStatus(status));
      return { handled: true };
    
    case "/debug":
      context.toggleDebug();
      await context.send(`调试模式: ${context.isDebug() ? "开启" : "关闭"}`);
      return { handled: true };
  }
  
  return { handled: false };
}
```

## 数据模型

### WechatChannelConfig

```typescript
interface WechatChannelConfig {
  enabled: boolean;
  accounts?: Record<string, WechatAccountConfig>;
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: string[];
  cdnBaseUrl?: string;
  baseUrl?: string;
  textChunkLimit?: number;
  streaming?: WechatStreamingConfig;
}

interface WechatAccountConfig {
  enabled?: boolean;
  name?: string;
  token?: string;
  baseUrl?: string;
  cdnBaseUrl?: string;
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: string[];
}
```

### WeixinMessage（ilink 协议）

```typescript
interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  create_time_ms?: number;
  message_type?: number;  // 1=USER, 2=BOT
  message_state?: number; // 0=NEW, 1=GENERATING, 2=FINISH
  item_list?: MessageItem[];
  context_token?: string;  // 关键：回复时必须回传
}

interface MessageItem {
  type: number;  // 1=TEXT, 2=IMAGE, 3=VOICE, 4=FILE, 5=VIDEO
  text_item?: { text: string };
  image_item?: { media: CDNMedia; mid_size: number };
  voice_item?: { media: CDNMedia; duration: number; text?: string };
  file_item?: { media: CDNMedia; file_name: string; len: string };
  video_item?: { media: CDNMedia; video_size: number };
  ref_msg?: RefMessage;  // 引用消息
}

interface CDNMedia {
  encrypt_query_param: string;  // CDN 下载参数
  aes_key: string;  // Base64 编码的 AES 密钥
  encrypt_type: number;
}
```

## 错误处理

### 错误分类

| 类别 | 场景 | 处理策略 |
|------|------|----------|
| 网络错误 | fetch 超时、连接失败 | 重试 3 次，指数退避 |
| API 错误 | ret != 0, errcode != 0 | 记录日志，根据 errcode 处理 |
| 会话过期 | errcode = -14 | 暂停 8 分钟后重试 |
| CDN 错误 | 上传/下载失败 | 重试 3 次，通知用户 |
| 加密错误 | AES 加密/解密失败 | 记录错误，丢弃消息 |
| 媒体错误 | 文件读取失败、格式不支持 | 记录错误，通知用户 |

### 错误通知

```typescript
async function sendErrorNotice(runtime, to, contextToken, error) {
  const message = `⚠️ 错误: ${error.message}`;
  await sendWechatText(runtime, to, message, contextToken);
}
```

## 测试策略

### 单元测试

- `api.ts`: mock fetch，测试各 API 调用
- `media.ts`: 测试 AES-128-ECB 加密/解密
- `handlers.ts`: 测试消息解析、去重、路由
- `format.ts`: 测试 Markdown 转换
- `dedup.ts`: 测试去重缓存 TTL

### 集成测试

- QR 登录流程（mock ilink API）
- 消息收发流程（mock gateway）
- 媒体上传下载（mock CDN）
- 会话过期处理

### 端到端测试

- 完整消息收发（需要测试账号）
- 多账号并发
- 断线重连

## 部署

### Docker 配置

```yaml
services:
  wechat-plugin:
    build: .
    environment:
      - WECHAT_BASE_URL=https://ilinkai.weixin.qq.com
      - WECHAT_CDN_URL=https://novac2c.cdn.weixin.qq.com/c2c
    volumes:
      - ~/.pi/wechat:/root/.pi/wechat
```

### 环境变量

```
WECHAT_BASE_URL=https://ilinkai.weixin.qq.com
WECHAT_CDN_URL=https://novac2c.cdn.weixin.qq.com/c2c
WECHAT_POLL_TIMEOUT=35000
WECHAT_DEDUP_TTL=1800000
WECHAT_DEDUP_MAX_SIZE=1000
```

## 性能目标

- 消息延迟: < 500ms（从收到到分发）
- CDN 上传: < 10s（10MB 文件）
- QR 登录: < 30s（从扫码到确认）
- 内存占用: < 50MB（单账号）
- 并发账号: 支持同时运行 10+ 账号

## 安全考虑

- Token 存储在 `~/.pi/wechat/accounts/*.json`，权限 0600
- 日志中脱敏 token（显示前 8 字符）
- context_token 不持久化（仅内存缓存）
- DM 策略默认为 `pairing`（需配对才能对话）
- 不在日志中记录完整消息内容
