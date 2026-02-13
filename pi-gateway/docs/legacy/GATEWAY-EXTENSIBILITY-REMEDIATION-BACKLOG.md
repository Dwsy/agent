# pi-gateway 扩展能力整改 Backlog（可直接开发）

- 基线来源：`docs/GATEWAY-EXTENSIBILITY-DEEP-AUDIT.md`
- 目标：将“剩余缺口”拆解为可直接开发、可验收、可回滚的工程任务
- 状态定义：`TODO` / `IN_PROGRESS` / `DONE`

## 任务 BG-001

- ID：`BG-001`
- 优先级：`P0`
- 状态：`TODO`
- 目标：为 `registerTool` 提供“Agent 可调用桥接”能力，消除“仅手动调用”的语义落差。
- 改动文件：
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/core/config.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/types.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/core/capability-profile.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/server.extensions.test.ts`
- 接口/类型变化：
  - 拟新增（未实现）`agent.toolBridge.enabled` 配置项。
  - 拟新增（未实现）网关工具桥接协议（`toolName`, `params`, `sessionKey`, `result`）。
- 实现步骤：
  1. 设计“网关工具 -> pi agent 工具调用”的桥接层（可通过 extension 或 RPC sidecar）。
  2. 对桥接调用链接入 `before_tool_call/after_tool_call/tool_result_persist`。
  3. 增加可观测日志与失败降级（桥接不可用时回退到当前手动调用模式）。
  4. 在 README 与 API 文档标注桥接能力边界。
- 测试点：
  - Agent 触发工具时可命中 gateway tool。
  - Hook payload 变更可传递到工具执行与结果持久化阶段。
  - 桥接关闭时行为不回归。
- 验收标准：
  - LLM 可自动触发至少一个 `registerTool` 注册工具。
  - `bun run check`、`bun test` 全绿。
  - 文档说明与行为一致。
- 风险：
  - 与 pi 原生工具生态冲突导致重复/歧义调用。
- 回滚点：
  - 关闭 `agent.toolBridge.enabled` 回退到现有手动调用模式。

## 任务 BG-002

- ID：`BG-002`
- 优先级：`P1`
- 状态：`TODO`
- 目标：补全 `session_end` 生命周期触发语义，覆盖自然失活与主动释放场景。
- 改动文件：
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/core/rpc-pool.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/core/session-store.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/server.extensions.test.ts`
- 接口/类型变化：
  - 无对外 API 破坏性变更。
  - 拟新增（未实现）会话终止原因枚举（`shutdown|delete|idle_reclaim|manual_reset`）用于审计字段。
- 实现步骤：
  1. 梳理所有会话终止路径（delete、stop、idle reclaim、manual reset）。
  2. 在统一出口 dispatch `session_end`，并附带终止原因元数据。
  3. 修正 transcript/session 统计口径。
- 测试点：
  - 每种终止路径均触发一次且仅一次 `session_end`。
  - 原有 `session_start` 不回归。
- 验收标准：
  - 生命周期闭环覆盖率达到 100%（定义内路径）。
  - 测试新增并通过。
- 风险：
  - 重复 dispatch 造成插件侧计数偏差。
- 回滚点：
  - 保留旧行为开关（仅 delete/stop 触发）作为临时兜底。

## 任务 BG-003

- ID：`BG-003`
- 优先级：`P1`
- 状态：`TODO`
- 目标：建立插件命令与工具命名冲突治理策略，避免跨插件覆盖不可见。
- 改动文件：
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/loader.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/types.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/server.extensions.test.ts`
- 接口/类型变化：
  - 拟新增（未实现）冲突策略配置：`plugins.conflictPolicy = warn|reject|override`。
  - 拟新增（未实现）冲突可观测事件输出。
- 实现步骤：
  1. 对 command/tool/cli 注册时统一检测重复命名。
  2. 按策略执行（默认 `warn`，兼容旧行为）。
  3. 将冲突信息暴露到 `/api/plugins` 与日志。
- 测试点：
  - 同名注册在三种策略下行为正确。
  - 默认策略不破坏现有插件。
- 验收标准：
  - 冲突可见、可配置、可回放定位。
- 风险：
  - 严格策略可能导致旧插件加载失败。
- 回滚点：
  - 配置回退到 `warn`。

## 任务 BG-004

- ID：`BG-004`
- 优先级：`P1`
- 状态：`TODO`
- 目标：优化插件 CLI 冷启动性能并控制副作用。
- 改动文件：
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/cli.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/loader.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/cli.plugin-command.test.ts`
- 接口/类型变化：
  - 无破坏性变更。
  - 拟新增（未实现）CLI 模式下插件加载白名单与缓存。
- 实现步骤：
  1. 增加 CLI 侧注册缓存（按 config hash + mtime）。
  2. 限制 CLI 模式插件执行上下文，避免 runtime-only 副作用逻辑触发。
  3. 暴露 `--no-plugin-cli-cache` 调试开关。
- 测试点：
  - 重复运行插件命令启动时延下降。
  - 缓存失效逻辑正确。
- 验收标准：
  - 同环境第二次执行时延显著降低（目标 >=30%）。
  - 功能与现有行为一致。
- 风险：
  - 缓存污染导致命令不更新。
- 回滚点：
  - 关闭缓存开关恢复旧路径。

## 任务 BG-005

- ID：`BG-005`
- 优先级：`P2`
- 状态：`TODO`
- 目标：将扩展能力审计纳入持续回归，防止“实现与文档漂移”。
- 改动文件：
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/server.extensions.test.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/loader.test.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/README.md`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/CHANGELOG.md`
- 接口/类型变化：
  - 无。
- 实现步骤：
  1. 增加“接口面快照测试”（WS method/HTTP route/Hook 覆盖）。
  2. 在 CI 中强制执行 `bun run check && bun test`。
  3. 对 README/CHANGELOG 的关键能力声明加审计清单引用。
- 测试点：
  - 声明能力变更但未更新测试时，CI 失败。
  - 文档链接持续可用。
- 验收标准：
  - 审计能力具备自动告警能力。
- 风险：
  - 测试维护成本上升。
- 回滚点：
  - 可先降级为 nightly 检查。

## 拟议变更（未实现）与兼容策略

1. `agent.toolBridge.enabled`（新配置，默认 `false`）  
兼容策略：默认关闭，保持现行为“手动调用 tools.call”。

2. `plugins.conflictPolicy`（新配置，默认 `warn`）  
兼容策略：默认仅告警，不阻断旧插件。

3. `session_end` 原因字段（新增元数据，不破坏现有 payload 基本结构）  
兼容策略：字段可选，旧插件可忽略。
