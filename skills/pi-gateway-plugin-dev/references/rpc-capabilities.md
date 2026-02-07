# RPC 能力映射（gateway 插件视角）

来源：`pi-gateway/src/core/rpc-client.ts`、`pi-gateway/src/server.ts`

## 1. 调用链

```text
Gateway Plugin
  -> GatewayPluginApi (SDK)
    -> server.createPluginApi()
      -> RpcClient
        -> pi --mode rpc (JSONL 协议)
```

## 2. RpcClient 已实现命令

- 会话与消息：`prompt`, `steer`, `abort`, `new_session`, `get_state`
- 模型与思考：`set_model`, `get_available_models`, `cycle_model`, `set_thinking_level`, `cycle_thinking_level`
- 上下文管理：`compact`, `get_session_stats`, `get_messages`, `get_last_assistant_text`
- 行为开关：`set_auto_compaction`, `set_auto_retry`, `set_steering_mode`, `set_follow_up_mode`, `abort_retry`

## 3. 当前 SDK 直接暴露到插件的 RPC 能力

`GatewayPluginApi` 直接暴露：

- `resetSession` -> `new_session`
- `setThinkingLevel` -> `set_thinking_level`
- `setModel` -> `set_model`
- `compactSession` -> `compact`
- `abortSession` -> `abort`

未直接暴露（但网关已有）：

- `get_available_models`
- `cycle_model`
- `cycle_thinking_level`
- `get_session_stats`
- `get_messages`

## 4. 列模型/切模型的推荐路径

### 切模型（插件内直接可做）

用 `api.setModel(sessionKey, provider, modelId)`。

### 列模型（建议复用网关内置）

优先使用：

- WS 内置方法：`models.list`
- HTTP 内置接口：`GET /api/models?sessionKey=...`

原因：当前 `GatewayPluginApi` 没有直接 `getAvailableModels`。

## 5. 事件流（用于“输入中/处理中”状态）

Agent 运行时可观察关键事件：

- `message_update`（文本增量）
- `tool_execution_start`
- `tool_execution_end`
- `agent_end`

插件可通过 Hook 或网关 WS 事件广播配合前端/机器人状态提示。

## 6. 需要“插件内直连更多 RPC”时的扩展路径

如果要在插件中直接调用 `get_available_models` / `cycle_model`：

1. 在 `pi-gateway/src/plugins/types.ts` 扩展 `GatewayPluginApi` 接口。
2. 在 `pi-gateway/src/server.ts#createPluginApi` 增加对应方法实现（调用 pool 上的 `RpcClient`）。
3. 按需暴露 HTTP/WS 接口与命令，形成端到端能力。

保持接口命名与 `RpcClient` 一致，避免语义漂移。
