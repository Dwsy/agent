# GAPP Host Protocol (v0.1)

MCP-inspired **dynamic tools + generative bridge** for Glimpse-APPs running under Pi (or any host that speaks this protocol).

状态真相源仍是磁盘 `state.json`。本协议在 **App 运行时（WebView）↔ Host（Pi / gapp-sdk runner）** 之间增加：

1. **动态工具（App Tools）** — App 声明可被 AI 调用的接口（类似 MCP tools）
2. **事件通知（Events）** — 人改完 / App 变更后可主动唤起 AI 查看
3. **生成式桥（Generative Bridge）** — App 请求 Host 跑 LLM，token 回流到 App

版本号：`0.1`。消息 envelope 内带 `v` 字段；不兼容变更升 minor 前先 deprecate。

---

## 0. Shared host: single port multipath

控制面 **固定单端口** `54888`（env: `GAPP_HOST_PORT`），**多 path 复用**，本机 `127.0.0.1` only。

| Method | Path | 用途 |
|--------|------|------|
| GET | `/health` | 存活 / hub 角色 |
| GET | `/v1/gapp` | 目录：sessions / leases / live apps / path 表 |
| GET/POST | `/v1/gapp/sessions` | 注册 Pi session |
| GET | `/v1/gapp/leases` | 全部租约 |
| GET/PUT/DELETE | `/v1/gapp/leases/:appId` | 租约查询 / 获取 / 释放（single 互斥） |
| GET | `/v1/gapp/apps/:appId` | app 摘要 |
| GET/PUT | `/v1/gapp/apps/:appId/tools` | 工具列表 / live 注册 |
| POST | `/v1/gapp/apps/:appId/call` | 调用工具（live 或 stateOps） |
| GET/PUT | `/v1/gapp/apps/:appId/state` | 读/写 `state.json` |
| POST | `/v1/gapp/apps/:appId/events` | 事件；`notifyAgent` → 主会话 |
| POST | `/v1/gapp/apps/:appId/generate` | 主会话 `sendUserMessage` 生成 |
| GET | `/v1/gapp/apps/:appId/generate/:requestId` | 轮询生成结果 |

- 首个 Pi 进程 bind 成为 **hub**；后到进程 probe `/health` 后作 **client**（lease/call 走 HTTP）。
- App 内 `GappHost` 同时走 **Glimpse message** + 可选 `fetch(hostBase + path)` 双通道；`requestId` 去重。
- Base URL：`http://127.0.0.1:54888`（`GAPP_HOST_BASE`）。

---

## 1. Goals & Non-goals

### Goals

| 场景 | 能力 |
|------|------|
| To-Do：AI 自己加/改/完成 | AI 调 App 工具，不只读写整份 `state.json` |
| 人做完后让 AI 看进度 | App `emit` → Host `sendUserMessage` 触发 turn |
| App 内生成文案/摘要 | `GappHost.generate()` → Host LLM → stream 回 App |
| 窗口关闭后仍可操作 | 声明式 `tools.json` + `gapp_get/set_state` 兜底 |

### Non-goals (v0.1)

- 不实现完整 MCP 传输层（stdio/SSE）；语义对齐 tools/resources，传输走 Glimpse `message` + `eval`
- 不为每个 App 在 Pi 里 `registerTool` 成百上千个原生工具名（见 §5 元工具设计）
- 不在无 Pi 的纯 CLI/`gapp open` 路径上强制要求 LLM（generate 返回 `host_unavailable`）
- 不替代 `state.json` SSOT；工具实现应最终落到 Store / 磁盘

---

## 2. Actors & Connection lifecycle

```
┌─────────────┐   gapp_open / runGapp    ┌──────────────────┐
│  Pi agent   │ ───────────────────────► │ Glimpse WebView  │
│  (Host)     │ ◄── glimpse message ──── │  index.html      │
│             │ ── win.send(eval) ─────► │  GappStore       │
│  gapp_*     │                          │  GappHost        │
└─────────────┘                          └──────────────────┘
       │                                          │
       ▼                                          ▼
  .pi/gapp/<id>/                          window runtime
  meta.json | state.json | index.html | tools.json?
```

### Connection modes

