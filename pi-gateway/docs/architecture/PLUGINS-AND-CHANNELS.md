# PLUGINS-AND-CHANNELS.md

> TL;DR: pi-gateway 的插件系统对齐 OpenClaw 的 `OpenClawPluginApi`，支持 channel/tool/hook/command/HTTP/WS/service 七种注册类型。三个内置通道（Telegram、Discord、WebChat）各有不同架构：Telegram 最重（20+ 文件），Discord 模块化（5 文件），WebChat 最轻（壳插件 + server.ts WS 协议）。

---

## 1. 插件系统

### 1.1 发现与加载

`plugins/loader.ts` — `PluginLoader` 类

发现顺序（高优先级先加载，同 ID 先到先得）：
1. `config.plugins.dirs[]` — 用户指定目录
2. `~/.pi/gateway/plugins/` — 全局插件目录
3. `builtin/` — 内置插件（telegram、discord、webchat）

每个外部插件目录需包含 `plugin.json`（`PluginManifest`：id + name + main 入口）。内置插件支持两种布局：
- 单文件：`builtin/{name}.ts`（webchat）
- 模块化目录：`builtin/{name}/index.ts`（discord、telegram）

`config.plugins.disabled` 数组可禁用任意插件。

### 1.2 注册表

`PluginRegistryState`（`loader.ts:47`）持有所有已注册组件：

| 组件 | 类型 | 注册方法 | 用途 |
|---|---|---|---|
| `channels` | `Map<string, ChannelPlugin>` | `registerChannel()` | 消息通道（Telegram/Discord/WebChat） |
| `tools` | `Map<string, ToolPlugin>` | `registerTool()` | Agent 可调用的工具 |
| `commands` | `Map<string, CommandHandler>` | `registerCommand()` | 斜杠命令（绕过 LLM） |
| `httpRoutes` | `Array<{method, path, handler}>` | `registerHttpRoute()` | HTTP 端点 |
| `gatewayMethods` | `Map<string, WsMethodHandler>` | `registerGatewayMethod()` | WS RPC 方法 |
| `services` | `BackgroundService[]` | `registerService()` | 后台服务 |
| `hooks` | `HookRegistry` | `registerHook()` / `on()` | 生命周期钩子 |
| `cliRegistrars` | `Array<CliRegistrar>` | `registerCli()` | CLI 子命令 |

### 1.3 GatewayPluginApi

`plugins/types.ts:207` — 每个插件收到的 API 对象，由 `server.ts` 的 `apiFactory` 创建。

核心能力：
- `dispatch(msg)` — 将消息注入 agent 管线
- `sendToChannel(channel, target, text)` — 跨通道发送
- `getSessionState(key)` / `resetSession(key)` / `abortSession(key)` — 会话管理
- `setModel()` / `setThinkingLevel()` / `compactSession()` — RPC 控制
- `forwardCommand()` / `getPiCommands()` — pi 命令转发
- `cronEngine` — Cron 引擎访问（F2 新增）

### 1.4 Hook 系统

`plugins/hooks.ts` — `HookRegistry`

14 个生命周期钩子，对齐 OpenClaw：

| 阶段 | 钩子 |
|---|---|
| Agent 生命周期 | `before_agent_start`, `agent_end` |
| 消息管线 | `message_received`, `message_sending`, `message_sent` |
| 工具调用 | `before_tool_call`, `after_tool_call`, `tool_result_persist` |
| 会话生命周期 | `session_start`, `session_end` |
| 压缩 | `before_compaction`, `after_compaction` |
| 网关生命周期 | `gateway_start`, `gateway_stop` |

### 1.5 PluginFactory

插件导出两种形式：
```typescript
// 函数形式
export default function(api: GatewayPluginApi) { ... }

// 对象形式
export default { id: "my-plugin", name: "My Plugin", register(api) { ... } }
```

---

## 2. Telegram 插件

最复杂的通道，20+ 文件，处理 Telegram Bot API 的全部交互。

### 2.1 文件结构

