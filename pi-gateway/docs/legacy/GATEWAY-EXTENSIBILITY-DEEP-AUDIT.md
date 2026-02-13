# pi-gateway 扩展能力深度审计报告（Gateway + Agent 透传）

- 审计日期：2026-02-08
- 审计范围：`/Users/dengwenyu/.pi/agent/pi-gateway`
- 审计目标：沉淀“可用能力、名义能力、未接线能力”的决策事实，并给出整改优先级依据

## 1. 范围与方法

### 1.1 范围

1. Gateway 进程内扩展能力：插件注册面、加载顺序、Hook 分发、HTTP/WS、Command/Tool/CLI 执行回路。
2. Agent 透传扩展能力：`skills/extensions/promptTemplates` 分层注入、角色隔离、运行时参数映射。

### 1.2 方法

1. 静态审计：逐项核对 `types -> registry -> runtime dispatch` 的闭环。
2. 证据绑定：所有关键结论绑定源码路径与行号。
3. 技术验收：对关键修复点使用测试用例验证（见第 8 节）。

## 2. 事实基线（代码证据）

### 2.1 插件加载优先级

- 运行时顺序为“外部优先，builtin 兜底”：先 `loadAll()` 后 `loadBuiltins()`，最终通过 `getLoadedPluginIds()` 汇总。  
证据：`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:136`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:137`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:138`。
- Loader 仍保持“先到先得”的去重语义。  
证据：`/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/loader.ts:97`。

### 2.2 Hook 声明与运行时覆盖

- Hook 类型声明为 14 个。  
证据：`/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/types.ts:26` 到 `/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/types.ts:44`。
- 关键补齐点已接线：
  - `before_agent_start`：`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:559`
  - `message_sending`：`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:605`
  - `before_tool_call/after_tool_call/tool_result_persist`：`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:363`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:381`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:388`
  - `before_compaction/after_compaction`：`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:412`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:417`
  - `session_end`：网关停止与会话删除路径分发，`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:220`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:1638`

### 2.3 Command/Tool/CLI 执行回路

- `registerCommand` 已进入消息主链路（`/cmd` 文本优先命中插件命令，绕过 LLM）。  
证据：`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:289`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:431`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:1775`。
- `registerTool` 已有 API/WS 调用回路：
  - HTTP：`GET /api/tools`、`POST /api/tools/call`，`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:846`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:851`
  - WS：`tools.list`、`tools.call`，`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:1686`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:1690`
  - 执行入口：`executeRegisteredTool()`，`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:348`
