# ADR-004: pi-gateway 类型系统统一与文档化

> 状态: 📝 设计阶段  
> 作者: VividViper  
> 日期: 2026-02-22  
> 依赖: 等待 DarkViper core/ 重构完成

---

## 1. 背景与动机

当前 pi-gateway 的类型定义分散在多个文件中，存在以下问题：

1. **重复定义**: `SessionKey`, `Logger`, `Config` 等类型在多处重复导入
2. **循环依赖风险**: `plugins/types.ts` 导入 `core/types.ts`，而 `gateway/types.ts` 又导入两者
3. **缺乏统一出口**: 新开发者难以找到正确的类型导入源
4. **文档缺失**: 复杂类型（如 `HookPayload` 映射）缺乏 JSDoc 说明

---

## 2. 当前类型分布

### 2.1 源文件位置

| 文件 | 行数 | 核心内容 |
|------|------|----------|
| `src/core/types.ts` | 313 | RPC命令/响应、消息类型、会话状态、日志 |
| `src/gateway/types.ts` | 130 | GatewayContext、DispatchResult |
| `src/plugins/types.ts` | 497 | 插件Hook、Channel API、GatewayPluginApi |
| `src/core/system-prompts/types.ts` | 125 | 系统提示段架构 |
| `src/core/config.ts` | ~800 | 配置类型（与实现混合） |

### 2.2 内置插件类型

| 文件 | 内容 |
|------|------|
| `src/plugins/builtin/discord/types.ts` | DiscordChannelConfig, DiscordPluginRuntime |
| `src/plugins/builtin/feishu/types.ts` | FeishuChannelConfig, FeishuMessageContext |
| `src/plugins/builtin/telegram/types.ts` | TelegramAccountRuntime, TelegramContext 等 |

---

## 3. 依赖关系分析

### 3.1 core/types.ts 被引用情况

```
src/core/types.ts
├── src/plugins/types.ts (导入 Logger, SessionKey, InboundMessage...)
├── src/gateway/types.ts (导入 Logger, SessionKey, InboundMessage)
├── src/server.ts (大量导入)
├── src/gateway/*.ts (tool-executor, dispatch, message-pipeline...)
├── src/api/*.ts (keyboard-interact, message-send, session-api...)
├── src/ws/*.ts (ws-methods, ws-router)
└── src/tools/*.ts (sticker, delegate-to-agent)
```

**引用统计**: ~30 个文件

### 3.2 plugins/types.ts 被引用情况

```
src/plugins/types.ts
├── src/gateway/tool-executor.ts (ToolPlugin)
├── src/gateway/types.ts (GatewayPluginApi)
├── src/cli.ts (PluginManifest, GatewayPluginApi, HookHandler...)
├── src/server.ts (ChannelPlugin, ToolPlugin, BackgroundService...)
├── src/tools/sticker.ts (ToolDefinition)
├── src/tools/delegate-to-agent.ts (ToolDefinition)
├── src/core/cron-announcer.ts (ChannelPlugin)
├── src/core/heartbeat-executor.ts (ChannelPlugin)
└── plugins/*/index.ts (GatewayPluginApi)
```

**引用统计**: ~12 个文件

### 3.3 gateway/types.ts 被引用情况

```
src/gateway/types.ts
├── src/server.ts (GatewayContext, DispatchResult...)
├── src/cli.ts (DispatchResult)
├── src/ws/*.ts (GatewayContext, WsClientData)
├── src/api/*.ts (GatewayContext)
├── src/core/cron-api.ts (GatewayContext)
└── src/plugins/plugin-api-factory.ts (GatewayContext)
```

**引用统计**: ~15 个文件

### 3.4 循环依赖风险图

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  core/types.ts  │◄────│ plugins/types.ts│◄────│ gateway/types.ts│
└────────┬────────┘     └─────────────────┘     └────────┬────────┘
         │                                               │
         └───────────────────┬───────────────────────────┘
                             │
                    ┌─────────▼─────────┐
                    │   server.ts       │
                    └───────────────────┘
