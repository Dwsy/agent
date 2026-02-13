# SERVER-REFACTOR-SPEC: server.ts 模块化拆分方案

> TL;DR: 2985 行的 server.ts 拆分为 ~8 个模块，Gateway 类从 God Object 变为 thin orchestrator。目标：每个文件 < 400 行，职责单一，可独立测试。

## 1. 现状分析

### 1.1 行数分布

| 逻辑块 | 行数 | 占比 | 耦合度 | 拆分优先级 |
|---|---|---|---|---|
| HTTP route handler (`handleHttp`) | ~260 | 9% | 低 | P0 |
| API handlers (chat/session/model/usage) | ~500 | 17% | 低 | P0 |
| OpenAI compat API | ~200 | 7% | 低 | P0 |
| WebSocket frame handler (`handleWsFrame`) | ~310 | 10% | 中 | P1 |
| Plugin API factory (`createPluginApi`) | ~300 | 10% | 高 | P1 |
| processMessage (core agent turn) | ~340 | 11% | 高 | P2 |
| Message dispatch pipeline | ~180 | 6% | 高 | P2 |
| Slash command handling | ~120 | 4% | 中 | P1 |
| Tool resolution + execution | ~100 | 3% | 中 | P1 |
| Lifecycle (start/stop) | ~110 | 4% | 高 | P3 |
| Webhook handlers | ~100 | 3% | 低 | P0 |
| Session migration + helpers | ~160 | 5% | 低 | P1 |
| Imports + class definition + constructor | ~200 | 7% | — | 保留 |
| Built-in commands + role mgmt | ~90 | 3% | 低 | P1 |
| Metrics data source | ~25 | 1% | 低 | P1 |

### 1.2 核心问题

1. **God Object**: Gateway 类承担路由、API、WS、插件、消息处理、角色管理等所有职责
2. **handleHttp 是 if-else 链**: 30+ 个路径判断，每加一个 API 就膨胀
3. **handleWsFrame 是 switch 巨人**: 25+ 个 case，同样的膨胀问题
4. **processMessage 340 行**: RPC 事件处理、流式响应收集、hook 调度、超时保护全混在一起
5. **createPluginApi 300 行**: 每个 API 方法都是闭包，无法独立测试

### 1.3 已完成的拆分（MintHawk + NiceViper）

- `src/api/media-routes.ts` — media 文件服务 + WebChat media 指令处理
- `src/api/media-send.ts` — media 发送 API

## 2. 目标文件结构

```
src/
├── server.ts              (~400 行) Gateway 类：构造、生命周期、thin dispatch
├── api/
│   ├── http-router.ts     (~300 行) HTTP 路由注册 + handleHttp
│   ├── chat-api.ts        (~250 行) /api/chat, /api/chat/stream
│   ├── session-api.ts     (~150 行) /api/session/*, /api/sessions/*
│   ├── openai-compat.ts   (~200 行) /v1/chat/completions
│   ├── webhook-api.ts     (~100 行) /hooks/wake, /hooks/event
│   ├── media-routes.ts    (已有)    /api/media/* GET
│   └── media-send.ts      (已有)    /api/media/send POST
├── ws/
│   ├── ws-router.ts       (~200 行) WS frame dispatch + method registry
│   └── ws-methods.ts      (~200 行) 内置 WS methods (chat.*, sessions.*, cron.*, etc.)
├── gateway/
│   ├── message-pipeline.ts (~300 行) dispatch → mode resolution → enqueue → processMessage
│   ├── command-handler.ts  (~150 行) slash command parsing + registered command dispatch
│   ├── tool-executor.ts    (~120 行) tool resolution + execution + delegate interception
│   └── plugin-api.ts       (~300 行) createPluginApi factory
├── core/
│   ├── ... (existing, unchanged)
│   ├── auth.ts             (~30 行)  safeTokenCompare + auth middleware
│   ├── role-manager.ts     (~80 行)  listAvailableRoles + setSessionRole
│   └── static-server.ts    (~50 行)  serveStaticFile + WEB_ASSETS
└── ...
```

### 2.1 server.ts 瘦身后的职责