- `registerCli` 已进入 `pi-gw <plugin-command>` 路径。  
证据：`/Users/dengwenyu/.pi/agent/pi-gateway/src/cli.ts:140`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/cli.ts:141`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/cli.ts:163`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/cli.ts:468`。

### 2.4 `pluginConfig` 标准注入

- 配置模型新增 `plugins.config`，并由 `api.pluginConfig` 暴露给插件。  
证据：`/Users/dengwenyu/.pi/agent/pi-gateway/src/core/config.ts:139`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/types.ts:217`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts:1739`。

### 2.5 Agent 透传能力（分层注入与隔离）

- 技能/扩展/模板分层注入和签名隔离已实现：  
证据：`/Users/dengwenyu/.pi/agent/pi-gateway/src/core/capability-profile.ts`、`/Users/dengwenyu/.pi/agent/pi-gateway/src/core/rpc-pool.ts`。
- 分层优先级：`role -> gateway -> base`（skills）与 `role -> global`（extensions/promptTemplates）。  
证据：`/Users/dengwenyu/.pi/agent/pi-gateway/src/core/capability-profile.ts:127`。

## 3. 能力矩阵（双层）

| 能力域 | 名义能力 | 当前真实状态 | 证据 |
|---|---|---|---|
| 插件加载顺序 | config/global/builtin | 已实现外部优先 + builtin 兜底 | `src/server.ts:136` |
| Hook 系统 | 14 Hook + 顺序隔离执行 | 已接线核心事件，包含 tool/compact/session_end | `src/server.ts:363` |
| 命令扩展 | `registerCommand` | 已接线到消息主链路 | `src/server.ts:289` |
| 工具扩展 | `registerTool` | 已接线到 HTTP/WS 工具调用 | `src/server.ts:846` |
| CLI 扩展 | `registerCli` | 已接线到 `pi-gw <plugin-command>` | `src/cli.ts:468` |
| 插件私有配置 | `pluginConfig` | 已标准注入 | `src/server.ts:1739` |
| Agent 透传能力 | skills/extensions/prompts 分层 | 已实现并参与进程复用签名 | `src/core/capability-profile.ts` |

## 4. 名义能力 vs 真实能力差异

## 4.1 已收敛差异（本轮已修复）

1. 插件优先级声明与运行顺序差异：已收敛。  
2. `before_agent_start` 与 `message_sending` 可变语义未生效：已收敛。  
3. `registerCommand/registerTool/registerCli` 仅注册不执行：已收敛。  
4. `pluginConfig` 声明存在但无注入：已收敛。  
5. `before_compaction/after_compaction/session_end` 未接线：已收敛。

## 4.2 仍需关注的剩余差异

1. `registerTool` 目前是“网关侧工具执行回路”，并非自动并入 `pi` agent 的原生工具选择栈。  
影响：插件工具默认不会被 LLM 自动选择调用。  
2. `session_end` 语义仍偏“显式路径触发”（删除、停机），对自然失活场景缺少统一闭环。  
影响：生命周期统计与回收审计可能不完整。  
3. CLI 插件加载为“每次命令动态加载全部插件”。  
影响：插件数量大时命令启动时延上升，且插件初始化副作用需要治理。

## 5. 风险分级（P0/P1/P2）

### P0（高）

1. 工具能力语义误判风险：外部团队容易将 `registerTool` 理解为“LLM 自动可用”。  
建议：短期先在文档显式标注“手动调用面”；中期提供 agent bridge 方案。

### P1（中）

1. 会话生命周期闭环不完整（自然失活场景）。  
2. CLI 插件冷启动时延与副作用治理不足。  
3. 命令命名空间冲突治理不足（跨插件同名策略需产品化）。

### P2（低）

1. 文档与实现存在未来漂移风险（若后续接口演进未同步审计文档）。

## 6. 已修复项与剩余缺口

### 6.1 已修复项（代码已落地）

1. 插件优先级：外部优先。  
2. Hook 可变语义：`before_agent_start`、`message_sending` 生效。  
3. Tool/Command/CLI 回路：全部接线。  
4. `pluginConfig` 注入：可用。  
5. Hook 覆盖：tool/compaction/session_end 关键缺口已补齐。

### 6.2 剩余缺口（建议进入整改 Backlog）

1. Gateway Tool 与 Agent 原生工具栈桥接。  
2. `session_end` 全生命周期语义化。  
3. 命令/工具命名冲突治理与观测。  
4. 插件 CLI 启动性能优化与缓存策略。  
5. 审计自动化回归（防文档与行为漂移）。

## 7. 建议路线图

1. Phase A（1 周）：完成文档口径统一与风险告警（无功能变更）。  
2. Phase B（1-2 周）：推进工具桥接方案 PoC + 生命周期闭环。  
3. Phase C（持续）：命名治理、性能优化、审计自动化纳入 CI。

## 8. 验证状态

- 代码级验收用例：
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/loader.test.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/server.extensions.test.ts`
  - `/Users/dengwenyu/.pi/agent/pi-gateway/src/cli.plugin-command.test.ts`
- 执行命令：
  - `cd /Users/dengwenyu/.pi/agent/pi-gateway && bun run check`
  - `cd /Users/dengwenyu/.pi/agent/pi-gateway && bun test`
- 结果：
  - `bun run check` 通过（TypeScript 无报错）。
  - `bun test` 通过：`17 pass / 0 fail`（6 个测试文件）。

## 9. 附录：公共接口现状（审计要求）

1. `GatewayPluginApi`：`/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/types.ts`。  
2. WS 扩展接口：`/Users/dengwenyu/.pi/agent/pi-gateway/src/core/types.ts` 与 `src/server.ts` 中 `handleWsFrame`。  
3. HTTP 扩展入口：`/Users/dengwenyu/.pi/agent/pi-gateway/src/server.ts` 中 `/api/tools`、`/api/tools/call`。  
4. 插件配置映射：`plugins.config -> api.pluginConfig`（`src/core/config.ts` + `src/server.ts`）。
