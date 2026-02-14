# Cron & Config Reference

> TL;DR: Cron 引擎支持三种调度模式（cron/every/at）和两种执行模式（isolated/main），通过 HTTP/WS/Slash 三层 API 管理。Config 体系采用 JSON5 + deep merge + 热重载，12 个顶层 section 覆盖网关全部行为。

---

## 1. Cron 引擎架构

### 1.1 核心文件

| 文件 | 职责 |
|------|------|
| `src/core/cron.ts` | CronEngine 类 — 调度、触发、并发防护、错误退避、持久化 |
| `src/core/cron-announcer.ts` | 结果投递：统一通过 channel outbound.sendText 直接发送 |
| `src/plugins/builtin/cron/index.ts` | Cron plugin — CronEngine 唯一 owner，导出 `getCronEngine()` |
| `src/core/cron-api.ts` | HTTP API 路由处理（REST CRUD） |
| `src/plugins/builtin/telegram/commands.ts` | `/cron` Telegram 命令 |

### 1.2 Schedule 类型

```typescript
type CronSchedule =
  | { kind: "cron"; expr: string; timezone?: string }  // "0 9 * * *"
  | { kind: "every"; expr: string }                     // "30m", "1h", "5s", "2d"
  | { kind: "at"; expr: string };                       // ISO 8601 一次性
```

| Kind | 引擎 | 行为 | 示例 |
|------|------|------|------|
| `cron` | croner 库 | 标准 cron 表达式，支持 timezone | `"0 */6 * * *"` |
| `every` | `setInterval` | 固定间隔，支持 s/m/h/d 单位 | `"30m"` |
| `at` | `setTimeout` | 一次性触发，过期立即执行；成功后 `removeJob`，失败后 `disableJob` | `"2026-02-12T14:00:00+08:00"` |

### 1.3 执行模式

```
triggerJob(job)
├── running.has(job.id)? → skip (并发防护)
├── backoff window active? → skip (错误退避)
├── running.add(job.id)
│
├── mode === "main"
│   → systemEvents.inject(mainSessionKey, eventText)
│   → heartbeatWake(agentId, reason)
│   → recordRun("pending")
│   → running.delete(job.id)
│
└── mode === "isolated" (default)
    → await dispatcher.dispatch(...)
    → Promise.race([dispatch, timeout])
    → announcer.deliver() if delivery !== "silent"
    → notifyOriginSession() + heartbeatWake()
    → success: clear error counters; at/deleteAfterRun → removeJob
    → failure: increment error counters; at → disableJob
    → finally: running.delete(job.id)
```

**isolated 模式：** 每个 job 独立 session（`cron:{jobId}`），通过 RPC pool 获取进程执行。`triggerIsolatedMode` 是 async 方法，await 完成后才处理 deleteAfterRun/one-shot 清理，消除竞态。

**main 模式（deprecated）：** 不直接执行，而是注入 SystemEventsQueue，由心跳消费。降级策略：`systemEvents` 不可用时 fallback 到 isolated。

### 1.4 结果投递（对齐 OpenClaw）

```
isolated job 完成
├── delivery !== "silent" && 有实质内容?
│   → announcer.deliver() → channel outbound.sendText → 直接发到 Telegram/Discord
│   （不经过主 Agent 转述，不注入 main session）
│
├── notifyOriginSession()
│   → systemEvents.inject(mainSession, "[CRON_DONE:jobId] ...")
│   → heartbeatWake(agentId) — 唤醒心跳让主 Agent 感知任务完成
│
└── recordRun() → runs/{jobId}.jsonl
```

| delivery 模式 | 行为 | OpenClaw 对应 |
|---|---|---|
| `announce` | 直接通过 channel outbound 发给用户 | `delivery.mode = "announce"` |
| `direct` | 同 announce（统一走 outbound.sendText） | — |
| `silent` | 不投递，仅记录 | `delivery.mode = "none"` |

**与 OpenClaw 的架构差异：** OpenClaw 使用 embedded agent（直接 import SDK），我们使用 RPC pool（spawn pi CLI 进程）。差异仅在执行路径（`dispatcher.dispatch` → RPC），投递机制完全一致：拿到结果后直接调 channel outbound，不经过 agent。