| Mode | 条件 | 能力 |
|------|------|------|
| `pi-live` | 经 Pi extension `openGappBundle` 打开 | tools invoke + events→agent + generate |
| `isolated` | gapp-sdk / Raycast / CLI 打开 | state persist + tools（若页面实现 handler）；**无** agent turn / generate |
| `disk-only` | 窗口未开 | 仅 `gapp_get_state` / `gapp_set_state` + 声明式 tools 的「纯状态」实现（可选） |

连接建立时 Host 注入 runtime（`injectGappRuntime`），并：

1. 设置 `window.__GAPP_HOST__ = { mode, protocolVersion: "0.1", connected: true }`
2. 若 `mode === "pi-live"`：激活 Generative Bridge（§7）
3. 读取磁盘 `tools.json`（若有）合并进 Host 侧 registry
4. 页面 `DOMContentLoaded` 后可 `GappHost.registerTools(...)` 覆盖/补充 live tools
5. 窗口 `closed` → Host 清 live registry + 释放连接租约，保留磁盘声明

### Instance policy（单开 / 多开）

| `meta.instances` | 含义 | 典型 App |
|------------------|------|----------|
| **`single`（默认）** | 全局 **至多一个 live 连接**（跨 Pi session / 进程） | To-Do、看板、强状态面板：用户只开一个、勾选一个 |
| **`multi`** | 允许多窗口 / 多 session 同时开 | 只读对照、多副本预览、无共享写冲突的工具 |

规则（规范性）：

1. **默认 `single`**。未写 `instances` 字段视为 `single`（协议落地后；迁移期可用 env 关掉强制，但文档默认 single）。
2. **`single` + 已有 live 连接**：
   - 同一 Pi session 再次 `gapp_open` → **聚焦/替换本 session 已开窗口**（现有行为），不弹冲突。
   - **另一 session / 另一 Host** 再 open → **拒绝建立第二连接**，并向用户 **弹窗/ notify 提示**（见 §2.1），错误码 `already_connected`。
   - **不静默抢连**；不「最后 open 者胜」。
3. **`multi`**：允许多连接；每连接有独立 window；`state.json` 仍共享 → App 作者需自处理并发写（或只用只读）。
4. **强状态 App（todo 等）必须 `instances: "single"`**（或依赖默认），保证人机只对一份 UI 勾选。
5. 租约建议落盘：`~/.pi/gapp/_leases/<appId>.json`（或 app 目录下 `.lease`），含 `sessionId`、`pid`、`openedAt`、`host`；窗口 close / process exit 释放；stale 检测（pid 死则可接管）。

#### §2.1 冲突提示文案（用户可见）

中文 notify / 对话框示例：

```
GAPP「todo」已在另一个会话中打开。
强状态应用同时只允许一个 live 连接。
请先关闭另一窗口，或在该会话中继续操作。
```

工具 / API 返回：

```json
{
  "ok": false,
  "error": {
    "code": "already_connected",
    "message": "GAPP todo is already live in another session",
    "details": { "holderSession": "…", "holderPid": 12345 }
  }
}
```

---

## 3. Wire format

所有 **App → Host** 消息经：

```js
window.glimpse.send(payload)  // preferred
// or parent postMessage fallback used by GappStore today
```

所有 **Host → App** 通过：

```js
win.send(`window.GappHost && window.GappHost.__dispatch(${JSON.stringify(msg)})`)
```

### 3.1 Common envelope

```ts
type GappEnvelope = {
  v: "0.1";
  type: string;
  id: string;          // app id (must match __GAPP_ID__)
  ts?: string;         // ISO-8601
  requestId?: string;  // correlate request/response
};
```

Host **忽略** `id` 不匹配当前窗口的消息（防串窗）。

### 3.2 Message catalog (App → Host)

| type | 方向 | 用途 |
|------|------|------|
| `gapp_state` | App→Host | 已有：整份 state 回写 |
| `gapp_tools_register` | App→Host | 注册/替换 live tools |
| `gapp_tools_unregister` | App→Host | 清空 live tools（保留磁盘声明） |
| `gapp_tool_result` | App→Host | 回应 Host 的 tool call |
| `gapp_event` | App→Host | 业务事件；可选唤醒 agent |
| `gapp_llm_request` | App→Host | 请求生成 |
| `gapp_llm_cancel` | App→Host | 取消生成 |
| `gapp_ready` | App→Host | 页面 bridge 就绪（可选） |
| `gapp_log` | App→Host | 调试日志（不进 LLM） |

