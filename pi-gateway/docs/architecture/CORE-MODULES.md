# Core Modules — pi-gateway 核心模块详解

> TL;DR: 6 个核心模块构成 gateway 的运行时骨架 — RPC 进程池管理 agent 生命周期，session router 决定消息去向，capability profile 控制 agent 能力，heartbeat 定期唤醒 agent，system events 跨模块传递事件，system prompts 按需注入协议文档。

---

## 1. RPC Client (`src/core/rpc-client.ts`, 546 行)

单个 `pi --mode rpc` 子进程的封装。通过 stdin/stdout JSON Lines 协议与 pi agent 通信。

**生命周期：**

```
start() → spawn pi --mode rpc → readLoop (stdout JSON Lines) → collectStderr
  ↓
prompt(text, images?) → write JSON command to stdin → await response
  ↓
newSession() → reset agent context (reuse process, new conversation)
  ↓
stop() → cancel pending requests → kill process
```

**关键设计：**

- `sessionKey: string | null` — 当前绑定的会话。null 表示 idle，可被 pool 回收或重新分配
- `lastActivity: Date.now()` — 用于 idle timeout 判断
- `extensionUIHandler` — 可选的 extension UI 请求转发器，由 server.ts 注入，将 pi 的 TUI 交互（如 interview form）转发到 WebSocket 客户端
- `pendingRequests: Map<id, {resolve, reject, timeout}>` — 请求-响应匹配，每个请求有独立超时
- `signature` / `hardSignature` / `softResources` — 来自 capability profile，用于 pool 匹配决策

**通信协议：**

```
→ stdin:  {"id":"1","method":"prompt","params":{"text":"hello"}}
← stdout: {"id":"1","result":{"text":"Hi!","events":[...]}}
← stdout: {"event":"assistant_message","data":{"partial":"Hi"}}  (streaming)
```

---

## 2. RPC Pool (`src/core/rpc-pool.ts`, 454 行)

管理 `[min, max]` 个 RPC 进程，负责会话绑定、进程复用、健康检查和容量管理。

**进程获取策略 (`acquire`)：**

```
acquire(sessionKey, profile, priority?)
  │
  ├─ 已绑定且存活？→ 检查 profile 匹配
  │   ├─ 匹配 → 直接返回（最快路径）
  │   └─ 不匹配 → 回收旧进程，走下面流程
  │
  ├─ 找 idle 进程（exact match）→ 绑定 + newSession()
  │
  ├─ 找 idle 进程（hard match + soft superset）→ 绑定 + newSession()
  │
  ├─ 未达上限？→ spawnClient(profile) → 绑定
  │
  ├─ 达上限？→ evictLeastRecentIdle()
  │   ├─ 有 idle 可驱逐 → 驱逐 + spawn 新进程
  │   └─ 全部 active → enqueue to PoolWaitingList（带优先级）
  │
  └─ WaitingList 等待 → 有进程释放时按优先级分配
```

**Profile 匹配层级：**

| 层级 | 匹配条件 | 场景 |
|---|---|---|
| Exact match | `signature` 完全相同 | 同 role + 同 cwd + 同 model + 同 skills |
| Hard match | `hardSignature` 相同 + soft superset | 同 role + 同 cwd，但 skills 是超集 |
| No match | — | 需要新进程 |

**维护循环（30s interval）：**
- 健康检查：检测 crashed 进程，自动 respawn
- Idle 回收：超过 `idleTimeoutMs`（默认 5min）的 idle 进程被 stop
- WaitingList 分配：有进程释放时通知等待队列

**`findBestMatch` vs `acquire`：**
- `acquire` — 保证返回可用进程（可能 spawn 新的）
- `findBestMatch` — 只在现有 idle 进程中找，找不到返回 null。Heartbeat 用这个（不应为心跳 spawn 新进程）

---

## 3. Capability Profile (`src/core/capability-profile.ts`, 237 行)

构建 pi CLI 启动参数和能力签名。决定一个 RPC 进程"能做什么"。

**构建流程 (`buildCapabilityProfile`)：**

