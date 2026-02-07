# 模型控制插件模式（列模型 + 切模型）

## 目标

在 gateway 插件里提供两类能力：

1. 用户命令：`/models`、`/model provider/modelId`
2. WS 方法：`<pluginId>.models.list`、`<pluginId>.model.switch`

## 实现原则

- 切模型：走 `api.setModel(...)`
- 列模型：走网关内置 `/api/models` 或 `models.list`
- 所有实现都放在插件独立目录，不污染 agent extensions

## 最小流程

1. 先确保会话已存在（至少有一次消息）
2. `/models`：
   - 使用当前 `sessionKey`
   - 请求 `GET /api/models?sessionKey=...`
   - 返回 provider/modelId 列表
3. `/model xxx/yyy`：
   - 解析 `provider/modelId`
   - 调用 `api.setModel(sessionKey, provider, modelId)`
4. 通过 `registerGatewayMethod` 暴露同等能力给 WebSocket 客户端

## 错误处理建议

- 无活动会话：提示“先发一条消息初始化会话”
- 模型格式错误：提示正确格式 `provider/modelId`
- 空结果：提示“模型列表为空或当前会话未激活”

## 安全建议

- 若 gateway 开启 token 认证，插件内部请求 `/api/models` 时附带 `Authorization: Bearer <token>`
- 不在日志里打印 token 与完整敏感配置
