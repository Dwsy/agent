# pi-gateway Core 模块重构方案

> *"Software architecture is not about making decisions, it's about delaying decisions."* — Uncle Bob

## 当前状况分析

### 统计数据
- **总文件数**: 83 (包括测试文件)
- **核心文件**: ~35 个非测试 `.ts` 文件
- **测试文件**: ~30 个 `.test.ts` 文件
- **目录数**: 4 个 (system-prompts/, system-prompts/segments/, system-prompts/plugins/)

### 核心文件清单

| 类别 | 文件 |
|------|------|
| **配置** | config.ts, config-schema.ts, config-validator.ts |
| **会话** | session-store.ts, session-router.ts |
| **RPC** | rpc-pool.ts, rpc-client.ts, rpc-events.ts |
| **定时任务** | cron.ts, cron-api.ts, cron-announcer.ts, heartbeat-executor.ts |
| **安全** | auth.ts, exec-guard.ts, ssrf-guard.ts, media-security.ts, media-token.ts |
| **系统提示词** | system-prompts.ts + system-prompts/ 目录 |
| **扩展/UI** | extension-ui-forwarder.ts, extension-ui-types.ts |
| **基础设施** | utils.ts, logger-file.ts, transcript-logger.ts, static-server.ts, daemon.ts, dedup-cache.ts |
| **事件/消息** | system-events.ts, message-queue.ts, channel-resolver.ts |
| **指标/可观测性** | metrics.ts, model-health.ts, gateway-observability.ts, delegate-metrics.ts, pool-waiting-list.ts |
| **能力配置** | capability-profile.ts, memory-access.ts |

### 当前问题

1. **顶层文件过多**: 35 个文件散落在 core/ 根目录
2. **职责边界模糊**: 工具函数、业务逻辑、外部交互混杂
3. **导入依赖复杂**: 循环依赖风险高
4. **测试文件混杂**: 测试文件与源码混在一起

---

## Clean Architecture 分层设计

```
core/
├── domain/           # 领域层 - 纯业务逻辑，不依赖外部
│   ├── entities/     # 实体定义
│   ├── value-objects/# 值对象
│   └── repositories/ # 仓库接口
├── application/      # 应用层 - 用例编排
│   ├── ports/        # 端口（接口定义）
│   ├── services/     # 应用服务
│   └── use-cases/    # 具体用例
├── infrastructure/   # 基础设施层 - 外部交互
│   ├── persistence/  # 持久化实现
│   ├── security/     # 安全相关
│   ├── messaging/    # 消息/通信
│   └── platform/     # 平台相关
└── interface/        # 接口层 - 对外暴露
    ├── http/         # HTTP/WebSocket
    ├── cli/          # 命令行
    └── plugins/      # 插件接口
```

---

## 具体重构方案

### 第一阶段：目录结构创建

```
core/
├── domain/                           # 纯业务逻辑，无外部依赖
│   ├── config/                       # 配置领域
│   │   ├── entities.ts               # Config, GatewayConfig, etc.
│   │   ├── schema.ts                 # config-schema.ts 迁移
│   │   └── validator.ts              # config-validator.ts 迁移
│   ├── session/                      # 会话领域
│   │   ├── entities.ts               # SessionState, SessionKey, etc.
│   │   └── repository.ts             # SessionStore 接口
│   ├── types.ts                      # 基础类型定义（原 types.ts 核心部分）
│   └── capabilities.ts               # capability-profile.ts 迁移
│
├── application/                      # 用例编排
│   ├── ports/                        # 端口定义（接口）
│   │   ├── inbound/                  # 输入端口
│   │   │   ├── message-handler.ts
│   │   │   └── cron-handler.ts
│   │   └── outbound/                 # 输出端口
│   │       ├── session-store.ts
│   │       ├── message-sender.ts
│   │       └── logger.ts
│   ├── services/                     # 应用服务
│   │   ├── session-router.ts         # 原 session-router.ts
│   │   ├── message-dispatcher.ts     # 消息分发逻辑
│   │   └── cron-scheduler.ts         # cron 调度逻辑
│   └── use-cases/                    # 具体用例
│       ├── handle-inbound-message.ts
│       ├── execute-cron-job.ts
│       └── delegate-to-agent.ts
│
├── infrastructure/                   # 外部交互实现
│   ├── persistence/                  # 持久化
│   │   ├── session-store.ts          # 原 session-store.ts 实现
│   │   ├── config-store.ts           # 配置存储
│   │   └── cron-job-store.ts         # cron 任务存储
│   ├── security/                     # 安全
│   │   ├── auth.ts                   # 原 auth.ts
│   │   ├── exec-guard.ts             # 原 exec-guard.ts
│   │   ├── ssrf-guard.ts             # 原 ssrf-guard.ts
│   │   ├── media-security.ts         # 原 media-security.ts
│   │   └── media-token.ts            # 原 media-token.ts
│   ├── rpc/                          # RPC 通信
│   │   ├── pool.ts                   # 原 rpc-pool.ts
│   │   ├── client.ts                 # 原 rpc-client.ts
│   │   └── events.ts                 # 原 rpc-events.ts
│   ├── messaging/                    # 消息系统
│   │   ├── queue.ts                  # 原 message-queue.ts
│   │   ├── channel-resolver.ts       # 原 channel-resolver.ts
│   │   └── system-events.ts          # 原 system-events.ts
│   ├── platform/                     # 平台服务
│   │   ├── file-logger.ts            # 原 logger-file.ts, transcript-logger.ts
│   │   ├── static-server.ts          # 原 static-server.ts
│   │   └── daemon.ts                 # 原 daemon.ts
│   └── utils/                        # 工具函数
│       └── index.ts                  # 原 utils.ts
│
├── interface/                        # 接口层
│   ├── http/                         # HTTP 接口
│   │   ├── middleware/
│   │   │   └── auth.ts               # HTTP 认证中间件
│   │   └── routes/
│   ├── websocket/                    # WebSocket 接口
│   ├── extension-ui/                 # 扩展 UI
│   │   ├── forwarder.ts              # 原 extension-ui-forwarder.ts
│   │   └── types.ts                  # 原 extension-ui-types.ts
│   └── plugins/                      # 插件接口
│       └── system-prompts/           # 原 system-prompts/ 迁移
│
└── tests/                            # 测试文件统一存放
    ├── unit/
    ├── integration/
    └── __fixtures__/
```