### 3.3 Message catalog (Host → App)

经 `__dispatch`：

| type | 用途 |
|------|------|
| `gapp_tool_call` | 调用 App 工具 |
| `gapp_state_push` | Agent 写盘后推送新 state 到开着的窗 |
| `gapp_llm_chunk` | 生成流式 delta |
| `gapp_llm_done` | 生成结束（含 full text 或 error） |
| `gapp_host_info` | 连接模式/能力宣告 |
| `gapp_ping` / `gapp_pong` | 存活检测 |

---

## 4. App Tools (MCP-aligned)

### 4.1 Tool descriptor

对齐 MCP tool 形状，精简字段：

```ts
type GappTool = {
  name: string;              // [a-z][a-z0-9_]{1,63}，app 内唯一
  description: string;       // 给 LLM 看
  inputSchema: object;       // JSON Schema object（type: object）
  /** 可选：无 UI handler 时，Host 如何纯状态执行 */
  stateOps?: GappStateOp[];
  /** 可选：注解 */
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
};
```

命名规则：

- LLM 看到的全名：`gapp__<appId>__<toolName>`（展示/文档）
- 调用时用 `gapp_call` 的 `tool` 字段传 **短名** `toolName`（app 内）
- 禁止：`register` / `unregister` / `__*` 等保留名

### 4.2 Tool catalog on disk（可选）

路径：`.pi/gapp/<id>/tools.json` 或 `~/.pi/gapp/<id>/tools.json`

v0.2 推荐把 schema/catalog 与实现分开：`tools.json` 可发现，固定 bundle 入口 `tools.mjs` 可执行。

```json
{
  "v": "0.2",
  "module": "tools.mjs",
  "tools": [
    {
      "name": "list_items",
      "description": "List all todo items with status.",
      "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false },
      "annotations": { "readOnlyHint": true }
    },
    {
      "name": "add_item",
      "description": "Add a todo item.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "title": { "type": "string", "minLength": 1 },
          "priority": { "type": "string", "enum": ["low", "med", "high"] }
        },
        "required": ["title"],
        "additionalProperties": false
      }
    },
    {
      "name": "complete_item",
      "description": "Mark an item done by id.",
      "inputSchema": {
        "type": "object",
        "properties": { "itemId": { "type": "string" } },
        "required": ["itemId"],
        "additionalProperties": false
      },
      "annotations": { "idempotentHint": true }
    }
  ]
}
```

窗口未开时：

- bundle 含 `tools.mjs` 且导出同名 handler → Host/Service 在磁盘 state 上执行
- 否则带 `stateOps` 的工具 → 走 v0.1 declarative fallback（见 §4.5）
- 仅有 schema 且没有上述实现 → `gapp_call` 返回 `needs_live_handler`

#### 4.2.1 Executable `tools.mjs`（v0.2）

`tools.mjs` 是与 `tui.mjs` / `index.html` 同级的本地可信应用代码。固定导出：

```js
export const gappToolHandlers = {
  add_item({ state, arguments: args, context }) {
    const item = {
      id: context.uuid(),
      title: String(args.title),
      createdAt: context.now(),
    };
    return {
      state: { ...state, items: [...(state.items || []), item] },
      result: item,
    };
  },
};
```

handler contract：

- input：`{ state, arguments, context }`
- `context.app`：当前 GAPP meta 摘要
- `context.now()` / `context.uuid()`：宿主提供的时间与 ID
- output：必须为 `{ state, result? }`
- 固定文件名，Host 不接受 manifest 中的任意路径，避免 path traversal
- WebView 通过 `window.__GAPP_TOOLS_MODULE_URL__` import；TUI 通过 `./tools.mjs` import

模块还可导出应用自己的客户端（例如 `createKanbanTools(invoke)`），让 HTML/TUI 共享具名 API，而不是各自硬编码 tool 名称。

### 4.3 Live registration (App → Host)

```json
{
  "v": "0.1",
  "type": "gapp_tools_register",
  "id": "todo",
  "ts": "2026-07-24T12:00:00.000Z",
  "revision": 3,
  "tools": [ /* GappTool[] without requiring stateOps */ ]
}
```

规则：

