# SECURITY.md — pi-gateway 安全架构

TL;DR: pi-gateway 通过 7 层安全机制保护：访问控制（allowlist/pairing）、HTTP/WS 认证（fail-closed）、媒体路径校验（7 层防御）、媒体 URL 签名（HMAC-SHA256）、SSRF 防护（DNS rebinding-aware）、命令执行白名单（ExecGuard）、通道级策略（dmPolicy）。

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

---

## 2. HTTP/WS 认证 — auth.ts（v3.4 S1: fail-closed）

### 设计原则

**默认拒绝（fail-closed）**：gateway 启动时必须有明确的认证配置，否则拒绝运行。

### 认证模式

| Mode | 行为 | 配置要求 |
|---|---|---|
| `token` | Bearer token 认证（默认） | 自动生成或显式配置 `auth.token` |
| `password` | 密码认证 | 必须配置 `auth.password` |
| `off` | 无认证 | 必须显式 `auth.allowUnauthenticated: true` |

### 启动校验（`resolveAuthConfig`）

- `mode: "token"` 无 token → 自动生成 24 字节 base64url token，打印到日志（`logToken: false` 可隐藏）
- `mode: "off"` 无 `allowUnauthenticated: true` → 启动报错
- `mode: "password"` 无 password → 启动报错

### 请求认证（`authenticateRequest`）

统一处理 HTTP 和 WS 升级请求：
- 支持 `Authorization: Bearer <token>` header
- 支持 `?token=<token>` query param（WS 客户端）
- 使用 `safeTokenCompare`（timing-safe，防时序攻击）

### 豁免路径（`isAuthExempt` + `buildAuthExemptPrefixes`）

| 路径 | 豁免原因 |
|---|---|
| `/health`, `/api/health` | 健康检查 |
| `/` | 根路径 |
| `/web/*` | 静态资源 |
| `/webhook/{channel}` | 仅已启用 channel 的 webhook 路径（精确匹配） |

`buildAuthExemptPrefixes(config)` 根据启用的 channel 动态构建豁免列表，未知 webhook 路径被拦截。

### 配置

```jsonc
{
  "gateway": {
    "auth": {
      "mode": "token",              // "off" | "token" | "password"
      "token": "auto",              // 显式 token 或省略自动生成
      "allowUnauthenticated": false, // mode:"off" 时必须为 true
      "logToken": true              // false 隐藏自动生成的 token
    }
  }
}
```

测试覆盖：30 个 BBD 测试（S1-1 ~ S1-33），覆盖 config 校验、HTTP/WS auth、豁免路径、webhook 精确匹配、token 比较边界。

---

## 3. 媒体路径安全 — media-security.ts

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

第 7 层 symlink 处理：
- 文件存在 → `realpathSync` 解析真实路径
- 文件不存在 → `resolve()` 双边一致（macOS symlink 兼容）

### 调用点（6 处）

| 调用点 | 文件 | 场景 |
|---|---|---|
| `parseOutboundMediaDirectives` | `telegram/media-send.ts` | `MEDIA:` 和 `[photo]`/`[audio]` 指令 |
| `sendLocalFileByKind` | `telegram/media-send.ts` | 发送前二次校验 |
| `sendTelegramMedia` | `telegram/media-send.ts` | 入口校验 |
| `processWebChatMediaDirectives` | `api/media-routes.ts` | WebChat MEDIA 指令 |
| `handleMediaServe` | `api/media-routes.ts` | WebChat 签名 URL 文件服务 |
| `handleMediaSendRequest` | `api/media-send.ts` | send_media tool API |

---

## 4. SSRF 防护 — ssrf-guard.ts（v3.4 S2）

### 设计

`validateOutboundUrl(urlStr, opts)` 对所有出站 URL 执行多层校验：

| 层 | 检查 | 攻击向量 |
|---|---|---|
| 1 | URL 解析 | 畸形 URL |
| 2 | Scheme 白名单（仅 `http:`/`https:`） | `file:`、`gopher:` 等 |
| 3 | Credentials 检查 | `http://user:pass@host` |
| 4 | 黑名单主机匹配（支持 `*.example.com`） | 已知危险域名 |
| 5 | 白名单主机快速放行 | 可信域名跳过 DNS |
| 6 | Decimal IP 检测（`2130706433` → `127.0.0.1`） | 十进制 IP 绕过 |
| 7 | 直接 IP 私有段检查（IPv4 + IPv6 + IPv4-mapped） | 内网访问 |
| 8 | DNS 解析 + 私有 IP 检查 | DNS rebinding |

### 私有 IP 段覆盖

IPv4: RFC 1918（10/172.16/192.168）+ 127.0.0.0/8 + 169.254.0.0/16（AWS metadata）+ 0.0.0.0/8 + TEST-NET + multicast + reserved

IPv6: `::1`、`fc00::/7`、`fe80:`、`::ffff:` mapped（自动提取 IPv4 部分检查）