### 1.6 运行时防护

**并发防护：** `running: Set<string>` 跟踪正在执行的 job ID。`triggerJob` 入口检查，防止慢任务被重复触发。

**错误退避：** `consecutiveErrors` + `lastErrorAt` 配合退避表 `[30s, 60s, 5m, 15m, 1h]`。成功时清零，失败时递增。退避窗口内的触发被静默跳过。

**错过恢复：** `start()` 末尾调用 `runMissedJobs()`：
- `at` 任务：目标时间已过且无运行记录 → 立即触发
- `every` 任务：最后运行距今超过 2 倍间隔 → 触发一次补执行

### 1.7 Job 生命周期

```
addJob → saveJobs(jobs.json) → scheduleJob(croner/setTimeout/setInterval)
                                        ↓
                                   triggerJob → recordRun(runs/{jobId}.jsonl)
                                        ↓
                              success + (at | deleteAfterRun) → removeJob
                              failure + at → disableJob (保留供检查)
```

**持久化：**
- 任务定义：`{dataDir}/cron/jobs.json`（JSON 数组）
- 执行记录：`{dataDir}/cron/runs/{jobId}.jsonl`（每行一条 JSON）

**状态字段：**
- `enabled: false` — 禁用（不调度，不执行）
- `paused: true` — 暂停（停止 croner，保留定义，可恢复）
- `deleteAfterRun: true` — 执行后自删（适用于非 `at` 类型的一次性任务）

### 1.8 所有权模型

CronEngine 由 `plugins/builtin/cron/index.ts` 独占创建和销毁（plugin service lifecycle）。`server.ts` 不再直接实例化 CronEngine，通过 `getCronEngine()` accessor 获取引用。

```typescript
// plugins/builtin/cron/index.ts
export function getCronEngine(): CronEngine | null;
export function markCronSelfDelivered(sessionKey: string): void;
```

### 1.9 构造函数依赖

```typescript
constructor(
  dataDir: string,           // 数据目录（jobs.json + runs/）
  dispatcher: CronDispatcher, // isolated 模式的消息分发
  config?: Config,            // 全局配置（agents.default、delegation.timeoutMs）
  announcer?: CronAnnouncer,  // 结果投递到 channel
  systemEvents?: SystemEventsQueue, // main 模式事件注入
  heartbeatWake?: (agentId: string, reason?: string) => void, // main 模式 + notifyOriginSession 心跳唤醒
)
```

---

## 2. 三层 API 对照表

| 操作 | HTTP | WS Method | Telegram | Discord |
|------|------|-----------|----------|---------|
| 列表 | `GET /api/cron/jobs` | `cron.list` | `/cron list` | `/cron list` |
| 创建 | `POST /api/cron/jobs` | `cron.add` | — | — |
| 删除 | `DELETE /api/cron/jobs/:id` | `cron.remove` | `/cron remove <id>` | `/cron remove <id>` |
| 暂停 | `PATCH /api/cron/jobs/:id` `{action:"pause"}` | `cron.pause` | `/cron pause <id>` | `/cron pause <id>` |
| 恢复 | `PATCH /api/cron/jobs/:id` `{action:"resume"}` | `cron.resume` | `/cron resume <id>` | `/cron resume <id>` |
| 手动触发 | `POST /api/cron/jobs/:id/run` | `cron.run` | `/cron run <id>` | `/cron run <id>` |

**HTTP 创建示例：**
```bash
curl -X POST http://localhost:18789/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "id": "hourly-check",
    "schedule": { "kind": "every", "expr": "1h" },
    "task": "Check system health and report anomalies.",
    "mode": "main"
  }'
```

**校验规则（`cron-api.ts`）：**
- `id`：`/^[a-zA-Z0-9_-]{1,64}$/`，不可重复
- `schedule`：必须包含 `kind` + `expr`
- `task`：非空，最长 2000 字符
- `agentId`：如指定，必须存在于 `config.agents.list`
- `mode`：`"isolated"` 或 `"main"`

---

## 3. Config 体系

### 3.1 加载与热重载