- `revision` 单调递增；Host 丢弃 `revision < current` 的陈旧注册
- 全量替换该 app 的 **live** tool 表（不是 merge）
- 最终 registry = `disk tools` 被 **同名 live** 覆盖 + live 独有工具

### 4.4 Invoke path (Host → App → Host)

**Host → App**

```json
{
  "v": "0.1",
  "type": "gapp_tool_call",
  "id": "todo",
  "requestId": "call_01HZX...",
  "name": "complete_item",
  "arguments": { "itemId": "t3" }
}
```

**App → Host**

```json
{
  "v": "0.1",
  "type": "gapp_tool_result",
  "id": "todo",
  "requestId": "call_01HZX...",
  "ok": true,
  "result": { "itemId": "t3", "status": "done" }
}
```

或：

```json
{
  "v": "0.1",
  "type": "gapp_tool_result",
  "id": "todo",
  "requestId": "call_01HZX...",
  "ok": false,
  "error": {
    "code": "not_found" | "invalid_args" | "handler_error" | "timeout",
    "message": "item t3 not found"
  }
}
```

超时默认 **15s**；Host 回 `timeout` 给 LLM。

执行优先级：

1. bundle 有 `tools.mjs` 且导出同名 `gappToolHandlers[name]` → 执行共享模块，写回磁盘；若窗开着则 `gapp_state_push`
2. 否则窗口 live + 页面已 `onToolCall` → 走 WebView
3. 否则若 tool 有 `stateOps` → Host 磁盘执行 + 若窗开着则 `gapp_state_push`
4. 否则 `needs_live_handler`

### 4.5 Optional stateOps（磁盘可执行）

极简、安全、无任意代码：

```ts
type GappStateOp =
  | { op: "get"; path?: string }                    // result = path 或整 state
  | { op: "set"; path: string; value: unknown }     // 点分路径浅写
  | { op: "merge"; value: Record<string, unknown> } // 顶层浅合并
  | { op: "push"; path: string; value: unknown }    // 数组 push
  | { op: "removeWhere"; path: string; match: Record<string, unknown> }
  | { op: "updateWhere"; path: string; match: Record<string, unknown>; set: Record<string, unknown> };
```

`arguments` 可用模板：`"$args.title"`、`"$uuid"`、`"$now"`。

示例 `add_item`：

```json
{
  "name": "add_item",
  "description": "Add a todo item.",
  "inputSchema": {
    "type": "object",
    "properties": { "title": { "type": "string" } },
    "required": ["title"]
  },
  "stateOps": [
    {
      "op": "push",
      "path": "items",
      "value": {
        "id": "$uuid",
        "title": "$args.title",
        "status": "open",
        "createdAt": "$now"
      }
    }
  ]
}
```

v0.1 只实现明确列出的 op；禁止任意 JS。

---

## 5. Pi agent surface

### 5.1 元工具（推荐，避免动态 registerTool）

Pi 的 `registerTool` 偏启动期注册。v0.1 用 **固定元工具** + prompt 目录：

| Tool | 作用 |
|------|------|
| `gapp_list` / `gapp_open` / `gapp_get_state` / `gapp_set_state` / … | 已有 |
| `gapp_list_tools` | 列某 app（或全部 online/open）的 tools |
| `gapp_call` | 调用 `appId + tool + arguments` |

```ts
// gapp_list_tools
{ id?: string, openOnly?: boolean }

// gapp_call
{
  id: string,                 // app id or list index
  tool: string,               // short name
  arguments?: object,
  /** 若窗未开且工具需要 live：是否自动 open。默认 true */
  openIfNeeded?: boolean
}
```

### 5.2 Prompt appendix（before_agent_start）

在现有「在线 GAPP 目录」后追加：

```markdown
## Open GAPP tools (dynamic)

### todo — Sprint board [project] (live)
- list_items — List all todo items with status. (readOnly)
- add_item(title, priority?) — Add a todo item.
- complete_item(itemId) — Mark done.

Call via: gapp_call({ id: "todo", tool: "complete_item", arguments: { itemId: "…" } })
Prefer gapp_call over raw gapp_set_state when a tool exists.
After human UI edits, user may ask you to re-check; or app may emit events that arrive as user messages.
```

