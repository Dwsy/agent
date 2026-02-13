# Feishu Channel Plugin Design

> pi-gateway 飞书（Feishu/Lark）通道插件设计文档
> Author: JadeStorm | Reviewer: HappyCastle, NiceViper, DarkUnion
> Date: 2026-02-12

## 1. Overview

将飞书作为 pi-gateway 的第四个 channel plugin（alongside Telegram/Discord/WebChat），实现飞书机器人与 pi agent 的双向消息通信。

参考实现：[clawdbot-feishu](https://github.com/m1heng/clawdbot-feishu)（OpenClaw 飞书插件，~5700 行 TS）
核心依赖：`@larksuiteoapi/node-sdk`（飞书官方 Node.js SDK）

### 设计原则

- 直接依赖 `@larksuiteoapi/node-sdk`，不引入 clawdbot-feishu 包
- 从 clawdbot-feishu 提取核心逻辑，重写适配 pi-gateway ChannelPlugin 接口
- 不修改 `src/plugins/types.ts` 和 `src/server.ts`
- 实现在 `src/plugins/builtin/feishu/` 独立目录下

## 2. Scope

### v1（本次交付）

- WebSocket 长连接模式（零配置，不需要公网 IP）
- DM（私聊）消息收发
- 文本消息（post 格式，支持 markdown）
- 消息去重（WebSocket 重连防重发）
- DM 策略：open / allowlist
- 基础配置：appId / appSecret / domain

### v2（后续迭代）

- 群组消息 + @mention 过滤 + groupPolicy
- Interactive card 发送/更新（富文本渲染）
- 媒体入站（image/file/audio/video 下载）
- 媒体出站（upload + send）
- Webhook 连接模式
- 多账号支持
- 话题隔离（topicSessionMode）

### 不做

- 飞书工具集（文档/知识库/云盘/多维表格）— 属于 tool plugin 范畴
- 动态 agent 创建 — OpenClaw 特有功能
- Reaction typing indicator — v1 跳过

## 3. Architecture

### 3.1 消息流

```
Inbound (飞书 → agent):
  Lark WSClient
    → EventDispatcher.im.message.receive_v1
    → handleFeishuMessage()
      → dedup check
      → DM policy check
      → build InboundMessage { source, sessionKey, text, respond, setTyping, onStreamDelta }
      → api.dispatch(inboundMessage)
        → session-router resolveAgentId + resolveSessionKey (自动)
        → RPC pool → pi agent

Outbound (agent → 飞书):
  agent response
    → InboundMessage.respond(text)
      → sendFeishuText(chatId, text)  // post 格式
    OR
    → ChannelPlugin.outbound.sendText(target, text)
      → sendFeishuText(target, text)
```

### 3.2 Session Key 格式

pi-gateway 的 `resolveSessionKey()` 已支持任意 channel 名，飞书的 session key 自动生成为：

| 场景 | MessageSource | Session Key |
|---|---|---|
| DM (per-peer) | `{ channel: "feishu", chatType: "dm", senderId: "ou_xxx" }` | `agent:main:feishu:dm:ou_xxx` |
| DM (main) | 同上，dmScope=main | `agent:main:main:main` |
| 群组 (v2) | `{ channel: "feishu", chatType: "group", chatId: "oc_xxx" }` | `agent:main:feishu:group:oc_xxx` |
| 话题 (v2) | 同上 + topicId | `agent:main:feishu:group:oc_xxx:topic:om_xxx` |

### 3.3 InboundMessage 构造

参考 Telegram handler 的 dispatch 调用模式：

```typescript
const source: MessageSource = {
  channel: "feishu",
  chatType: "dm",
  chatId: ctx.chatId,
  senderId: ctx.senderOpenId,
  senderName: ctx.senderName,
};

// 必须在 dispatch 前显式 resolve（processMessage 直接用 msg.sessionKey，不会内部 resolve）
const { agentId, text: routedText } = resolveAgentId(source, messageText, api.config);
const sessionKey = resolveSessionKey(source, api.config, agentId);

await api.dispatch({
  source,
  sessionKey,  // 必须显式传入
  text: routedText,
  respond: async (reply: string) => {
    await sendFeishuText({ client, chatId: ctx.chatId, text: reply });
  },
  setTyping: async () => {}, // 飞书无原生 typing API，no-op
  onStreamDelta: (accumulated: string) => {
    // v2: card update 实现流式编辑
  },
});
```

## 4. Configuration

### 4.1 Config Schema

```jsonc
// pi-gateway.jsonc
{
  "channels": {
    "feishu": {
      "enabled": true,
      "appId": "cli_xxx",
      "appSecret": "xxx",
      // 可选
      "domain": "feishu",           // "feishu" | "lark" | custom URL
      "connectionMode": "websocket", // "websocket" (default) | "webhook" (v2)
      "dmPolicy": "open",           // "open" (default) | "allowlist"
      "allowFrom": ["ou_xxx"],      // dmPolicy=allowlist 时生效
      // v2
      "groupPolicy": "disabled",    // "disabled" (default) | "open" | "allowlist"
      "groupAllowFrom": [],
      "requireMention": true,
      "textChunkLimit": 4000
    }
  }
}
```

### 4.2 TypeScript 类型

```typescript
// src/plugins/builtin/feishu/types.ts
export interface FeishuChannelConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  domain?: "feishu" | "lark" | string;  // default: "feishu"
  connectionMode?: "websocket" | "webhook"; // default: "websocket"
  dmPolicy?: "open" | "allowlist";       // default: "open"
  allowFrom?: string[];
  // v2
  groupPolicy?: "disabled" | "open" | "allowlist";
  groupAllowFrom?: string[];
  requireMention?: boolean;
  textChunkLimit?: number;
}
```

## 5. Dedup Strategy

飞书 WebSocket 重连时会重发最近的消息，去重是必须的。

从 clawdbot-feishu 提取的方案：

```typescript
const DEDUP_TTL_MS = 30 * 60 * 1000;       // 30 min
const DEDUP_MAX_SIZE = 1000;
const DEDUP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

const processed = new Map<string, number>(); // messageId → timestamp
let lastCleanup = Date.now();

function isDuplicate(messageId: string): boolean {
  const now = Date.now();
  // throttled cleanup
  if (now - lastCleanup > DEDUP_CLEANUP_INTERVAL_MS) {
    for (const [id, ts] of processed) {
      if (now - ts > DEDUP_TTL_MS) processed.delete(id);
    }
    lastCleanup = now;
  }
  if (processed.has(messageId)) return true;
  // evict oldest if full
  if (processed.size >= DEDUP_MAX_SIZE) {
    const first = processed.keys().next().value!;
    processed.delete(first);
  }
  processed.set(messageId, now);
  return false;
}
```

## 6. File Structure

```
src/plugins/builtin/feishu/
├── index.ts      # ChannelPlugin 注册入口，init/start/stop 生命周期
├── client.ts     # Lark SDK 封装，Client/WSClient 创建 + 缓存
├── bot.ts        # 消息处理：事件注册、去重、DM 策略、InboundMessage 构造 + dispatch
├── send.ts       # 出站：sendFeishuText (post 格式)，v2 加 sendCard/editMessage
├── media.ts      # v2: 媒体上传/下载/发送
└── types.ts      # FeishuChannelConfig, FeishuMessageContext 等类型定义
```

### 各文件职责与行数预估

| 文件 | 职责 | v1 行数 |
|---|---|---|
| `index.ts` | ChannelPlugin 实现，注册到 api.registerChannel() | ~80 |
| `client.ts` | `createFeishuClient()` + `createFeishuWSClient()` + 缓存 | ~60 |
| `bot.ts` | `handleFeishuMessage()` + dedup + DM policy + dispatch | ~200 |
| `send.ts` | `sendFeishuText()` post 格式发送 | ~80 |
| `types.ts` | 配置/消息上下文类型 | ~40 |
| **合计** | | **~460** |

## 7. Key Implementation Details

### 7.1 index.ts — Plugin Entry

```typescript
import type { ChannelPlugin, GatewayPluginApi } from "../../types.ts";
import type { FeishuChannelConfig } from "./types.ts";
import { createFeishuWSClient } from "./client.ts";
import { registerFeishuEvents } from "./bot.ts";
import { sendFeishuText } from "./send.ts";

let api: GatewayPluginApi | null = null;
let wsClient: /* Lark.WSClient */ any = null;

const feishuPlugin: ChannelPlugin = {
  id: "feishu",
  meta: { label: "Feishu", blurb: "飞书/Lark enterprise messaging (WebSocket)" },
  capabilities: { direct: true, group: false, media: false },
  outbound: {
    maxLength: 4000,
    async sendText(target, text) { /* sendFeishuText */ },
    async sendMedia(target, filePath, opts) { /* v2 */ },
  },
  async init(gatewayApi) { /* resolve config, create client */ },
  async start() { /* wsClient.start({ eventDispatcher }) */ },
  async stop() { /* cleanup */ },
};

export default function register(gatewayApi: GatewayPluginApi) {
  gatewayApi.registerChannel(feishuPlugin);
}
```

### 7.2 bot.ts — Message Handling

核心流程：

1. `Lark.EventDispatcher` 注册 `im.message.receive_v1` 事件
2. 收到消息 → `isDuplicate(messageId)` 去重检查
3. 解析消息内容（text / post 富文本）
4. DM 策略检查（open / allowlist）
5. 构造 `MessageSource` + `InboundMessage`
6. 调用 `api.dispatch(inboundMessage)`

```typescript
// 消息解析 — 从 clawdbot-feishu bot.ts 精简
function parseMessageContent(content: string, messageType: string): string {
  const parsed = JSON.parse(content);
  if (messageType === "text") return parsed.text || "";
  if (messageType === "post") return parsePostText(content);
  return content;
}
```

### 7.3 send.ts — Outbound

飞书发送文本使用 post 格式（支持 markdown tag）：

```typescript
async function sendFeishuText(params: {
  client: Lark.Client;
  to: string;       // chatId 或 open_id
  text: string;
}): Promise<{ messageId: string }> {
  const content = JSON.stringify({
    zh_cn: {
      content: [[{ tag: "md", text: params.text }]],
    },
  });
  const response = await params.client.im.message.create({
    params: { receive_id_type: resolveReceiveIdType(params.to) },
    data: { receive_id: params.to, content, msg_type: "post" },
  });
  return { messageId: response.data?.message_id ?? "unknown" };
}
```

### 7.4 Target 解析

飞书的 receive_id 有三种类型，通过前缀/格式推断：

| 格式 | receive_id_type | 说明 |
|---|---|---|
| `oc_xxx` | `chat_id` | 群组 ID |
| `ou_xxx` | `open_id` | 用户 Open ID |
| `on_xxx` | `union_id` | 用户 Union ID |

```typescript
function resolveReceiveIdType(id: string): string {
  if (id.startsWith("oc_")) return "chat_id";
  if (id.startsWith("ou_")) return "open_id";
  if (id.startsWith("on_")) return "union_id";
  return "chat_id"; // fallback
}
```

## 8. Streaming (v2 Design Note)

飞书没有 Telegram 的 `editMessageText` 等价物用于流式更新文本消息。但飞书的 Interactive Card 支持 `PATCH /im/v1/messages/:message_id`（24h 内可更新）。

v2 流式方案：
1. Agent 开始回复时，发送一个 card 消息（显示 "思考中..."）
2. `onStreamDelta` 回调中调用 card update API 更新内容
3. Agent 回复完成后，最终 card 内容替换为完整回复

这和 Telegram 的 `editMessageText` 流式编辑在语义上相似，但 API 形态不同（card JSON vs plain text），不适合强行统一抽象。

## 9. Security Considerations

- appSecret 通过配置文件传入，不硬编码
- DM allowlist 使用飞书 open_id（`ou_xxx`），不使用 user_id（可能跨租户冲突）
- v2 Webhook 模式需要 encryptKey + verificationToken 验证请求来源
- 媒体下载（v2）需要 validateMediaPath 校验，复用 pi-gateway 现有安全机制

## 10. Testing Plan

| 测试项 | 预期 | 类型 |
|---|---|---|
| 消息去重 | 相同 messageId 第二次返回 true | 单元 |
| 去重 TTL 过期 | 30min 后同 messageId 不再被过滤 | 单元 |
| 去重容量上限 | 超过 1000 条时淘汰最旧 | 单元 |
| DM policy open | 任何 senderId 都通过 | 单元 |
| DM policy allowlist | 不在列表中的 senderId 被拒绝 | 单元 |
| 消息解析 text | JSON `{"text":"hello"}` → "hello" | 单元 |
| 消息解析 post | 富文本 → 纯文本提取 | 单元 |
| Target 解析 | `oc_xxx` → chat_id, `ou_xxx` → open_id | 单元 |
| InboundMessage 构造 | source/text/respond/setTyping 字段正确 | 单元 |
| sendFeishuText | post 格式 + receive_id_type 正确 | 集成 |
| WebSocket 连接 | WSClient.start 成功 | 集成（需要真实 appId） |
| 端到端 DM | 飞书发消息 → agent 回复 | E2E |

## 11. Dependencies

```json
{
  "@larksuiteoapi/node-sdk": "^1.58.0"
}
```

仅新增一个依赖。不引入 zod（clawdbot-feishu 用了但 pi-gateway 不需要 runtime schema validation）。

## 12. Rollout Plan

1. `npm install @larksuiteoapi/node-sdk` 加入 pi-gateway
2. 创建 `src/plugins/builtin/feishu/` 目录，实现 v1 五个文件
3. 单元测试（dedup/policy/parse/target）
4. 集成测试（需要飞书测试 bot 的 appId/appSecret）
5. 文档更新：README + pi-gateway.jsonc.example 加飞书配置示例
6. PR → review → merge

---

*「形あるものは、いつか壊れる。だから最初から壊れにくく作る」*