```

**风险点**: `gateway/types.ts` 导入 `plugins/types.ts`，而 `plugins/types.ts` 导入 `core/types.ts`。若 `core/types.ts` 需要反向引用插件类型，将产生循环依赖。

---

## 4. 目标架构

### 4.1 新目录结构

```
src/types/
├── index.ts          # 统一出口
├── core.ts           # 核心领域类型
├── api.ts            # API 请求/响应类型
├── plugins.ts        # 插件接口类型
├── gateway.ts        # Gateway 上下文类型
├── config.ts         # 配置类型（从 core/config.ts 提取）
└── system-prompts.ts # 系统提示类型
```

### 4.2 分层依赖规则

```
┌─────────────────────────────────────┐
│           index.ts (出口)            │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌───────┐ ┌────────┐ ┌──────────┐
│api.ts │ │gateway.ts│ │plugins.ts│
└───┬───┘ └────┬───┘ └────┬─────┘
    │          │          │
    │    ┌─────┴──────────┘
    │    ▼
    │ ┌─────────────────┐
    │ │   core.ts       │ ◄── 最底层，无外部依赖
    │ └────────┬────────┘
    │          │
    │    ┌─────┘
    ▼    ▼
┌─────────────────┐
│   config.ts     │ ◄── 独立层，被所有层引用
└─────────────────┘
```

**规则**:
1. `config.ts` 是最底层，可被所有其他类型文件导入
2. `core.ts` 不依赖任何其他类型文件
3. `plugins.ts` 可导入 `core.ts` 和 `config.ts`
4. `gateway.ts` 可导入 `core.ts`, `config.ts`, `plugins.ts`
5. `api.ts` 可导入所有下层类型
6. `index.ts` 只进行重新导出

---

## 5. 类型映射表

### 5.1 迁移到 `src/types/core.ts`

| 类型 | 当前位置 | 说明 |
|------|----------|------|
| `ImageContent` | `core/types.ts` | 来自 @mariozechner/pi-ai 的重新导出 |
| `TextContent`, `ThinkingContent` | `core/types.ts` | LLM 消息内容类型 |
| `ToolCall`, `Usage`, `StopReason` | `core/types.ts` | 工具调用相关 |
| `UserMessage`, `AssistantMessage`, `ToolResultMessage` | `core/types.ts` | 消息角色类型 |
| `Model` | `core/types.ts` | 模型定义 |
| `ThinkingLevel` | `core/types.ts` | 思考级别 |
| `AgentEvent`, `AgentMessage` | `core/types.ts` | RPC 流事件 |
| `AssistantMessageEvent` | `core/types.ts` | 流式消息事件 |
| `RpcCommand` | `core/types.ts` | RPC 命令联合类型（45个变体） |
| `RpcResponse` | `core/types.ts` | RPC 响应结构 |
| `RpcSessionState` | `core/types.ts` | get_state 响应负载 |
| `SessionState` | `core/types.ts` | 会话状态 |
| `InboundMessage` | `core/types.ts` | 入站消息 |
| `OutboundMessage` | `core/types.ts` | 出站消息 |
| `SessionKey` | `core/types.ts` | 会话标识符 |
| `MessageSource` | `core/types.ts` | 消息来源 |
| `Logger` | `core/types.ts` | 日志接口 |
| `LogLevel` | `core/types.ts` | 日志级别 |
| `WsFrame` | `core/types.ts` | WebSocket 帧 |

### 5.2 迁移到 `src/types/config.ts`

| 类型 | 当前位置 | 说明 |
|------|----------|------|
| `Config` | `core/config.ts` | 主配置接口 |
| `GatewayConfig` | `core/config.ts` | 网关配置 |
| `AgentPoolConfig` | `core/config.ts` | 代理池配置 |
| `DelegationConfig` | `core/config.ts` | 委托配置 |
| `HeartbeatConfig` | `core/config.ts` | 心跳配置 |
| `ToolPolicyConfig` | `core/config.ts` | 工具策略 |
| `SandboxConfig` | `core/config.ts` | 沙箱配置 |
| `AgentRuntimeConfig` | `core/config.ts` | 代理运行时 |
| `AgentDefinition` | `core/config.ts` | 代理定义 |
| `DelegationConstraints` | `core/config.ts` | 委托约束 |
| `AgentBinding` | `core/config.ts` | 代理绑定 |
| `CronJob` | `core/config.ts` | 定时任务 |
| `TelegramChannelConfig` | `core/config.ts` | Telegram 配置 |
| `DiscordChannelConfig` | `core/config.ts` | Discord 配置（需协调内置插件） |
| `FeishuChannelConfig` | `core/config.ts` | 飞书配置（需协调内置插件） |

### 5.3 迁移到 `src/types/plugins.ts`

| 类型 | 当前位置 | 说明 |
|------|----------|------|
| `PluginHookName` | `plugins/types.ts` | 15个生命周期钩子 |
| `HookPayload` | `plugins/types.ts` | Hook 负载映射 |
| `HookHandler` | `plugins/types.ts` | Hook 处理器 |
| `ChannelPluginMeta` | `plugins/types.ts` | 通道元数据 |
| `ChannelPluginCapabilities` | `plugins/types.ts` | 通道能力 |
| `SendOptions` | `plugins/types.ts` | 发送选项 |
| `MediaSendOptions` | `plugins/types.ts` | 媒体发送选项 |
| `MediaSendResult` | `plugins/types.ts` | 媒体发送结果 |
| `MessageSendResult` | `plugins/types.ts` | 消息发送结果 |
| `ReactionOptions` | `plugins/types.ts` | 反应选项 |
| `MessageActionResult` | `plugins/types.ts` | 消息操作结果 |
| `ReadHistoryResult` | `plugins/types.ts` | 读取历史结果 |
| `ChannelOutbound` | `plugins/types.ts` | 通道出站接口 |
| `InlineKeyboardMarkup` | `plugins/types.ts` | 内联键盘 |
| `InlineKeyboardButton` | `plugins/types.ts` | 键盘按钮 |
| `StreamPlaceholderOpts` | `plugins/types.ts` | 流式占位符选项 |
| `StreamEditOpts` | `plugins/types.ts` | 流式编辑选项 |
| `StreamingConfig` | `plugins/types.ts` | 流式配置 |
| `ChannelStreamingAdapter` | `plugins/types.ts` | 流式适配器 |
| `DmPolicy` | `plugins/types.ts` | DM 策略 |
| `AccessCheckContext` | `plugins/types.ts` | 访问检查上下文 |
| `AccessResult` | `plugins/types.ts` | 访问检查结果 |
| `ChannelSecurityAdapter` | `plugins/types.ts` | 安全适配器 |
| `ChannelPlugin` | `plugins/types.ts` | 通道插件接口 |
| `ToolDefinition` | `plugins/types.ts` | 工具定义 |
| `ToolContext` | `plugins/types.ts` | 工具上下文 |
| `ToolResult` | `plugins/types.ts` | 工具结果 |
| `ToolPlugin` | `plugins/types.ts` | 工具插件接口 |
| `BackgroundService` | `plugins/types.ts` | 后台服务 |
| `CommandContext` | `plugins/types.ts` | 命令上下文 |
| `CommandHandler` | `plugins/types.ts` | 命令处理器 |
| `CliCommandHandler` | `plugins/types.ts` | CLI 命令处理器 |
| `CliProgram` | `plugins/types.ts` | CLI 程序 |
| `HttpHandler` | `plugins/types.ts` | HTTP 处理器 |
| `WsMethodHandler` | `plugins/types.ts` | WS 方法处理器 |
| `PluginManifest` | `plugins/types.ts` | 插件清单 |
| `GatewayPluginApi` | `plugins/types.ts` | 插件 API 接口（~40个方法） |

### 5.4 迁移到 `src/types/gateway.ts`

| 类型 | 当前位置 | 说明 |
|------|----------|------|
| `TelegramMessageMode` | `gateway/types.ts` | 消息模式 |
| `DispatchResult` | `gateway/types.ts` | 调度结果 |
| `WsClientData` | `gateway/types.ts` | WS 客户端数据 |
| `GatewayContext` | `gateway/types.ts` | 网关上下文（~30个属性） |

### 5.5 迁移到 `src/types/system-prompts.ts`

| 类型 | 当前位置 | 说明 |
|------|----------|------|
| `GatewayIdentityContext` | `core/system-prompts/types.ts` | 网关身份上下文 |
| `SegmentPriority` | `core/system-prompts/types.ts` | 段优先级枚举 |
| `PromptFeatureFlags` | `core/system-prompts/types.ts` | 特性标志 |
| `ISystemPromptSegment` | `core/system-prompts/types.ts` | 段接口 |
| `SegmentConstructor` | `core/system-prompts/types.ts` | 段构造函数 |
| `PluginSystemPromptSegment` | `core/system-prompts/types.ts` | 插件段（兼容） |
| `RegistryEntry` | `core/system-prompts/types.ts` | 注册表项 |
| `BuildResult` | `core/system-prompts/types.ts` | 构建结果 |
| `BuilderOptions` | `core/system-prompts/types.ts` | 构建器选项 |

### 5.6 迁移到 `src/types/api.ts`

| 类型 | 当前位置 | 说明 |
|------|----------|------|
| `SendMessageRequest` | 分散在各 api/ 文件 | 发送消息请求 |
| `SendMessageResponse` | 分散在各 api/ 文件 | 发送消息响应 |
| `SessionApiResponse` | 分散在各 api/ 文件 | 会话 API 响应 |
| `MediaUploadResponse` | `api/media-routes.ts` | 媒体上传响应 |
| `WebhookPayload` | `api/webhook-api.ts` | Webhook 负载 |
| `OpenAICompatMessage` | `api/openai-compat.ts` | OpenAI 兼容消息 |
| `OpenAICompatRequest` | `api/openai-compat.ts` | OpenAI 兼容请求 |
| `OpenAICompatResponse` | `api/openai-compat.ts` | OpenAI 兼容响应 |

---

## 6. 需要协调的问题

### 6.1 内置插件类型冲突

**问题**: `DiscordChannelConfig` 同时在以下位置定义：
- `src/core/config.ts` (主配置)
- `src/plugins/builtin/discord/types.ts` (插件私有)

**建议**: 
- 基础接口保留在 `src/types/config.ts`
- 插件扩展类型保留在 `src/plugins/builtin/discord/types.ts`
- 使用接口继承：`interface DiscordChannelConfig extends DiscordChannelConfigBase`

### 6.2 Admin Console 配置类型

**问题**: `admin-console/src/config/types.ts` 依赖 `src/core/config/schema.ts`

**建议**: 
- Admin Console 保持独立，通过类型导入使用 `src/types/config.ts`
- 或创建共享的 `src/types/config/shared.ts`

### 6.3 第三方插件兼容性

**问题**: 外部插件直接导入 `src/plugins/types.ts` 的绝对路径：
```typescript
import type { GatewayPluginApi } from "/Users/.../.pi/agent/pi-gateway/src/plugins/types.ts";
```

**建议**:
- 阶段1: 保留原文件作为重导出（向后兼容）
- 阶段2: 发布 `@mariozechner/pi-gateway-types` npm 包
- 阶段3: 外部插件迁移到 npm 包

---

## 7. 分阶段迁移计划

### Phase 0: 准备 (等待 DarkViper)

**前置条件**: DarkViper 完成 core/ 重构

**任务**:
- [ ] 同步 DarkViper 的最新 core/ 变更
- [ ] 确认 config.ts 的拆分边界
- [ ] 冻结类型变更（代码审查时拒绝新增类型）

### Phase 1: 基础设施

**目标**: 创建新目录结构，无功能变更

**任务**:
- [ ] 创建 `src/types/` 目录
- [ ] 创建 `src/types/index.ts` 空出口
- [ ] 添加 `tsconfig.json` paths 映射（可选）
- [ ] 验证 `bun tsc --noEmit` 通过

**耗时**: ~30分钟
**风险**: 低

### Phase 2: 核心类型迁移

**目标**: 迁移 `core.ts`, `config.ts`

**顺序**:
1. `src/types/config.ts` - 从 `core/config.ts` 提取
2. `src/types/core.ts` - 从 `core/types.ts` 提取
3. 更新 `core/config.ts` 重新导出（向后兼容）
4. 更新 `core/types.ts` 重新导出（向后兼容）

**验证**:
```bash
bun tsc --noEmit
bun test
```

**耗时**: ~2小时
**风险**: 中（影响面广）

### Phase 3: 插件类型迁移

**目标**: 迁移 `plugins.ts`, `system-prompts.ts`

**顺序**:
1. `src/types/system-prompts.ts` - 无依赖
2. `src/types/plugins.ts` - 依赖 core.ts, config.ts
3. 更新原文件重新导出

**验证**:
- 所有插件加载正常
- 内置插件 (telegram/discord/feishu) 无报错

**耗时**: ~2小时
**风险**: 中

### Phase 4: Gateway 类型迁移

**目标**: 迁移 `gateway.ts`, `api.ts`

**顺序**:
1. `src/types/gateway.ts` - 依赖 core.ts, config.ts, plugins.ts
2. `src/types/api.ts` - 整合分散的 API 类型
3. 更新原文件重新导出

**验证**:
- WebSocket 连接正常
- HTTP API 响应正确
- CLI 命令正常

**耗时**: ~2小时
**风险**: 中

### Phase 5: 迁移引用

**目标**: 更新所有导入语句

**批量替换**:
```bash
# 从
from "./core/types.ts"
from "../core/types.ts"
from "../../core/types.ts"