工具表变更（register revision bump）时：下次 `before_agent_start` 自动带新目录；可选 Host 发一条 followUp 提示「tools updated」。

### 5.3 为何不 per-tool registerTool

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 每个 App tool 动态 `registerTool` | LLM 原生 tool 列表 | 生命周期难、名称冲突、Pi 工具表抖动 |
| **B. 元工具 gapp_call（采用）** | 稳定、实现快、易审计 | 多一跳 indirection |
| C. 仅 state 读写 | 已有 | 无领域语义，AI 易写坏结构 |

后续若 Pi 提供热插拔 tools API，可在 v0.2 做「展开为原生 tools」可选模式，协议消息不变。

---

## 6. Events（人机协作）

### 6.1 App → Host

```json
{
  "v": "0.1",
  "type": "gapp_event",
  "id": "todo",
  "ts": "…",
  "event": "items_changed",
  "payload": { "done": 3, "total": 5, "lastId": "t3" },
  "notifyAgent": true,
  "prompt": "User marked 3/5 todos done in GAPP todo. Review remaining items and suggest next steps."
}
```

| 字段 | 说明 |
|------|------|
| `event` | 短名 snake_case |
| `payload` | JSON，可进 prompt |
| `notifyAgent` | `true` 时 Host 向 Pi 注入用户消息 |
| `prompt` | 可选；缺省用模板生成 |

### 6.2 Host 行为（pi-live）

```
if notifyAgent:
  text = prompt ?? defaultTemplate(appId, event, payload)
  if agentBusy:
    pi.sendUserMessage(text, { deliverAs: "followUp" })
  else:
    pi.sendUserMessage(text)
```

默认模板（English，进 LLM）：

```
[GAPP event] app=<id> event=<event>
payload: <json compact>
Please inspect via gapp_list_tools / gapp_call / gapp_get_state and help the user.
```

防刷：

- 同一 app **2s** 内合并同类 event（leading + trailing）
- `payload` 截断 > 8KB
- 无 `notifyAgent` 的 event 只记 log / 可选 custom entry

### 6.3 典型 To-Do 流

```
Human checks item in UI
  → GappStore.set → gapp_state 落盘
  → GappHost.emit("item_completed", { itemId }, { notifyAgent: true, prompt: "…" })
  → Pi turn starts
  → AI: gapp_call list_items / gapp_get_state
  → AI 回复进度与建议
```

反向：

```
User: "把登录页那个 todo 勾掉并加一个写测试"
  → AI: gapp_call complete_item + gapp_call add_item
  → Host 推 gapp_state_push → UI 刷新
```

---

## 7. Generative Bridge

### 7.1 连接时自动能力

`mode === "pi-live"` 时 runtime 注入 **生成技能**（不是磁盘 SKILL.md 文件，而是 bridge API + 系统提示段落）：

**系统提示（Host 注入）**

```markdown
## GAPP Generative Bridge
Open GAPPs may request on-demand text generation via the host.
When you receive a user message prefixed with `[GAPP generate]`, fulfill the request
(produce the text the app needs; no chit-chat). Prefer plain text or JSON as asked.
The host streams your final assistant text back to the app; tool calls in that turn
are allowed only if required to answer.
```

可选：`resources_discover` 挂一份短 skill 文件（`gapp/skills/generative-bridge/SKILL.md`）供 `/skill` 显式调用；**默认靠连接注入，不必用户手动开 skill**。

### 7.2 App API

```js
// Promise API
const text = await GappHost.generate("Summarize these todos as a standup note", {
  system: "You write terse standup notes.",
  maxTokens: 400,
  format: "text",          // "text" | "json"
  // jsonSchema?: object   // when format=json
});

// Streaming (optional)
for await (const chunk of GappHost.generateStream(prompt, opts)) {
  append(chunk.delta);
}
```

### 7.3 Wire: request

```json
{
  "v": "0.1",
  "type": "gapp_llm_request",
  "id": "todo",
  "requestId": "gen_01HZX...",
  "prompt": "Summarize open items for standup",
  "system": "Terse standup notes only.",
  "stream": true,
  "maxTokens": 400,
  "format": "text",
  "mode": "agent"
}
```