### 第二阶段：文件迁移映射

| 原文件 | 新位置 | 说明 |
|--------|--------|------|
| `types.ts` | `domain/types.ts` + `application/ports/*.ts` | 拆分为领域类型和端口 |
| `config.ts` | `domain/config/entities.ts` + `infrastructure/persistence/config-store.ts` | 配置实体与存储分离 |
| `config-schema.ts` | `domain/config/schema.ts` | 配置模式定义 |
| `config-validator.ts` | `domain/config/validator.ts` | 配置验证逻辑 |
| `session-store.ts` | `infrastructure/persistence/session-store.ts` | 实现仓库模式 |
| `session-router.ts` | `application/services/session-router.ts` | 应用服务层 |
| `rpc-pool.ts` | `infrastructure/rpc/pool.ts` | RPC 基础设施 |
| `rpc-client.ts` | `infrastructure/rpc/client.ts` | RPC 基础设施 |
| `rpc-events.ts` | `infrastructure/rpc/events.ts` | RPC 基础设施 |
| `cron.ts` | `infrastructure/persistence/cron-job-store.ts` + `application/services/cron-scheduler.ts` | 拆分存储与调度 |
| `cron-api.ts` | `application/use-cases/cron-api.ts` | 用例层 |
| `cron-announcer.ts` | `application/services/cron-announcer.ts` | 应用服务 |
| `heartbeat-executor.ts` | `application/services/heartbeat-executor.ts` | 应用服务 |
| `auth.ts` | `infrastructure/security/auth.ts` | 安全层 |
| `exec-guard.ts` | `infrastructure/security/exec-guard.ts` | 安全层 |
| `ssrf-guard.ts` | `infrastructure/security/ssrf-guard.ts` | 安全层 |
| `media-security.ts` | `infrastructure/security/media-security.ts` | 安全层 |
| `media-token.ts` | `infrastructure/security/media-token.ts` | 安全层 |
| `system-prompts/` | `interface/plugins/system-prompts/` | 插件接口层 |
| `extension-ui-forwarder.ts` | `interface/extension-ui/forwarder.ts` | 接口层 |
| `extension-ui-types.ts` | `interface/extension-ui/types.ts` | 接口层 |
| `utils.ts` | `infrastructure/utils/index.ts` | 工具函数 |
| `logger-file.ts` | `infrastructure/platform/file-logger.ts` | 平台层 |
| `transcript-logger.ts` | `infrastructure/platform/file-logger.ts` | 合并到文件日志 |
| `static-server.ts` | `infrastructure/platform/static-server.ts` | 平台层 |
| `daemon.ts` | `infrastructure/platform/daemon.ts` | 平台层 |
| `message-queue.ts` | `infrastructure/messaging/queue.ts` | 消息层 |
| `system-events.ts` | `infrastructure/messaging/system-events.ts` | 消息层 |
| `channel-resolver.ts` | `infrastructure/messaging/channel-resolver.ts` | 消息层 |
| `metrics.ts` | `infrastructure/platform/metrics.ts` | 平台层 |
| `model-health.ts` | `infrastructure/platform/model-health.ts` | 平台层 |
| `gateway-observability.ts` | `infrastructure/platform/gateway-observability.ts` | 平台层 |
| `capability-profile.ts` | `domain/capabilities.ts` | 领域层 |
| `memory-access.ts` | `infrastructure/persistence/memory-access.ts` | 持久化层 |
| `dedup-cache.ts` | `infrastructure/persistence/dedup-cache.ts` | 持久化层 |
| `delegate-executor.ts` | `application/services/delegate-executor.ts` | 应用服务 |
| `delegate-metrics.ts` | `infrastructure/platform/delegate-metrics.ts` | 平台层 |
| `pool-waiting-list.ts` | `infrastructure/rpc/pool-waiting-list.ts` | RPC 层 |