# 到
from "../../types/index.ts"  # 或简化 from "../../types"
```

**文件清单**:
- `src/server.ts`
- `src/cli.ts`
- `src/gateway/*.ts` (8个文件)
- `src/api/*.ts` (10个文件)
- `src/ws/*.ts` (3个文件)
- `src/tools/*.ts` (4个文件)
- `src/core/*.ts` (排除 types.ts, config.ts)
- `src/plugins/*.ts` (排除 types.ts)

**耗时**: ~3小时
**风险**: 高（易出错）

### Phase 6: 清理与文档

**目标**: 移除旧文件，完善文档

**任务**:
- [ ] 移除原 `src/core/types.ts` 中的类型定义，保留重新导出
- [ ] 移除原 `src/plugins/types.ts` 中的类型定义，保留重新导出
- [ ] 为所有公开类型添加 JSDoc
- [ ] 更新开发者文档

**耗时**: ~2小时
**风险**: 低

### Phase 7: 验证与发布

**目标**: 确保零回归

**验证清单**:
- [ ] `bun tsc --noEmit` 零错误
- [ ] `bun test` 全通过
- [ ] 启动网关无警告
- [ ] Telegram 消息收发正常
- [ ] Discord 消息收发正常
- [ ] 插件加载正常
- [ ] WebSocket 连接正常

**耗时**: ~1小时
**风险**: 取决于测试覆盖率

---

## 8. 时间线估算

| 阶段 | 耗时 | 依赖 |
|------|------|------|
| Phase 0 | - | DarkViper core/ 重构 |
| Phase 1 | 30min | Phase 0 |
| Phase 2 | 2h | Phase 1 |
| Phase 3 | 2h | Phase 2 |
| Phase 4 | 2h | Phase 3 |
| Phase 5 | 3h | Phase 4 |
| Phase 6 | 2h | Phase 5 |
| Phase 7 | 1h | Phase 6 |
| **总计** | **~13小时** | - |

---

## 9. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| DarkViper 重构冲突 | 高 | 高 | 等待 Phase 0 完成 |
| 循环依赖 | 中 | 高 | 严格遵循分层规则 |
| 第三方插件崩溃 | 中 | 中 | 保留重导出，渐进迁移 |
| 类型丢失/错误 | 低 | 高 | 每阶段运行 tsc + test |
| 合并冲突 | 中 | 中 | 小批量 PR，快速合并 |

---

## 10. 验收标准

- [ ] 所有类型集中到 `src/types/`
- [ ] 零 TypeScript 错误 (`bun tsc --noEmit`)
- [ ] 所有测试通过 (`bun test`)
- [ ] 公开 API 有完整 JSDoc 文档
- [ ] 无循环依赖 (使用 `madge --circular` 验证)
- [ ] 向后兼容 (第三方插件无需修改)
- [ ] 性能无退化 (启动时间 ±5%)

---

## 11. 附录

### A. 建议的 `src/types/index.ts` 结构

```typescript
/**
 * pi-gateway 类型统一出口
 * 
 * @module @pi-gateway/types
 */

// 核心类型
export * from "./core";

// 配置类型
export * from "./config";

// 插件类型
export * from "./plugins";

// Gateway 类型
export * from "./gateway";

// API 类型
export * from "./api";

// 系统提示类型
export * from "./system-prompts";
```

### B. 建议的 JSDoc 模板

```typescript
/**
 * RPC 命令 - 提示词
 * 
 * 发送提示词消息到代理。
 * 
 * @example
 * ```typescript
 * const cmd: RpcCommand = {
 *   type: "prompt",
 *   message: "Hello",
 *   streamingBehavior: "steer"
 * };
 * ```
 */
export type RpcPromptCommand = {
  id?: string;
  type: "prompt";
  message: string;
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";
};
```

---

*文档版本: 1.0*  
*最后更新: 2026-02-22*  
*等待 DarkViper 确认后开始 Phase 1*
