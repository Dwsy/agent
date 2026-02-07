# Feature Reality Check — 实际能力诚实评估

## 图片接收

**链路：TG photo -> download -> base64 -> pi RPC prompt(images)**

| 步骤 | 状态 | 说明 |
|------|------|------|
| TG 接收 photo/document | 可行 | `bot.on("message:photo/document")` 注册了 |
| 下载文件 | 可行 | `downloadTelegramFile()` 通过 Telegram File API |
| base64 编码 | 可行 | `Buffer.from(arrayBuffer).toString("base64")` |
| 传给 gateway dispatch | 可行 | `ImageContent` 格式正确 |
| 传给 pi RPC | 可行 | pi RPC 协议支持 `images` 字段 |
| pi agent 理解图片 | 取决于模型 | 需要模型支持 vision（如 claude-sonnet-4-5、gpt-5.1 等） |

**结论：图片接收链路完整可行，但未经真实 TG bot 端到端测试。**

## 图片/文件发送（agent 回复图片）

**状态：不支持**

当前 agent 回复的是纯文本。如果 agent 生成了图片（比如用工具画图），pi RPC 的事件流里只有 `text_delta`，没有图片数据。要支持 agent 发图片需要：
- pi 工具生成文件 -> 文件路径在 tool_execution_end 事件中
- gateway 检测到文件路径 -> 下载 -> Telegram sendPhoto

这个链路当前完全没实现。

## 音频/语音

**接收：部分支持**
- `bot.on("message:voice")` 注册了，但只发了个文本提示 "(voice message)"
- 没有实际下载音频文件传给 agent
- pi 的 RPC 协议不直接支持音频，需要先转录为文本

**发送：不支持**
- agent 无法回复语音消息

## 流式回复（editMessageText）

**状态：框架写了但实际没接线**

看 `handleAgentTurn` 代码：
- `replyMsgId` 初始为 null
- 没有代码在 streaming 过程中发送初始消息并 edit
- 实际行为仍是等 `respond()` 回调时一次性发送
- `respond` 回调里有 `editMessageText` 逻辑，但 `replyMsgId` 永远是 null（因为没人设置它）

**结论：流式回复代码是死代码，实际表现和之前一样——等完整回复后一次发送。**

## 消息去抖

**状态：可行但未测试**

`debounceInbound()` 逻辑看起来正确：
- 1.5s 窗口
- 合并文本和图片
- 用最后一个 ctx 回复

但 debounce 后的 `flushDebounced` 直接调用 `handleAgentTurn`，这个函数的 streaming 部分有问题（如上所述）。

## sequentialize + apiThrottler

**状态：可行**

这两个是 grammy 中间件，只要 `bot.use(sequentialize(...))` 和 `bot.api.config.use(apiThrottler())` 调用正确就生效。代码逻辑正确。

## Markdown -> HTML

**状态：可行但简化**

`markdownToTelegramHtml()` 是简单的正则替换，覆盖了常见 case。OpenClaw 用的是完整的 Markdown IR 解析器（`markdownToIR` -> render）。我们的版本在嵌套格式（如粗体里的代码）可能出错，但单层格式化是对的。

## 原生 Slash 命令

**状态：可行**

`bot.api.setMyCommands()` 在 `start()` 里调用，这是标准 grammy 用法。

---

## 需要修复的问题

1. **流式回复是死代码** — 需要在 dispatch 管道中真正实现 streaming edit
2. **语音消息只是假处理** — 应该下载音频，或至少诚实地说不支持
3. **rpc-client prompt() 的 images 签名不精确** — 实际数据流是对的（`as any` 绕过），但类型应该修正
