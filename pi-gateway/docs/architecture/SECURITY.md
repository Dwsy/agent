# SECURITY.md — pi-gateway 安全架构

TL;DR: pi-gateway 通过 4 层安全机制保护：访问控制（allowlist/pairing）、媒体路径校验（7 层防御）、媒体 URL 签名（HMAC-SHA256）、通道级策略（dmPolicy）。v3.3 待补 SSRF guard、Exec safety、Auth fail-closed。

---

## 1. 访问控制 — allowlist.ts + pairing.ts

### DM Policy（`security/allowlist.ts`）

4 种策略，通过 `channels.{telegram|discord}.dmPolicy` 配置：

| Policy | 行为 | 适用场景 |
|---|---|---|
| `pairing` | 未知用户收到配对码，管理员审批后加入白名单 | 默认策略，平衡安全与易用 |
| `allowlist` | 仅 `allowFrom` 列表中的用户可交互 | 严格控制 |
| `open` | 任何人可交互（要求 `allowFrom: ["*"]`） | 公开 bot |
| `disabled` | 忽略所有 DM | 仅群组使用 |

核心函数 `isSenderAllowed(channel, senderId, policy, configAllowFrom, accountId)`:
- 先查 config 中的 `allowFrom` 静态列表
- 再查持久化白名单 `~/.pi/gateway/credentials/{channel}__{accountId}-allowFrom.json`
- `pairing` 和 `allowlist` 都走这两层检查

调用点：
- `telegram/handlers.ts:644` — Telegram DM 入口
- `discord/handlers.ts:29` — Discord DM 入口

### Pairing 流程（`security/pairing.ts`）

1. 未知用户发消息 → `createPairingRequest()` 生成 8 位配对码（排除 0/O/1/I 避免混淆）
2. Bot 回复配对码给用户
3. 管理员执行 `pi-gw pairing approve <channel> <code>`
4. `approvePairingRequest()` → `approveSender()` 写入持久化白名单

约束：
- 配对码 1 小时过期（`CODE_EXPIRY_MS = 3600000`）
- 每通道最多 3 个待审批请求（`MAX_PENDING_PER_CHANNEL = 3`）
- 存储：`~/.pi/gateway/credentials/{channel}__{accountId}-pairing.json`

### 多账号隔离

白名单和配对请求按 `{channel}__{accountId}` 隔离。支持从旧版 `{channel}-allowFrom.json` 自动迁移到 `{channel}__default-allowFrom.json`。

---

## 2. 媒体路径安全 — media-security.ts

### 7 层防御（`core/media-security.ts`）

`validateMediaPath(pathRaw, workspaceRoot?)` 按顺序检查：

| 层 | 检查 | 攻击向量 | 测试 ID |
|---|---|---|---|
| 1 | 空字符串/空白 | 空路径注入 | — |
| 2 | null byte (`\0`) | null byte 截断 | MS-6 |
| 3 | URL scheme (`://` + `/^[a-zA-Z][a-zA-Z0-9+.-]*:/`) | `file:///`、`data:`、`javascript:` | MS-7, MS-8 |
| 4 | 绝对路径 (`/`) | 任意文件读取 | MS-2 |
| 5 | Home 目录 (`~`) | 用户目录遍历 | MS-3 |
| 6 | 目录遍历 (`..`) | 路径穿越 | MS-4 |
| 7 | Workspace 包含检查 (resolve + realpathSync) | symlink 逃逸 | MS-5 |

第 3 层使用双重检查：
- `includes("://")` — 快速路径，拦截 `file://`、`ftp://`
- `/^[a-zA-Z][a-zA-Z0-9+.-]*:/` — 通用 URI scheme regex，拦截 `data:`、`javascript:` 等无 `://` 的 scheme

第 7 层 workspace 检查的 symlink 处理：
- 文件存在 → `realpathSync` 解析真实路径，`realpathSync(workspaceRoot)` 解析真实根
- 文件不存在 → `resolve()` 双边一致（避免 macOS symlink workspace 下 startsWith 不匹配）

### 调用点

- `telegram/media-send.ts` — `parseOutboundMediaDirectives()` 解析 `MEDIA:` 指令时校验
- `telegram/media-send.ts` — `sendLocalFileByKind()` 发送前二次校验
- `gw-chat/index.ts` — WebChat 媒体服务端点（复用同一函数）

---

## 3. 媒体 URL 签名 — media-token.ts

### HMAC-SHA256 签名机制（`core/media-token.ts`）

WebChat 通过签名 URL 提供媒体文件，避免在浏览器历史/Referer/日志中暴露 session key。

签名流程：
```
payload = "{sessionKey}:{filePath}:{expiry}"
token = HMAC-SHA256(secret, payload) → base64url
URL = /api/media/{token}/{filename}?sk={sessionKey}&path={filePath}&exp={expiry}
```

验证流程（`verifyMediaToken`）：
1. 检查 expiry 是否过期
2. 重新计算 HMAC
3. 常量时间比较（防时序攻击）

安全特性：
- Secret：配置提供或启动时随机生成 32 字节
- Token TTL：默认 1 小时（`channels.webchat.mediaTokenTtlMs` 可配）
- 常量时间比较：逐字符 XOR，防止时序侧信道

---

## 4. 通道级安全策略

### Telegram

| 配置项 | 位置 | 作用 |
|---|---|---|
| `dmPolicy` | `channels.telegram.dmPolicy` | DM 访问策略 |
| `allowFrom` | `channels.telegram.allowFrom` | 静态白名单 |
| `groupAllowFrom` | `channels.telegram.groupAllowFrom` | 群组白名单 |
| `groups.{id}.requireMention` | 群组配置 | 群组中是否需要 @mention |
| `groups.{id}.allowFrom` | 群组配置 | 群组级白名单 |

Telegram handler 安全检查链（`handlers.ts`）：
1. DM → `isSenderAllowed()` 检查 → 未通过走 pairing 流程
2. 群组 → 检查 `groupAllowFrom` + `requireMention`
3. 媒体 → `validateMediaPath()` 校验出站路径

### Discord

| 配置项 | 位置 | 作用 |
|---|---|---|
| `dmPolicy` | `channels.discord.dmPolicy` | DM 访问策略 |
| `dm.allowFrom` | `channels.discord.dm.allowFrom` | DM 白名单 |
| `guilds.{id}.requireMention` | Guild 配置 | 是否需要 @mention |

---

## 5. 已知安全 Gap（v3.3 待修）

| ID | Gap | 风险 | 计划 |
|---|---|---|---|
| S2 | SSRF Guard | agent 可通过 MEDIA URL 触发服务端请求到内网 | v3.3: URL 校验 + 私有 IP 段拦截 |
| S3 | Exec Safety | bash 工具可执行任意命令（当前靠 config 禁用） | v3.3: 命令 allowlist + 审计日志 |
| S4 | Auth Fail-Closed | `auth.mode=off` 时无任何认证 | v3.3: 默认 fail-closed，显式 opt-out |
| S5 | `hasAnyChannel` 类型安全 | `(channels as any)` 类型断言 | v3.3: 清理为类型安全检查 |

---

*Author: KeenDragon (TrueJaguar) | Based on: media-security.ts, media-token.ts, allowlist.ts, pairing.ts, handlers.ts, config.ts*
