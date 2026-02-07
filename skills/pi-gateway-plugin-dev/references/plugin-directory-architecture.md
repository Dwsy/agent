# 插件目录架构规范（强制）

## 1. 插件发现与加载规则

`pi-gateway` 的插件加载顺序：

1. `config.plugins.dirs[]`
2. `~/.pi/gateway/plugins/`
3. 内置插件（`src/plugins/builtin/*`）

每个插件目录必须包含 `plugin.json`，并且 `main` 入口必须存在。

## 2. 强制目录结构

```text
<plugins-root>/<plugin-id>/
  plugin.json
  src/
    index.ts
    types.ts
    commands.ts
    rpc-methods.ts
    hooks.ts
    services.ts
```

## 3. 文件职责

- `plugin.json`
  - 元信息与入口声明
  - `main` 是相对于插件目录的路径（例如 `src/index.ts`）
- `src/index.ts`
  - 仅做注册装配：`registerCommand/registerGatewayMethod/registerHook/registerService`
  - 不要写复杂业务逻辑
- `src/types.ts`
  - 插件内部类型、参数解析、校验函数
- `src/commands.ts`
  - `/xxx` 命令处理，面向聊天入口
- `src/rpc-methods.ts`
  - 自定义 WS 方法，面向 WebSocket 客户端
- `src/hooks.ts`
  - 生命周期监听（`message_received`、`agent_end`、`session_start` 等）
- `src/services.ts`
  - 后台任务（轮询、监控、清理）

## 4. 禁止模式

- 禁止把插件做成 `~/.pi/agent/extensions/*.ts`（这是另一个系统）
- 禁止“只有一个 index.ts 且包含全部逻辑”
- 禁止缺少 `plugin.json`

## 5. plugin.json 最小示例

```json
{
  "id": "model-control",
  "name": "Model Control",
  "version": "0.1.0",
  "description": "Model listing and switching for gateway sessions",
  "main": "src/index.ts"
}
```

## 6. gateway 模式加载配置

```jsonc
{
  "plugins": {
    "dirs": ["~/.pi/gateway/plugins"],
    "disabled": []
  }
}
```

配置后启动 `pi-gateway`，日志中应出现 `Loaded plugin: <plugin-id>`。