| `mode` | 行为 |
|--------|------|
| **`agent`（唯一路径）** | 走 **当前主会话**：`pi.sendUserMessage(...)`（busy 时 `deliverAs: "followUp"`）。**禁止**另起独立 model/completion API。结果取本 turn 最终 assistant text（有 delta 则可选 `gapp_llm_chunk`）回流 App。 |

**已定决策：** generate **只用主会话 `sendUserMessage`**，与用户对话共用同一模型与上下文；不单独调 provider。

### 7.4 Wire: stream back

```json
{ "v":"0.1", "type":"gapp_llm_chunk", "id":"todo", "requestId":"gen_…", "delta":"## Standup\n" }
{ "v":"0.1", "type":"gapp_llm_done",  "id":"todo", "requestId":"gen_…", "ok":true, "text":"## Standup\n…" }
```

错误：

```json
{
  "v": "0.1",
  "type": "gapp_llm_done",
  "id": "todo",
  "requestId": "gen_…",
  "ok": false,
  "error": { "code": "host_unavailable" | "busy" | "cancelled" | "timeout" | "provider_error", "message": "…" }
}
```

约束：

- 并发 generate 每 app 默认 **1**；第二请求 `busy` 或排队（实现选排队）
- 超时默认 **120s**
- `isolated` 模式立即 `host_unavailable`
- prompt 长度 cap（例如 32k chars）防炸 context

### 7.5 Cancel

```json
{ "v":"0.1", "type":"gapp_llm_cancel", "id":"todo", "requestId":"gen_…" }
```

---

## 8. In-page runtime API

注入于 `gapp-runtime` script（与 `GappStore` 同级）：

```js
window.GappHost = {
  version: "0.1",
  get mode() { /* pi-live | isolated */ },
  get connected() { /* boolean */ },

  // Tools
  registerTools(tools, { revision } = {}),
  unregisterTools(),
  listTools(),
  onToolCall(handler),  // (name, args, { requestId }) => result | Promise
  // Host also supports: tools.mjs and legacy stateOps without a live handler

  // Events
  emit(event, payload, { notifyAgent = false, prompt } = {}),

  // Generative
  generate(prompt, options),
  generateStream(prompt, options),

  // State helpers (delegate GappStore)
  getState: () => GappStore.get(),
  setState: (p) => GappStore.set(p),
  replaceState: (s) => GappStore.replace(s),

  // Internal
  __dispatch(msg) { /* Host → App */ }
};
```

WebView runtime 还注入 `window.__GAPP_TOOLS_MODULE_URL__`，其值为当前 bundle 固定 `tools.mjs` 的绝对 file URL；v0.2 页面应动态 import 该 URL，以便与 Host/TUI 使用同一领域实现。

### 8.1 Minimal To-Do snippet (legacy live-handler form)

```html
<script>
const tools = [
  {
    name: "list_items",
    description: "List todos",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_item",
    description: "Add todo",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "complete_item",
    description: "Complete todo by id",
    inputSchema: {
      type: "object",
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
    },
  },
];

GappHost.registerTools(tools, { revision: 1 });

GappHost.onToolCall(async (name, args) => {
  const s = GappStore.get() || { items: [] };
  if (name === "list_items") return { items: s.items || [] };
  if (name === "add_item") {
    const item = { id: crypto.randomUUID(), title: args.title, status: "open" };
    GappStore.set({ items: [...(s.items || []), item] });
    return item;
  }
  if (name === "complete_item") {
    const items = (s.items || []).map((it) =>
      it.id === args.itemId ? { ...it, status: "done" } : it
    );
    GappStore.replace({ ...s, items });
    GappHost.emit("item_completed", { itemId: args.itemId }, {
      notifyAgent: true,
      prompt: `Todo ${args.itemId} completed. Review remaining work in GAPP todo.`,
    });
    return { itemId: args.itemId, status: "done" };
  }
  throw new Error("unknown tool: " + name);
});

// Optional: app-side AI assist button
async function summarize() {
  const text = await GappHost.generate(
    "Summarize open todos:\n" + JSON.stringify(GappStore.get()?.items),
    { system: "One short paragraph." }
  );
  document.getElementById("summary").textContent = text;
}
</script>
```

---

## 9. Security & limits