**搜索顺序（`config.ts:resolveConfigPath`）：**
1. `$PI_GATEWAY_CONFIG` 环境变量
2. `./pi-gateway.jsonc`
3. `./pi-gateway.json`
4. `~/.pi/gateway/pi-gateway.jsonc`
5. `~/.pi/gateway/pi-gateway.json`

**热重载（`server.ts`）：** `fs.watch` 监听配置文件，500ms 防抖，变更自动 deep merge 到运行时 config。也可通过 WS `config.reload` 手动触发。

### 3.2 顶层 Section 速查

| Section | Interface | 用途 | 默认值要点 |
|---------|-----------|------|-----------|
| `gateway` | `GatewayConfig` | 端口、绑定地址、认证 | port: 18789, bind: "loopback", auth: off |
| `agent` | `AgentConfig` | pi CLI 路径、模型、pool、工具、prompt | model: 无, pool: min=1/max=4, tools: coding |
| `session` | `SessionConfig` | DM 路由策略、数据目录 | dmScope: "main" |
| `channels` | `ChannelsConfig` | Telegram/Discord/WebChat 配置 | 空 |
| `plugins` | `PluginsConfig` | 插件目录、禁用列表、per-plugin 配置 | dirs: [], disabled: [] |
| `roles` | `RolesConfig` | 角色能力覆盖、工作目录映射 | mergeMode: "append" |
| `hooks` | `HooksConfig` | Webhook 开关和路径 | enabled: false |
| `cron` | `CronConfig` | 定时任务开关和任务列表 | enabled: false, jobs: [] |
| `logging` | `LoggingConfig` | 文件日志、级别、保留天数 | file: false, level: "info", retention: 7d |
| `queue` | `QueueConfig` | 消息队列模式、优先级、去重、背压 | mode: "collect", dedup: on |
| `delegation` | `DelegationConfig` | delegate_to_agent 超时和约束 | timeout: 120s, maxDepth: 1 |
| `heartbeat` | `HeartbeatConfig` | 心跳开关、间隔、活跃时段 | enabled: false, every: "30m" |
| `agents` | `AgentsConfig` | 多 agent 定义和默认 agent | default: "main" |

### 3.3 关键 Interface 详解

#### AgentConfig

```typescript
interface AgentConfig {
  piCliPath?: string;          // pi CLI 路径，默认 "pi"
  model?: string;              // "provider/modelId" 格式
  thinkingLevel?: string;      // off|minimal|low|medium|high|xhigh
  pool: AgentPoolConfig;       // { min, max, idleTimeoutMs }
  tools?: ToolPolicyConfig;    // { profile, allow?, deny? }
  sandbox?: SandboxConfig;     // { mode: "off"|"on", scope }
  systemPrompt?: string;       // 替换默认 system prompt
  appendSystemPrompt?: string; // 追加到 system prompt
  gatewayPrompts?: GatewayPromptsConfig; // 覆盖自动注入的 heartbeat/cron/media prompt
  extensions?: string[];       // 扩展路径列表
  skills?: string[];           // 技能路径列表（legacy）
  skillsBase?: string[];       // 基础技能（layered）
  skillsGateway?: string[];    // 网关级技能（layered）
  promptTemplates?: string[];  // prompt 模板路径
  noExtensions?: boolean;      // 禁用扩展发现
  noSkills?: boolean;          // 禁用技能发现
  noPromptTemplates?: boolean; // 禁用模板发现
  messageMode?: string;        // steer|follow-up|interrupt
  runtime?: AgentRuntimeConfig; // agentDir, packageDir 隔离
}
```

#### HeartbeatConfig

```typescript
interface HeartbeatConfig {
  enabled: boolean;            // 默认 false
  every: string;               // 间隔，如 "30m"
  activeHours?: {              // 活跃时段（外部跳过）
    start: string;             // "08:00"
    end: string;               // "23:00"
    timezone: string;          // "Asia/Shanghai"
  };
  prompt: string;              // 心跳 prompt
  ackMaxChars: number;         // HEARTBEAT_OK 后剩余文本抑制阈值，默认 300
  skipWhenBusy: boolean;       // session 有待处理消息时跳过
  maxRetries: number;          // pool 无空闲进程时重试次数，默认 2
  retryDelayMs: number;        // 重试间隔，默认 5000ms
}
```

