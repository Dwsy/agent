# Issue #16 实施结果：角色-工作区-频道 映射 + 多 Agent 路由管理（P1）

## 本次实现范围

### 1) 角色/工作区/频道映射打通

路由链路由原来的“分散决策”改为可联动：

- 频道 -> Agent：`resolveAgentRoute()`（binding / prefix / default）
- Agent -> Role：当频道未显式 role 时，回退 `agents.list[].role`
- Role -> Workspace：
  - 优先 `roles.workspaceDirs[role]`
  - 否则回退 `agents.list[].workspace`
  - 最后回退默认 `~/.pi/gateway/workspaces/{role}`

新增能力：
- `resolveRoleForSessionAndAgent()`
- `extractAgentIdFromSessionKey()`
- `getCwdForRole(role, config, agentId?)` 支持 agent workspace 回退

### 2) 多 Agent 管理可解释（对标 OpenClaw 增强）

- `resolveAgentRoute()` 输出：
  - `agentId`
  - `text`
  - `source`（single-agent/binding/prefix/default）
  - `bindingScore`（命中 binding 时）
- `resolveRoleForSessionDetailed()` 输出：
  - `role`
  - `source`（telegram.topic / telegram.group / discord.channel / agent.role / default 等）
- binding 匹配能力已增强：
  - `roles`（guild+roles）
  - `parentPeer`（线程父级继承）
  - `peer.kind` 扩展支持 `channel/thread`
- `session.dmScope` 新增支持 `per-account-channel-peer`

### 3) 运行链路接线

- Telegram / Discord / Feishu 入站日志增加 `agentSource`（以及可选 `bindingScore`）
- `message-pipeline` 在 `session_created` 元数据中记录 `roleSource`
- `message-pipeline` 角色解析改为 agent-aware（支持 agent.role 回退）
- `server.buildSessionProfile` 根据 `sessionKey` 提取 `agentId`，用于 workspace 解析

### 4) TG 键盘 + RPC 角色管理深度集成

- `/role`（Telegram）无参数时弹出键盘，支持快速选择角色
- 键盘回调 `role:set:<name>` 直接切换当前会话角色
- 网关 RPC 新增角色管理方法：
  - `roles.list`
  - `roles.set`
  - `roles.create`
  - `roles.delete`
- Gateway Plugin API 暴露：
  - `listAvailableRoles()`
  - `setSessionRole()`
  - `createRole()`
  - `deleteRole()`

### 5) 生产配置样例（JSONC）

- 已提供完整示例：`pi-gateway.jsonc.example`
- 包含：
  - 角色-工作区映射
  - 多 agent 列表与 role 绑定
  - channel/guild/roles/parentPeer bindings
  - `dmScope: per-account-channel-peer`

### 6) 兼容性

- 保留旧 API：`resolveAgentId()` 与 `resolveRoleForSession()`
- 现有调用不会被破坏

## 验证

- `session-router.test.ts`：通过（新增映射相关断言）
- `bbd-v3-routing-real.test.ts`：通过（路由回归）

## 价值

- 实现了你要的核心：角色-工作区-频道映射在实际路由链路中联动生效
- 多 agent 管理从“可配置但未完全打通”变为“可解释 + 可落地”
- 为后续 P2（parent-peer / guild+roles / per-account-channel-peer）留出稳定演进点