```
Input: { config, role, cwd, sessionKey? }
  │
  ├─ Hard args（不可运行时切换）:
  │   ├─ tools: --tools allow/deny
  │   ├─ prompts: --system-prompt, --append-system-prompt（含 gateway 注入）
  │   └─ discovery: --no-extensions, --no-skills, --no-prompt-templates
  │
  ├─ Soft args（可运行时切换）:
  │   ├─ model: --provider, --model
  │   └─ thinking: --thinking level
  │
  ├─ Soft resources（超集匹配）:
  │   ├─ skills: role skills + gateway skills + base skills
  │   ├─ extensions: role extensions + agent extensions
  │   └─ promptTemplates: role templates + agent templates
  │
  ├─ Env: PI_CODING_AGENT_DIR, PI_PACKAGE_DIR
  │
  └─ Output:
      ├─ args: string[] — 完整 CLI 参数
      ├─ signature: SHA256(role + cwd + all args + env) — exact match 用
      ├─ hardSignature: SHA256(role + cwd + hard args + env) — hard match 用
      └─ softResources: { skills[], extensions[], promptTemplates[] } — superset check 用
```

**Gateway Prompt 注入（F1, v3.2）：**

`appendRuntimePromptArgs` 将用户配置的 `appendSystemPrompt` 和 `buildGatewaySystemPrompt(config)` 合并为一个 `--append-system-prompt` 参数。Gateway prompt 根据 config 中启用的功能条件注入（详见 §6）。

**Skill 解析优先级：**

```
roleCaps.skills > agent.skillsGateway > agent.skillsBase > agent.skills (legacy)
```

前三个字段任一非空时启用分层模式，否则回退到 `agent.skills` 兼容旧配置。

---

## 4. Session Router (`src/core/session-router.ts`, 321 行)

将入站消息路由到正确的 session key、role 和 agent。

**Session Key 格式：**

```
agent:{agentId}:{channel}:{scope}:{identifier}

示例：
  agent:main:main:main                                    DM (dmScope=main)
  agent:main:telegram:account:bot1:group:-100123          Telegram 群组
  agent:main:telegram:account:bot1:group:-100123:topic:5  Telegram 论坛话题
  agent:main:discord:channel:123456                       Discord 频道
  agent:main:webchat:dm:abc123                            WebChat 会话
  cron:daily-report                                       Cron 任务
```

**三层路由：**

| 层 | 函数 | 职责 |
|---|---|---|
| Session Key | `resolveSessionKey(source, config, agentId?)` | 消息 → session key（基于 channel + chatType + dmScope） |
| Role | `resolveRoleForSession(source, config)` | session → role（Discord guild > channel > Telegram group > channel > global） |
| Agent | `resolveAgentId(source, text, config)` | 消息 → agent ID（static binding > prefix command > default） |

**DM Scope 策略：**

| dmScope | 行为 | 适用场景 |
|---|---|---|
| `main` | 所有 DM 共享一个 session | 单用户，上下文连续 |
| `per-peer` | 每个发送者独立 session | 多用户，隔离上下文 |
| `per-channel-peer` | 每个 channel+发送者独立 | 多 bot 账号 + 多用户 |

**Agent 路由（v3 多 agent）：**

```
resolveAgentId(source, text, config)
  ├─ Layer 1: Static binding — config.agents.bindings[] 按 score 匹配
  │   score: peer(8) > guild(4) > account(2) > channel(1)
  ├─ Layer 2: Prefix command — /{agentId} 前缀剥离
  └─ Layer 3: Default — config.agents.default || "main"
```

**`resolveMainSessionKey(agentId)`：** 返回 `agent:{agentId}:main`，被 HeartbeatExecutor 和 CronEngine 共享，确保心跳和 cron 事件路由到同一个 session。

---

## 5. Heartbeat Executor (`src/core/heartbeat-executor.ts`, 450 行)

定期唤醒 agent 检查待办任务。v3.1 核心功能。

**执行流程：**

```
start() → setInterval(execute, intervalMs)
  │
execute(agentId)
  ├─ 并发守卫：running.has(agentId)? → skip
  ├─ activeHours 检查：isInActiveHours()? → skip if outside
  ├─ skipWhenBusy 检查：pool.getForSession().isIdle? → skip if busy
  │
  ├─ 读取 HEARTBEAT.md
  │   └─ isHeartbeatContentEffectivelyEmpty()? → skip（只有标题和空 checkbox）
  │
  ├─ 消费 SystemEvents（cron 结果、async exec 完成）
  │   ├─ 有事件 → 拼接事件文本 + CRON_EVENT_PROMPT / EXEC_EVENT_PROMPT
  │   └─ 无事件 → 使用 DEFAULT_HEARTBEAT_PROMPT
  │
  ├─ pool.findBestMatch() — 只复用 idle 进程，不 spawn
  │   └─ 无可用进程 → skip（不阻塞用户会话）
  │
  ├─ rpc.prompt(text) → 等待 agent 响应
  │
  └─ stripHeartbeatToken(response)
      ├─ shouldSkip=true → 静默（HEARTBEAT_OK 或短确认）
      └─ shouldSkip=false → deliverAlert（发送到绑定的 channel）
```