```typescript
export class Gateway {
  // 字段声明（不变）
  // constructor（不变，但部分初始化委托给子模块）
  
  // Lifecycle
  async start(): Promise<void>   // 编排：pool → plugins → channels → cron → heartbeat → server
  async stop(): Promise<void>    // 编排：hooks → channels → services → server → pool
  
  // Thin dispatch（委托给子模块）
  async dispatch(msg: InboundMessage): Promise<void>  // → message-pipeline.ts
  
  // 内部访问器（供子模块使用）
  get rpcPool(): RpcPool
  get sessionStore(): SessionStore
  get pluginRegistry(): PluginRegistryState
  get queueManager(): MessageQueueManager
  // ...
}
```

## 3. 拆分顺序与依赖关系

```
Phase 1 (P0): 低耦合，纯提取
  ├── auth.ts              ← 0 依赖，纯函数
  ├── static-server.ts     ← 0 依赖，纯函数
  ├── webhook-api.ts       ← 依赖 queue, hooks, config
  └── openai-compat.ts     ← 依赖 pool, sessions

Phase 2 (P1): 中耦合，需要 Gateway 引用
  ├── http-router.ts       ← 路由注册，依赖所有 API 模块
  ├── session-api.ts       ← 依赖 pool, sessions, transcripts
  ├── chat-api.ts          ← 依赖 pool, sessions, dispatch
  ├── ws-router.ts         ← WS frame dispatch
  ├── ws-methods.ts        ← 依赖 pool, sessions, cron, extensionUI
  ├── command-handler.ts   ← 依赖 registry.commands, pool
  ├── tool-executor.ts     ← 依赖 registry.tools, delegateExecutor, hooks
  └── role-manager.ts      ← 依赖 config, sessions, pool

Phase 3 (P2): 高耦合，核心逻辑
  ├── message-pipeline.ts  ← 依赖 pool, queue, sessions, hooks, transcripts, metrics
  └── plugin-api.ts        ← 依赖几乎所有模块（最后拆）

Phase 4 (P3): 收尾
  └── server.ts 瘦身       ← 删除已迁移代码，保留编排逻辑
```

### 3.1 依赖注入策略

避免循环依赖，使用 **Context 对象** 模式：

```typescript
// src/gateway/types.ts
export interface GatewayContext {
  config: Config;
  pool: RpcPool;
  sessions: SessionStore;
  queue: MessageQueueManager;
  registry: PluginRegistryState;
  transcripts: TranscriptLogger;
  metrics: MetricsCollector;
  extensionUI: ExtensionUIForwarder;
  systemEvents: SystemEventsQueue;
  cron: CronEngine | null;
  heartbeat: HeartbeatExecutor | null;
  delegateExecutor: DelegateExecutor | null;
  log: Logger;
  wsClients: Map<string, ServerWebSocket<any>>;
  broadcastToWs: (event: string, payload: unknown) => void;
}
```

Gateway 构造后创建 context，传给所有子模块：

```typescript
// server.ts
class Gateway {
  private ctx: GatewayContext;
  
  constructor(options) {
    // ... init fields ...
    this.ctx = { config, pool, sessions, queue, ... };
  }
  
  async start() {
    // 传 ctx 给路由注册
    registerHttpRoutes(this.ctx);
    registerWsMethods(this.ctx);
    // ...
  }
}
```

## 4. 各模块详细设计

### 4.1 `src/api/http-router.ts` — HTTP 路由

替换 `handleHttp` 的 if-else 链为声明式路由表：

```typescript
type RouteHandler = (req: Request, url: URL, ctx: GatewayContext) => Promise<Response> | Response;

interface Route {
  method: string;
  path: string;          // exact match
  prefix?: string;       // startsWith match
  handler: RouteHandler;
}

export function createHttpRouter(ctx: GatewayContext): (req: Request, url: URL) => Promise<Response> {
  const routes: Route[] = [
    { method: "GET",  path: "/health",           handler: handleHealth },
    { method: "GET",  path: "/api/health",       handler: handleHealth },
    { method: "GET",  path: "/api/metrics",      handler: handleMetrics },
    { method: "POST", path: "/api/send",         handler: handleApiSend },
    { method: "POST", path: "/api/chat",         handler: handleApiChat },
    { method: "POST", path: "/api/chat/stream",  handler: handleApiChatStream },
    // ... 声明式注册，不再 if-else
  ];
  
  return async (req, url) => {
    // Plugin routes first
    for (const route of ctx.registry.httpRoutes) { ... }
    // Built-in routes
    const matched = routes.find(r => matchRoute(r, req.method, url.pathname));
    if (matched) return matched.handler(req, url, ctx);
    // Static files
    return serveStaticFile(url.pathname, ctx);
  };
}
```

