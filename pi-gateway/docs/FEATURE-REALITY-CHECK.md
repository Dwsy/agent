# Feature Reality Check — 实际能力诚实评估

> Updated: 2026-02-11 by KeenDragon

## 图片接收

**链路：TG photo -> download -> base64 -> pi RPC prompt(images)**

| 步骤 | 状态 | 说明 |
|------|------|------|
| TG 接收 photo/document | ✅ 可行 | `bot.on("message:photo/document")` 注册了 |
| 下载文件 | ✅ 可行 | `downloadTelegramFile()` 通过 Telegram File API |
| base64 编码 | ✅ 可行 | `Buffer.from(arrayBuffer).toString("base64")` |
| 传给 gateway dispatch | ✅ 可行 | `ImageContent` 格式正确 |
| 传给 pi RPC | ✅ 可行 | pi RPC 协议支持 `images` 字段 |
| pi agent 理解图片 | 取决于模型 | 需要模型支持 vision（如 claude-sonnet-4-5、gpt-5.1 等） |

**结论：图片接收链路完整可行，但未经真实 TG bot 端到端测试。**

## 图片/文件发送（agent 回复图片）

**状态：部分支持**

agent 回复文本中可嵌入媒体指令（`parseOutboundMediaDirectives` 解析），支持通过 `sendTelegramMedia` 发送图片/文件。但 pi RPC 事件流中没有原生图片数据字段，需要 agent 在文本中嵌入文件路径或 URL。

## 音频/语音

**接收：部分支持**
- `bot.on("message:voice")` 注册了，返回文本提示告知用户语音不支持
- 没有实际下载音频文件传给 agent
- pi 的 RPC 协议不直接支持音频，需要先转录为文本

**发送：不支持**
- agent 无法回复语音消息

## 流式回复（editMessageText）

**状态：✅ 已工作，含 throttle 保护**

`dispatchAgentTurn` 中的流式回复链路完整：

1. `streamMode` 默认 `"partial"`，dispatch 前调用 `ensureReplyMessage()` 发送初始消息
2. `sendMessage` 返回后设置 `replyMsgId`
3. `onStreamDelta` 触发 → `pushLiveUpdate()` → `editMessageText(replyMsgId, rendered, { parse_mode: "HTML" })`
4. `respond()` 最终用 `editMessageText` 替换为完整内容

**保护机制：**
- `editThrottleMs: 1000`（默认），每秒最多 1 次 edit，避免 Telegram 429
- `editInFlight` flag 防止并发 edit 请求
- `creatingReplyMsg` flag 防止重复创建初始消息
- 时序安全：`onStreamDelta` 在 `replyMsgId` 设置前触发时，`pushLiveUpdate` 会再次调 `ensureReplyMessage(rendered)` 把首段内容作为初始消息

**spinner 动画：**
- 等待阶段显示旋转动画（⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏），200ms 帧率
- 受 throttle 限制实际 ~1fps，视觉上够用
- 收到首段内容后自动停止

## 消息去抖

**状态：✅ 可行**

`scheduleDebounce()` 逻辑正确：
- 可配置窗口（`debounceMs`，默认 0 即不合并）
- 合并同一 chat 的文本和图片
- 用最后一个 ctx 回复
- flush 后调用 `dispatchAgentTurn`，流式回复链路完整

## sequentialize + apiThrottler

**状态：✅ 可行**

grammy 中间件正确注册，`bot.use(sequentialize(...))` 和 `bot.api.config.use(apiThrottler())` 生效。

## Markdown -> HTML

**状态：✅ 可行，覆盖常见场景**

`markdownToTelegramHtml()` 正则替换，支持：
- 代码块（\`\`\`）→ `<pre><code>`
- 行内代码（\`）→ `<code>`
- 粗体（\*\*/__）→ `<b>`
- 斜体（\*/_）→ `<i>`
- 删除线（~~）→ `<s>`
- 链接（\[text\](url)）→ `<a>`

新增：
- thinking 内容 → `<blockquote>`（escapeHtml 转义）
- tool calls → backtick 格式经转换为 `<code>`
- 流式编辑和首条消息均带 `parse_mode: "HTML"`

嵌套格式（如粗体里的代码）可能出错，但单层格式化正确。

## 原生 Slash 命令

**状态：✅ 可行，支持动态注册**

- 本地命令（new/status/queue/help/refresh 等）通过 `bot.command()` 注册
- pi 原生命令通过 `getPiCommands()` 从 RPC `getCommands()` 动态获取
- `registerNativeCommands()` 合并本地 + pi 命令，去重后注册到 Telegram
- 延迟加载：第一条真实消息到达后自动刷新命令列表（per-account flag）
- `/refresh` 命令手动触发重新获取
- 命令名 sanitize：`cmd.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32)`

## Thinking 内容处理

**状态：✅ 已修复**

- `thinking_delta`/`thinking_start`/`thinking_end` 事件只记日志，不加到 `fullText`
- `message_end` 的 content 数组中 `type: "thinking"` 条目被过滤
- Telegram 用户不会看到 thinking 内容

## 消息重复

**状态：✅ 已修复**

- `onStreamDelta` 流式累积文本到 `contentSequence`
- `respond()` 回调用最终文本替换（而非追加）`contentSequence` 中最后一个 text 条目
- 避免同一段文本出现两次

---

## 待改进

1. **语音消息** — 当前只返回文本提示，未来可接入 Whisper 转录
2. **rpc-client prompt() 的 images 类型** — 实际数据流正确（`as any` 绕过），类型签名待修正
3. **嵌套 Markdown** — 粗体内代码等嵌套格式可能渲染异常