| 规则 | 默认 |
|------|------|
| 消息 `id` 必须匹配窗口 app | 强制 |
| tool `name` / 参数 schema 校验 | 强制 |
| `stateOps` 无任意代码 | 强制 |
| generate 仅 `pi-live` | 强制 |
| event notify 防抖 | 2s / app |
| tool call timeout | 15s |
| generate timeout | 120s |
| result / payload size | 建议 ≤ 256KB；超限截断并标注 |
| 不向 App 暴露 Host 文件系统任意读 | 强制 |

`gapp_call` 视同 agent 工具调用，走 Pi 现有权限/展示；不静默写盘。

**已定决策：** **不对** `destructiveHint`（或任何工具）做额外 TUI 确认 / 二次提示；信任 agent 工具循环与用户可见 tool 轨迹即可。`destructiveHint` 仅作 prompt/注解元数据，供模型自约束。

---

## 10. Compatibility with existing messages

| 现有 | 状态 |
|------|------|
| `gapp_state` | 保留；可无 `v` 字段（Host 兼容） |
| `GappStore.*` | 保留 |
| `gapp_*` CRUD tools | 保留；领域操作优先 `gapp_call` |
| Widget `follow_up` / `sendPrompt` | 独立通道，不混入 GAPP envelope |

新消息一律带 `v: "0.1"`。

---

## 11. Implementation plan (phased)

### Phase 1 — Protocol runtime + registry（本仓库 generative-ui/gapp）

- [ ] `protocol.ts`：类型 + 校验 helpers
- [ ] 扩展 `injectGappRuntime`：`GappHost` + `__dispatch` + tools/events/generate 客户端
- [ ] `open.ts`：统一 message router（state / tools_register / tool_result / event / llm_*）
- [ ] 内存 `GappToolRegistry`（per appId：disk + live + open window ref）
- [ ] 读/写 `tools.json`（storage）
- [ ] 单元测试：envelope 校验、revision、stateOps 执行器

### Phase 2 — Pi tools + prompt

- [ ] `gapp_list_tools` / `gapp_call`
- [ ] `prompt.ts` 追加 open tools catalog
- [ ] event → `pi.sendUserMessage`（busy 时 followUp）
- [ ] `gapp_set_state` 后对开窗 `gapp_state_push`

### Phase 3 — Generative bridge

- [ ] `gapp_llm_request` 队列 + **主会话** `sendUserMessage` / `followUp` 完成回流（无独立 model）
- [ ] stream：若有 `message_update` 文本 delta 则 chunk；否则只 `llm_done`
- [ ] 连接时 system appendix / skill 路径（已有骨架）
- [ ] cancel / timeout / busy

### Phase 3b — Connection lease

- [ ] `meta.instances`：`single` | `multi`（默认 `single`）
- [ ] 跨 session 租约文件 + `already_connected` 弹窗提示
- [ ] 同 session 重开：替换/聚焦本窗
- [ ] close / shutdown 释放租约；stale pid 接管

### Phase 4 — SDK 对齐 + 示例 App

- [ ] `gapp-sdk` 同步 inject + isolated 行为 + lease（若适用）
- [ ] 示例：`examples/todo-gapp/`（`instances: "single"` + tools.json + index.html）
- [ ] README / prompt 文档更新

---

## 12. Error codes (normative)

| code | where | meaning |
|------|-------|---------|
| `not_found` | call | app or tool missing |
| `invalid_args` | call | schema fail |
| `needs_live_handler` | call | tool requires open window handler |
| `handler_error` | call | page threw |
| `timeout` | call / generate | deadline |
| `host_unavailable` | generate / event | isolated or no Pi |
| `busy` | generate | concurrency limit |
| `cancelled` | generate | client cancel |
| `provider_error` | generate | model/provider fail |
| `stale_revision` | register | ignored old revision（可只 log） |
| `already_connected` | open / connect | `instances=single` 且另一 session 已持有 live 连接 |

---

## 13. Design decisions (record)

1. **元工具而非动态 registerTool** — 适配当前 Pi ExtensionAPI；语义仍 MCP-like。
2. **state.json 仍是 SSOT** — tools 是领域 API，不是第二数据源。
3. **disk tools + live tools 分层** — 窗关仍可发现接口；live 覆盖实现。
4. **generate 只用主会话 `sendUserMessage`** — 与用户对话共用同一模型；**不**另起 completion / 独立 model 调用。
5. **event 默认不打扰** — 必须 `notifyAgent: true` 才唤起 AI。
6. **stateOps 白名单** — 无 Pi 时也能安全自动化，禁止任意代码。
7. **无 destructive 二次确认** — 不弹 TUI 确认、不额外记确认日志；依赖 agent 工具轨迹。
8. **连接互斥默认 single** — 一 app 同时只允许一个 live 连接；`multi` 显式声明才允许多开。强状态（todo）用 single，避免多窗勾选冲突。冲突时 **弹窗提示用户**，不静默抢连。