### 配置选项（`SsrfGuardOptions`）

| 选项 | 默认 | 说明 |
|---|---|---|
| `allowPrivate` | `false` | 允许私有 IP |
| `allowLocalhost` | `false` | 单独允许 localhost |
| `allowedHosts` | `[]` | 白名单域名（跳过 DNS 检查） |
| `blockedHosts` | `[]` | 黑名单域名 |
| `maxRedirects` | `0` | 重定向限制 |

### `safeFetch` — 替代 `fetch`

```typescript
const res = await safeFetch(url, init, ssrfOpts);
```

SSRF 校验通过后才执行 fetch。`maxRedirects: 0` 时强制 `redirect: "error"`。

### 已知限制

Bun fetch 不支持传入已解析 IP，存在 DNS resolve → fetch 之间的 TOCTOU 窗口。对 config URL + Telegram API 场景可接受。

测试覆盖：34 个 BBD 测试。

---

## 5. 命令执行白名单 — exec-guard.ts（v3.4 S3）

### 设计

`ExecGuard` 控制 gateway 可以 spawn 的可执行文件，防止恶意插件或配置注入。

### 核心机制

| 特性 | 说明 |
|---|---|
| 白名单 | 默认仅允许 `["pi", "ps"]` |
| Fail-closed | `blockUnlisted: true`（默认），未列入白名单的命令被拒绝 |
| 审计日志 | 记录所有 spawn 尝试（允许 + 拒绝），最多 1000 条 |
| 参数脱敏 | `--token`/`--key`/`--secret`/`--password` 及 `key=value` 格式自动 `[REDACTED]` |
| 启动校验 | `validatePiCliPath` 确保 piCliPath 在白名单中 |

### 配置

```jsonc
{
  "security": {
    "exec": {
      "enabled": true,
      "allowedExecutables": ["pi", "ps"],
      "auditLog": true,
      "blockUnlisted": true
    }
  }
}
```

### API

- `check(executable, args, opts)` → `{ allowed, reason }` — 调用方决定是否继续
- `getAuditLog(limit)` — 最近 N 条审计记录
- `getStats()` → `{ total, allowed, blocked }`
- `onAudit(listener)` — 注册审计监听器（文件日志、metrics 等）

### 已知 Gap（v3.4 In Review）

- S3 尚未 wired 到实际 spawn 调用（JadeHawk 修复中）
- `--flag=value` 格式的 bypass 需要加固

测试覆盖：20 个 BBD 测试。

---

## 6. send_media Tool 安全模型（v3.3）

### 端点：`POST /api/media/send`（`api/media-send.ts`）

### 双重认证（Dual Auth）

| 认证方式 | 参数 | 验证逻辑 | 适用场景 |
|---|---|---|---|
| Session Key | `body.sessionKey` | `pool.getForSession(sessionKey)` | 正常 agent 调用 |
| Internal Token | `body.token` | `getGatewayInternalToken(config)` 比较 | 内部调用 |

### Internal Token 派生

```
seed = JSON.stringify({ port, bind, auth, pid })
token = SHA256(seed).slice(0, 32)
```

每次 gateway 重启后变化（含 `process.pid`），同一进程内稳定，不持久化。

---

## 7. 媒体 URL 签名 — media-token.ts

### HMAC-SHA256 签名机制

WebChat 通过签名 URL 提供媒体文件：

```
token = HMAC-SHA256(secret, "{sessionKey}:{filePath}:{expiry}") → base64url
URL = /api/media/{token}/{filename}?sk={sessionKey}&path={filePath}&exp={expiry}
```

安全特性：
- Secret：配置提供或启动时随机生成 32 字节
- Token TTL：默认 1 小时
- 常量时间比较（防时序攻击）
- SVG 强制 `Content-Disposition: attachment` + `Content-Security-Policy: sandbox`（防 XSS）
- `X-Content-Type-Options: nosniff`

---

## 8. 通道级安全策略

### Telegram

- DM: `dmPolicy` + `allowFrom` + pairing
- 群组: `groupAllowFrom` + `requireMention`
- 媒体: `validateMediaPath()` 3 处调用

### Discord

- DM: `dmPolicy` + `dm.allowFrom`
- Guild: `requireMention`

---

## 9. 安全 Gap 状态

| ID | Gap | 状态 | 版本 |
|---|---|---|---|
| S1 | Auth fail-closed | ✅ Done | v3.4 |
| S2 | SSRF guard | ✅ Done | v3.4 |
| S3 | Exec allowlist | ⚠️ Impl done, wiring pending | v3.4 |
| S4 | `hasAnyChannel` 类型安全 | 📋 Backlog | — |

---

*Author: KeenDragon (TrueJaguar) | v3.2: initial | v3.3: send_media, S1 gap fixes | v3.4: auth fail-closed, SSRF guard, exec guard docs*