#### QueueConfig

```typescript
interface QueueConfig {
  maxPerSession: number;       // 单 session 队列上限，默认 15
  globalMaxPending: number;    // 全局待处理上限，默认 100
  collectDebounceMs: number;   // collect 模式防抖窗口，默认 1500ms
  poolWaitTtlMs: number;       // pool 等待列表 TTL，默认 30000ms
  mode: "collect" | "individual"; // 队列处理模式
  dropPolicy: "summarize" | "old" | "new"; // 溢出策略
  dedup: {                     // 去重配置
    enabled: boolean;          // 默认 true
    cacheSize: number;         // LRU 缓存大小，默认 1000
    ttlMs: number;             // 指纹 TTL，默认 60000ms
  };
  priority: {                  // 消息优先级
    dm: number;                // 默认 10
    group: number;             // 默认 5
    webhook: number;           // 默认 3
    allowlistBonus: number;    // 默认 +2
  };
}
```

#### CronJob

```typescript
interface CronJob {
  id: string;
  schedule: { kind: "cron" | "at" | "every"; expr: string; timezone?: string };
  payload: { text: string };
  enabled?: boolean;           // 默认 true
  paused?: boolean;            // 默认 false
  agentId?: string;            // 默认 config.agents.default
  sessionKey?: string;         // isolated 模式自定义 session key
  mode?: "isolated" | "main";  // 默认 "isolated"
  delivery?: "announce" | "silent"; // 默认 "silent"
  timeoutMs?: number;          // 默认 config.delegation.timeoutMs (120s)
  deleteAfterRun?: boolean;    // 默认 false
}
```

---

## 4. 消息队列

### 4.1 处理模式

**collect 模式（默认）：** 1500ms 防抖窗口内的消息合并为一个 batch，构建 `buildCollectPrompt()` 统一发送。适合 Telegram 等用户快速连发的场景。

**individual 模式：** 每条消息独立处理，严格 FIFO。

### 4.2 优先级与背压

- 消息入队时计算优先级：DM(10) > group(5) > webhook(3)，allowlist 用户 +2
- 全局 pending 达到 `globalMaxPending`(100) 时，跨 session 驱逐最低优先级消息
- 单 session 达到 `maxPerSession`(15) 时，按 `dropPolicy` 处理溢出
- `summarize` 策略：保留最新消息，被丢弃的消息生成摘要行（最多 5 条）

### 4.3 去重

指纹格式：`senderId:channel:hash(text)`。LRU 缓存 1000 条，60s TTL。相同指纹的消息在窗口内被静默丢弃。

### 4.4 Pool 等待列表

当 RPC pool 满时，`acquire()` 不再抛异常，而是进入 `PoolWaitingList`（优先级排序，TTL 30s）。`release()` 时自动 drain 最高优先级的等待项。

---

## 5. 配置示例（生产推荐）

```jsonc
{
  "gateway": { "port": 18789, "bind": "0.0.0.0" },
  "agent": {
    "model": "anthropic/claude-sonnet-4-20250514",
    "pool": { "min": 2, "max": 4 }
  },
  "heartbeat": {
    "enabled": true,
    "every": "30m",
    "activeHours": { "start": "08:00", "end": "23:00", "timezone": "Asia/Shanghai" }
  },
  "cron": {
    "enabled": true,
    "jobs": [
      {
        "id": "daily-report",
        "schedule": { "kind": "cron", "expr": "0 9 * * *", "timezone": "Asia/Shanghai" },
        "payload": { "text": "Generate daily status report." },
        "mode": "isolated",
        "delivery": "announce"
      },
      {
        "id": "health-check",
        "schedule": { "kind": "every", "expr": "1h" },
        "payload": { "text": "Check system health." },
        "mode": "main"
      }
    ]
  },
  "queue": {
    "mode": "collect",
    "dedup": { "enabled": true }
  }
}
```

---

*SwiftQuartz, 2026-02-14. 基于 cron.ts、cron-announcer.ts、cron-api.ts、config.ts、message-queue.ts 源码。*