```
plugins/builtin/telegram/
├── index.ts              # 入口：创建 ChannelPlugin，注册 bot polling
├── handlers.ts           # 消息处理核心：文本/媒体/转发/命令路由
├── commands.ts           # 斜杠命令注册 + pi_ 动态命令
├── bot.ts                # Telegram Bot API 封装（sendMessage/editMessage/deleteMessage）
├── format.ts             # Markdown → Telegram HTML 转换
├── types.ts              # TelegramChannelConfig 等类型
├── accounts.ts           # 多账号管理（multi-bot）
├── config-compat.ts      # 旧配置格式兼容
├── media-download.ts     # 入站媒体：photo/video/document → base64
├── media-send.ts         # 出站媒体：MEDIA: 指令解析 + 发送
├── audio-transcribe.ts   # 语音转文字（Groq/OpenAI Whisper）
├── model-buttons.ts      # /model 命令的 inline keyboard
├── monitor.ts            # 消息监控/日志
├── network-errors.ts     # 网络错误重试策略
├── proxy.ts              # HTTP 代理支持
├── reaction-level.ts     # 消息反应级别
├── sent-message-cache.ts # 已发送消息缓存（用于 edit）
├── update-offset-store.ts# polling offset 持久化
├── webhook.ts            # Webhook 模式支持
└── group-migration.ts    # 群组迁移处理
```

### 2.2 消息处理流程

```
Telegram Update → handlers.ts
  ├── 命令检测（/start, /new, /role, /cron, pi_*）→ commands.ts
  ├── 媒体检测 → media-download.ts → base64 + MIME
  ├── 转发消息 → 提取 forward_origin 上下文
  ├── media_group 批处理（1500ms debounce）
  └── 文本消息 → api.dispatch() → agent 管线
        ↓
  agent 回复 → handlers.ts respond()
  ├── MEDIA: 指令 → media-send.ts → sendPhoto/sendDocument
  ├── 流式更新 → editMessageText（1000ms throttle）
  ├── 思考内容 → 过滤（不渲染到 fullText）
  └── 纯文本 → format.ts → Telegram HTML → sendMessage
```

### 2.3 关键设计

- `dmPolicy`: `"open"` | `"allowlist"` | `"pairing"` — 控制谁能 DM bot
- `allowFrom`: 白名单 user ID 数组
- 多账号：`accounts.ts` 支持多个 bot token，每个绑定不同 agent
- 流式编辑：`editMessageText` 带 1000ms throttle + inflight lock，防 429
- 命令注册：`refreshPiCommands()` 在首条消息时触发（lazy），避免虚拟 session 泄漏

---

## 3. Discord 插件

v3.1 模块化重写，5 文件结构。

### 3.1 文件结构

```
plugins/builtin/discord/
├── index.ts      # 入口：Client 创建、事件绑定、ChannelPlugin 注册
├── handlers.ts   # messageCreate + interactionCreate 处理
├── commands.ts   # Guild-level slash command 注册（/new, /status, /model 等）
├── format.ts     # 消息格式化 + 2000 字符分割
└── types.ts      # DiscordChannelConfig, DiscordPluginRuntime
```

### 3.2 消息处理流程

```
Discord Message/Interaction → handlers.ts
  ├── handleInteraction() → slash command 路由
  └── handleMessage()
        ├── 忽略 bot 自身消息
        ├── DM / 被 mention / 配置的 guild channel
        └── api.dispatch() → agent 管线
              ↓
        agent 回复 → streaming display
        ├── message.edit() 500ms throttle
        ├── 工具调用：`→ tool args` 格式
        ├── 思考内容：`> 💭` blockquote（300 字截断）
        └── 完成：完整回复替换
```

### 3.3 关键设计

- Guild-level 命令注册（即时生效，不走全局注册的 1h 缓存）
- 流式显示：500ms throttle + 1800 字符截断
- `DiscordPluginRuntime` 持有 `client`、`channelCfg`、`api` 引用

---

## 4. WebChat 通道

最轻量的通道 — 插件本身是空壳，实际逻辑在 server.ts WS 协议和 `src/web/app.js` 前端。

### 4.1 架构

```
Browser (app.js Lit components)
  ↕ WebSocket (JSON-RPC)
Gateway server.ts
  ├── handleWsFrame() — 处理 WS 方法
  ├── handleHttp() — 处理 HTTP API
  └── webchat.ts — 空壳 ChannelPlugin（仅注册 channel 元数据）
```

WebChat 不走 `ChannelPlugin.outbound.sendText()`，回复通过 WS 事件直接推送。

### 4.2 WS 协议方法