---

## 14. Resolved decisions (2026-07-24)

| # | 问题 | 决定 |
|---|------|------|
| 1 | generate 是否用独立 model API？ | **否**。只用主会话 `sendUserMessage`（busy → followUp）。 |
| 2 | destructive 工具是否 TUI 确认？ | **否**。不需要提示/确认记录。 |
| 3 | 多 session 同开一 app？ | **`instances: single`（默认）**：一连接；他 session open → 弹窗提示 + `already_connected`。 **`multi`**：可多开。强状态 todo → single。 |

无未决 open questions。

---

## 15. Changelog

| ver | date | notes |
|-----|------|-------|
| 0.1 | 2026-07-24 | Initial protocol: tools, events, generative bridge, meta-tools, stateOps |
| 0.1.1 | 2026-07-24 | Lock: main-session generate only; no destructive confirm; single-connection default + multi opt-in |
| 0.1.2 | 2026-07-31 | Add app-owned `tui.mjs` renderer contract shared by standalone and Pi hosts |

---

## 16. TUI application renderer contract

TUI 是 GAPP 的正式 renderer，不是 WebView 控制台。Bundle 可在根目录提供 `tui.mjs`：

```text
<meta/state/tools shared SSOT>
├─ index.html  → WebView renderer
└─ tui.mjs     → terminal renderer
                 ├─ standalone TUI + ProcessTerminal
                 └─ Pi ctx.ui.custom()
```

### 16.1 Module entry

```js
export default function createGappTui(runtime) {
  return {
    invalidate() {},
    render(width) { return [runtime.app.name]; },
    handleInput(data) { if (data === "q") runtime.close(); },
  };
}
```

具名 `createGappTui(runtime)` 也有效。Factory 可同步或异步，必须返回结构化 `pi-tui` Component：

- `render(width): string[]`（required）
- `invalidate(): void`（缺省由 Host 补 no-op）
- `handleInput(data): void`（optional）

GAPP module 不要求直接 import `@earendil-works/pi-tui`，因此 bundle 不需要自己的 `node_modules`。Host 包装输出并按终端可见宽度截断。

### 16.2 Injected runtime

| member | contract |
|---|---|
| `app` | `{ id, name, description, scope }` |
| `palette` | Host theme/ANSI text functions |
| `getState()` | Return current bundle `state.json` |
| `call(tool, args)` | Invoke shared GAPP service and reload state |
| `refresh()` | Reload bundle state without invoking a tool |
| `prompt({ title, initial, submit })` | Suspend app mount, collect host text input, then resume callback |
| `notify(message)` / `getStatus()` | Renderer status line |
| `isBusy()` | One action is running |
| `key(data, name)` | Match `up/down/left/right/enter/escape/tab/backspace` |
| `truncate(text, width)` / `pad(text, width)` | ANSI-aware width helpers |
| `close()` | Exit the TUI app |

### 16.3 Host rules

1. `gapp-tui [id]` and Pi `/gapp tui [id]` load the same `tui.mjs`.
2. Missing id opens a picker containing only bundles with `tui.mjs`.
3. TUI tool calls force `openIfNeeded: false`; a terminal action must not open a WebView as a side effect.
4. After tool calls, Host reloads `state.json`, invalidates the app Component, and requests render.
5. App-local input (selection/navigation) also triggers render even when it does not mutate persisted state.
6. Browser-only GAPPs remain valid but are not listed by the TUI picker.
7. `index.html` and `tui.mjs` may coexist; they share state and domain tools but own their renderer-specific UI logic.

### 16.4 Security boundary

`tui.mjs` is executable application code loaded from an installed/local GAPP bundle. It inherits the trust level of other extension-side code and is not an untrusted HTML sandbox. The runtime intentionally exposes no arbitrary filesystem API; application persistence should go through declared tools and `state.json`.