---

## 依赖规则

```
interface/         # 可以依赖所有层
    ↓
application/       # 只能依赖 domain
    ↓
domain/            # 不依赖任何层（纯业务逻辑）
    ↑
infrastructure/    # 只能依赖 domain（实现 domain 的接口）
```

**禁止**:
- ❌ domain 依赖任何其他层
- ❌ application 依赖 infrastructure
- ❌ 循环依赖

**允许**:
- ✅ interface → application, domain, infrastructure
- ✅ application → domain
- ✅ infrastructure → domain

---

## 重构步骤

### Step 1: 创建新目录结构
```bash
cd pi-gateway/src/core
mkdir -p domain/{config,session} application/{ports/{inbound,outbound},services,use-cases} \
  infrastructure/{persistence,security,rpc,messaging,platform,utils} \
  interface/{http/{middleware,routes},websocket,extension-ui,plugins/system-prompts} \
  tests/{unit,integration}
```

### Step 2: 迁移类型定义（Domain 层）
1. 提取纯类型定义到 `domain/types.ts`
2. 创建仓库接口 `domain/session/repository.ts`
3. 迁移配置实体到 `domain/config/entities.ts`

### Step 3: 定义端口（Application 层）
1. 定义输入端口 `application/ports/inbound/*.ts`
2. 定义输出端口 `application/ports/outbound/*.ts`
3. 将原 `types.ts` 中的 Logger 等接口迁移到端口层

### Step 4: 实现基础设施层
1. 移动安全相关文件到 `infrastructure/security/`
2. 移动 RPC 相关文件到 `infrastructure/rpc/`
3. 移动持久化相关文件到 `infrastructure/persistence/`
4. 确保基础设施实现 domain 定义的接口

### Step 5: 重构应用服务
1. 将 `session-router.ts` 重构为应用服务
2. 通过依赖注入使用端口接口
3. 不直接依赖基础设施实现

### Step 6: 迁移系统提示词模块
1. 移动 `system-prompts/` 到 `interface/plugins/system-prompts/`
2. 更新所有导入路径

### Step 7: 更新入口文件
1. 创建 `core/index.ts` 统一导出
2. 更新 `gateway/` 下的引用

### Step 8: 迁移测试文件
1. 将所有 `.test.ts` 移动到 `tests/`
2. 按单元测试和集成测试分类
3. 更新导入路径

---

## 验收检查清单

- [ ] core/ 顶层文件 < 20 个（仅保留 index.ts 和必要的入口文件）
- [ ] 所有文件按 Clean Architecture 分层存放
- [ ] 无循环依赖（使用 `madge` 等工具检测）
- [ ] domain 层不依赖任何其他层
- [ ] application 层仅依赖 domain 层
- [ ] infrastructure 层实现 domain 定义的接口
- [ ] 所有测试文件移动到 tests/ 目录
- [ ] 所有测试通过
- [ ] 网关正常启动并运行

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 循环依赖破坏 | 使用 `madge --circular` 检测，逐步迁移 |
| 运行时错误 | 每迁移一个模块后运行测试 |
| 导入路径失效 | 使用 IDE 全局替换 + 编译检查 |
| 测试失效 | 先迁移测试依赖的核心模块 |

---

## 时间估算

| 阶段 | 预估时间 |
|------|----------|
| 目录结构创建 | 30 分钟 |
| Domain 层迁移 | 2 小时 |
| Application 层迁移 | 2 小时 |
| Infrastructure 层迁移 | 3 小时 |
| Interface 层迁移 | 1 小时 |
| 测试迁移与修复 | 2 小时 |
| 验证与修复 | 2 小时 |
| **总计** | **~12.5 小时** |

---

*方案制定：DarkViper*  
*时间：2026-02-22*  
*版本：v1.0*