**HEARTBEAT_OK 协议：**

- Agent 回复包含 `HEARTBEAT_OK` → gateway 判定为"无事发生"，不转发给用户
- `stripHeartbeatToken` 使用边缘剥离算法：迭代移除首尾的 token，处理 markdown/HTML 包裹
- 剥离后剩余文本 ≤ `ackMaxChars`（默认 300）→ 静默
- 剥离后剩余文本 > ackMaxChars → 视为 alert，转发给用户

**`requestNow(agentId)`：** 立即触发一次心跳（不等 interval）。Cron main mode 用这个在注入事件后唤醒 agent。

**Per-agent 配置覆盖：** `config.agents.list[].heartbeat` 可覆盖全局 heartbeat 配置（interval、activeHours、skipWhenBusy）。

---

## 6. System Prompts (`src/core/system-prompts.ts`, 68 行)

根据启用的功能条件拼接 gateway 注入的 system prompt。F1 (v3.2)。

**`buildGatewaySystemPrompt(config) → string | null`**

```
config 检查：
  ├─ heartbeat.enabled? → 注入 Heartbeat Protocol 段
  ├─ cron.enabled?      → 注入 Cron Event Protocol 段
  └─ hasAnyChannel()?   → 注入 Media Reply Protocol 段

每段可被 agent.gatewayPrompts.{heartbeat,cron,media} 显式覆盖（true/false）。
无段需注入时返回 null（省 token）。
```

**注入内容摘要：**

| 段 | 告诉 agent 什么 |
|---|---|
| Heartbeat | HEARTBEAT_OK 语义、HEARTBEAT.md 读取规则、alert vs OK 判定 |
| Cron | `[CRON:{id}]` 事件格式、处理规则、成功/失败回复约定 |
| Media | `MEDIA:<path>` 语法、相对路径要求、支持的文件类型 |

---

## 7. System Events Queue (`src/core/system-events.ts`, 92 行)

Gateway 层内存事件队列，用于跨模块异步通信。

**使用场景：**

```
Cron main mode:
  CronEngine.triggerJob() → systemEvents.inject(sessionKey, "[CRON:id] task")
  HeartbeatExecutor.execute() → systemEvents.consume(sessionKey) → 拼入 prompt

Async exec completion:
  DelegateExecutor → systemEvents.inject(sessionKey, result)
  HeartbeatExecutor → consume → 转发给 agent
```

**约束：**
- 每 session 最多 20 条事件（FIFO 驱逐）
- 1 小时 TTL，过期自动清理
- `gc()` 由 server.ts 的 WS tick keepalive（30s）定期调用

**API：**

| 方法 | 行为 |
|---|---|
| `inject(sessionKey, text)` | 入队，超限驱逐最旧 |
| `peek(sessionKey)` | 查看不消费 |
| `consume(sessionKey)` | 查看并清空 |
| `hasPending(sessionKey)` | 是否有待处理事件 |
| `gc()` | 清理所有过期条目 |

---

## 模块交互图

```
                    ┌─────────────────┐
                    │  server.ts      │
                    │  (orchestrator) │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌──────────────┐
     │ Session     │  │ Capability │  │ System       │
     │ Router      │  │ Profile    │  │ Prompts      │
     │             │  │            │  │              │
     │ msg→session │  │ config→args│  │ config→prompt│
     │ msg→role    │  │ config→sig │  │              │
     │ msg→agent   │  │            │  │              │
     └──────┬─────┘  └─────┬──────┘  └──────┬───────┘
            │               │                │
            │               ▼                │
            │        ┌────────────┐          │
            └───────▶│ RPC Pool   │◀─────────┘
                     │            │
                     │ acquire()  │
                     │ release()  │
                     │ findBest() │
                     └──────┬─────┘
                            │
                     ┌──────┴──────┐
                     ▼             ▼
              ┌──────────┐  ┌──────────┐
              │ RPC      │  │ RPC      │
              │ Client 1 │  │ Client N │
              │ (pi rpc) │  │ (pi rpc) │
              └──────────┘  └──────────┘
                     ▲
                     │
              ┌──────┴──────┐
              │ Heartbeat   │◀──── System Events Queue
              │ Executor    │      (cron results, async exec)
              └─────────────┘
```
