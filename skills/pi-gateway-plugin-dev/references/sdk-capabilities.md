# Gateway SDK 能力（`GatewayPluginApi`）

来源：`pi-gateway/src/plugins/types.ts`、`pi-gateway/src/server.ts#createPluginApi`

## 1. 元信息与上下文

- `api.id`：插件 ID
- `api.name`：插件名称
- `api.source`：来源（gateway）
- `api.config`：网关配置（含端口、认证、插件目录等）
- `api.logger`：插件专属日志

## 2. 注册能力（8 个）

- `registerChannel(channel)`
- `registerTool(tool)`
- `registerHook(events, handler)`
- `registerHttpRoute(method, path, handler)`
- `registerGatewayMethod(method, handler)`
- `registerCommand(name, handler)`
- `registerService(service)`
- `registerCli(registrar)`

以及便捷方法：

- `on(hook, handler)`，等价 `registerHook([hook], handler)`

## 3. 运行时能力

- `dispatch(msg)`：向 Agent 管道投递消息
- `sendToChannel(channel, target, text)`：向指定通道发消息
- `getSessionState(sessionKey)`：读取会话状态
- `resetSession(sessionKey)`：重置会话（RPC `new_session`）
- `setThinkingLevel(sessionKey, level)`：设置思考等级（RPC `set_thinking_level`）
- `setModel(sessionKey, provider, modelId)`：切模型（RPC `set_model`）
- `compactSession(sessionKey, instructions?)`：压缩会话（RPC `compact`）
- `abortSession(sessionKey)`：中断当前轮（RPC `abort`）

## 4. 命令与 WS 方法上下文

### `registerCommand` 的 `CommandContext`

- `sessionKey: string`
- `senderId: string`
- `channel: string`
- `args: string`
- `respond(text)`：回消息

### `registerGatewayMethod` 的处理函数

- 入参：`(params: Record<string, unknown>, ctx: { clientId: string; sessionKey?: string })`
- 返回值：任意 JSON 可序列化数据

## 5. Hook 能力（14 个）

- Agent 生命周期：`before_agent_start`, `agent_end`
- 消息链路：`message_received`, `message_sending`, `message_sent`
- 工具调用：`before_tool_call`, `after_tool_call`, `tool_result_persist`
- 会话生命周期：`session_start`, `session_end`
- 压缩：`before_compaction`, `after_compaction`
- 网关生命周期：`gateway_start`, `gateway_stop`

## 6. 设计建议

- `index.ts` 只注册模块，逻辑放到分文件
- `registerCommand` 负责人机交互体验（简洁、可回显）
- `registerGatewayMethod` 负责机器调用（固定 schema）
- Hook 只做观察与轻度改写，避免把主业务塞进 Hook