| 方法 | 方向 | 用途 |
|---|---|---|
| `connect` | client→server | 认证 + 协议握手 |
| `chat.send` | client→server | 发送消息（含 sessionKey + images） |
| `chat.history` | client→server | 获取会话历史 |
| `chat.abort` | client→server | 中止当前生成 |
| `sessions.list` | client→server | 列出所有会话 |
| `sessions.get` | client→server | 获取单个会话详情 |
| `sessions.delete` | client→server | 删除会话 |
| `session.listRoles` | client→server | 列出可用角色 |
| `session.setRole` | client→server | 切换角色 |
| `session.reset` | client→server | 重置会话 |
| `session.think` | client→server | 设置思考级别 |
| `session.model` | client→server | 切换模型 |
| `extension_ui_response` | client→server | 扩展 UI 响应 |
| `chat.reply` | server→client | Agent 回复（含 text + images） |
| `chat.typing` | server→client | 打字指示器 |
| `agent` | server→client | 流式事件（text_delta, thinking_delta 等） |
| `extension_ui_request` | server→client | 扩展 UI 请求 |

### 4.3 HTTP API 端点

| Method | Path | 用途 |
|---|---|---|
| GET | `/health`, `/api/health` | 健康检查 |
| GET | `/api/metrics` | 监控指标 |
| POST | `/api/send` | CLI 发送消息 |
| POST | `/api/chat` | 同步聊天 |
| POST | `/api/chat/stream` | SSE 流式聊天 |
| GET | `/api/sessions` | 会话列表 |
| GET | `/api/sessions/:key` | 会话详情 |
| GET | `/api/transcript/:key` | 会话转录 |
| GET | `/api/transcripts` | 所有转录 |
| POST | `/api/session/reset` | 重置会话 |
| POST | `/api/session/think` | 设置思考 |
| POST | `/api/session/model` | 切换模型 |
| GET | `/api/models` | 可用模型 |
| GET | `/api/session/usage` | 用量统计 |
| GET | `/api/memory/search` | 记忆搜索 |
| GET | `/api/media/:token/:filename` | 签名媒体文件（v3.2 F3） |
| GET/POST/DELETE/PATCH | `/api/cron/jobs[/:id]` | Cron 管理（v3.2 F2） |

### 4.4 前端架构

`src/web/app.js` — 纯 Lit 组件，零构建。

| 组件 | 职责 |
|---|---|
| `gw-app` | 顶层路由：tab 切换（Chat/Sessions/Settings） |
| `gw-chat` | 聊天核心：消息列表、输入框、会话侧边栏、图片上传/渲染/lightbox |
| `gw-settings` | 配置面板 |
| `gw-status` | 连接状态栏 |

`gw-chat` 关键状态：
- `messages[]` — 消息数组（role + text + images + mediaImages）
- `_sessions[]` — 会话列表（从 `sessions.list` 加载）
- `_sidebarOpen` — 侧边栏开关
- `_lightboxSrc` — 图片放大查看
- `_pendingImages[]` — 待发送图片（base64）

---

## 5. 工具系统

### 5.1 delegate_to_agent

`tools/delegate-to-agent.ts` — Agent 间委派工具。

```
Agent A 调用 delegate_to_agent(agentId, task)
  → server.ts executeRegisteredTool() 拦截
  → DelegateExecutor.execute()
    → 从 RPC Pool 获取目标 agent 进程
    → 发送 task，等待回复
    → 返回结果给 Agent A
```

安全约束（`DelegationConstraints`）：
- `allowlist` — 允许委派的 agent ID 列表
- `maxConcurrent` — 最大并发委派数
- `maxDepth` — 最大委派深度（防递归）

指标：`DelegationMetrics` 追踪 count/success/timeout/error/p95，暴露在 `/api/metrics`。

### 5.2 ToolPlugin 接口

```typescript
interface ToolPlugin {
  name: string;
  tools: ToolDefinition[];  // JSON Schema 参数定义
  execute(toolName: string, params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
```

通过 `api.registerTool()` 注册，工具定义注入到 agent 的工具列表。

---

## 6. 与 OpenClaw 的对齐

| 维度 | pi-gateway | OpenClaw |
|---|---|---|
| 插件发现 | config → global → builtin | config → workspace → builtin |
| API 接口 | `GatewayPluginApi` | `OpenClawPluginApi` |
| Hook 名称 | 14 个，1:1 对齐 | 14 个 |
| 通道注册 | `registerChannel()` | `registerChannel()` |
| 命令注册 | `registerCommand()` | `registerCommand()` |
| CLI 扩展 | `registerCli()` | `registerCli()` |
| 关键差异 | RPC 隔离（Bun.spawn） | 嵌入式（同进程） |