### 4.2 `src/ws/ws-router.ts` — WS 方法路由

替换 `handleWsFrame` 的 switch 为方法注册表：

```typescript
type WsMethodFn = (params: Record<string, unknown>, ctx: GatewayContext, ws: ServerWebSocket<any>) => Promise<unknown>;

export function createWsRouter(ctx: GatewayContext): Map<string, WsMethodFn> {
  const methods = new Map<string, WsMethodFn>();
  
  // 注册内置方法
  registerChatMethods(methods, ctx);      // chat.send, chat.abort, chat.history
  registerSessionMethods(methods, ctx);   // sessions.list, sessions.get, sessions.delete, ...
  registerCronMethods(methods, ctx);      // cron.list, cron.add, cron.remove, ...
  registerToolMethods(methods, ctx);      // tools.list, tools.call
  registerConfigMethods(methods, ctx);    // config.get, config.reload
  registerMemoryMethods(methods, ctx);    // memory.search, memory.stats, memory.roles
  
  return methods;
}
```

### 4.3 `src/gateway/message-pipeline.ts` — 消息处理管线

从 Gateway 类提取 `dispatch` → `processMessage` 完整链路：

```typescript
export class MessagePipeline {
  constructor(private ctx: GatewayContext) {}
  
  async dispatch(msg: InboundMessage): Promise<void> { ... }
  
  private async handleInterruptMode(...): Promise<void> { ... }
  private async handleInjectionMode(...): Promise<boolean> { ... }
  private async enqueueMessage(...): Promise<void> { ... }
  async processMessage(msg: InboundMessage, queueItem?: PrioritizedWork): Promise<void> { ... }
}
```

`processMessage` 内部的 RPC 事件处理（~150 行 switch/case）可进一步提取为 `RpcEventCollector` 类。

### 4.4 `src/gateway/plugin-api.ts` — 插件 API 工厂

最后拆分。将 `createPluginApi` 的每个方法实现委托给对应模块：

```typescript
export function createPluginApi(
  pluginId: string,
  manifest: PluginManifest,
  ctx: GatewayContext,
): GatewayPluginApi {
  return {
    // 委托给各模块
    dispatch: (msg) => ctx.pipeline.dispatch(msg),
    resetSession: (key) => ctx.sessionManager.reset(key),
    compactSession: (key, inst) => ctx.sessionManager.compact(key, inst),
    // ...
  };
}
```

## 5. 风险评估

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 循环依赖 | 编译失败 | GatewayContext 单向依赖，子模块不 import server.ts |
| 测试回归 | 功能破坏 | 每个 phase 完成后跑全量 305 测试 |
| 多人冲突 | merge 地狱 | 按 phase 串行，每个 phase 一个 PR，reserve 锁 |
| 性能退化 | 额外函数调用开销 | 可忽略（V8 内联优化） |
| 接口变更 | 插件兼容性 | GatewayPluginApi 接口不变，只改内部实现 |

## 6. 验收标准

- [ ] server.ts < 500 行
- [ ] 每个新模块 < 400 行
- [ ] 305/305 测试通过（0 回归）
- [ ] 无循环依赖（`madge --circular` 检查）
- [ ] GatewayPluginApi 接口签名不变
- [ ] 现有插件（Telegram/Discord/WebChat）无需修改

## 7. 时间估算

| Phase | 工作量 | 风险 | 建议 Owner |
|---|---|---|---|
| P0: 低耦合提取 | 2-3h | 低 | 任意 |
| P1: 路由 + WS + 命令 | 4-6h | 中 | 熟悉 HTTP/WS 的人 |
| P2: 消息管线 + 插件 API | 4-6h | 高 | 熟悉 RPC/dispatch 的人 |
| P3: 收尾 + 清理 | 1-2h | 低 | 任意 |

总计 ~11-17h，建议 2-3 人并行，按 phase 串行推进。

---

*Generated by GoldJaguar (DarkUnion) for pi-gateway v3.3*
