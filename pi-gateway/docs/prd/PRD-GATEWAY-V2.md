# PRD: pi-gateway v2 升级迭代

> Status: Draft | Author: pi-zero (PM) | Date: 2026-02-11
> 
> 基于 OpenClaw 对标分析 + 团队实战反馈 + 代码审计

---

## 1. 背景

pi-gateway 是一个单端口 HTTP+WS 网关，通过 RPC Pool 驱动 pi agent 子进程，支持 Telegram/Discord/WebChat 等多渠道消息路由。当前版本（v1）已实现核心链路，但在可观测性、消息队列、插件体系、前端渲染等方面存在明确的 gap。

### 1.1 OpenClaw 对标结论（DarkFalcon 确认）

| 维度 | OpenClaw | pi-gateway | Gap |
|------|----------|------------|-----|
| Plugin API | 10 register + 14 hooks | 9 register + 14 hooks | 缺 `registerProvider` |
| Metrics | OTel 插件外置 | 内置 JSON endpoint（骨架完成） | 需补埋点 + endpoint |
| Session Key | `agent:{agentId}:{rest}` | 同格式，更自描述 | 保持 |
| Queue Mode | 6 种（steer/followup/collect/steer-backlog/interrupt/queue） | 纯 FIFO | 需实现 collect + priority + backpressure |
| Extension UI | 无 headless 降级 | 无 headless 降级 | pi-gateway 独有需求，需 WS 透传 |
| Plugin Lifecycle | config-reload hybrid，无 hot unload | 无 hot reload | 后排 |
| Config Schema | Zod safeParse + uiHints | 无 | 后排 |
| Provider Auth | OAuth/API Key/Device Code | 走 pi models.json | 暂不加 registerProvider |

### 1.2 实战痛点（KeenDragon 反馈）

- RPC 命令动态注册：启动时 RPC 未连接，延迟加载方案已实现
- thinking 内容泄漏到 Telegram：已修复
- 消息重复：onStreamDelta 累积 + respond() 追加
- Telegram editMessageText 429：默认 250ms throttle 太低

---

## 2. 改进方向（按优先级）

### P0 — Bug Fix（KeenDragon 负责）

| ID | 问题 | 状态 |
|----|------|------|
| BF-1 | thinking_delta 泄漏到 fullText | ✅ 已修复 |
| BF-2 | 消息重复（stream + respond 双写） | ✅ 已修复 |
| BF-3 | editMessageText 429 throttle（→1000ms） | ✅ 已修复 |
| BF-4 | webhook enqueue 不检查返回值 | ✅ 已修复（SwiftQuartz step 1） |

### P1 — 可观测性 `/api/metrics`（KeenUnion 负责）

| ID | 内容 | 状态 |
|----|------|------|
| OB-1 | MetricsCollector 骨架（RingBuffer + QuantileTracker） | ✅ 完成 |
| OB-2 | `/api/metrics` HTTP endpoint | 待接线 |
| OB-3 | 埋点：pool spawn/kill/crash, queue drop, latency | 待接线 |
| OB-4 | 子进程 RSS 采样（30s） | ✅ 完成 |

设计决策：内置 JSON endpoint 而非 OTel 外置。理由：目标用户是个人/小团队，不需要 Prometheus/Grafana 全家桶。

### P2 — Message Queue 背压（SwiftQuartz 负责）

设计文档：`docs/MESSAGE-QUEUE-BACKPRESSURE-DESIGN.md`（已 reviewed）

四层正交架构：

```
Layer 0: Dedup      — fingerprint LRU cache (1000 entries, 60s TTL)
Layer 1: Priority   — DM=10, group=5, webhook=3, allowlist+2
Layer 2: Collect    — 1500ms debounce, merge same-session messages
Layer 3: Backpressure — global cap 100, pool waiting list + TTL 30s
```

实现顺序（详见 `docs/MESSAGE-QUEUE-BACKPRESSURE-DESIGN.md`）：
1. webhook enqueue 返回值检查 ✅
2. PrioritizedWork 类型 + SessionQueue priority insertion ✅
3. Dedup cache
4. Collect mode（debounce + async drain + merge）
5. PoolWaitingList + pool.release() drain
6. Global pending cap
7. Config integration
8. Metrics hooks

注意：Telegram 插件侧已有 debounce（config-compat.ts），与 Layer 2 collect 的边界：插件侧负责 Telegram 特有的消息合并，queue 侧负责跨渠道的通用合并。

### P5 — RPC Pool CapabilityProfile 拆分（待排期）

当前 signature 包含 cwd + extensions + skills + model 等所有参数。角色切换时整个进程被 kill 重建。

提案：拆分为 hard/soft signature：
- hardSignature: cwd + extensions（进程级，变更需 respawn）
- softSignature: role + prompt + model（会话级，变更只需 RPC 调用）

收益：角色切换不 kill 进程，减少冷启动延迟。

### P3 — Extension UI WS 透传 + WebChat Rich Rendering（KeenUnion 负责）

前置条件：实现前需先定义 WS 消息 TypeScript interface（Extension UI prompt 类型 schema）。

DarkFalcon 提供的 4 个关键设计点：
1. TTL 60s 防 hang — 超时自动 auto-cancel
2. first-win 竞争 — 多前端连接时第一个响应的 client 获胜
3. dismissed 通知 — 已解决的 prompt 发 `extension_ui_dismissed` 给迟到的 client
4. union type mapping — WizardPrompter 的 select/multiselect/text/confirm/progress 映射到 WS 消息类型

当前 Extension UI 在 headless 模式下 auto-cancel，这是 pi-gateway 独有的问题（OpenClaw 没有 headless 场景）。

WebChat 当前是空壳插件，rich rendering（tool call 可视化、thinking 折叠、代码高亮）需要在 WS 前端实现。

### P4 — 角色切换 UX（GoldJaguar 负责）

当前无 UI 切换角色的能力。需要：
- `/role <name>` 命令
- WS method `session.setRole`
- 角色列表查询 `session.listRoles`

### P6 — Plugin 热重载（最低优先级）

OpenClaw 也没有 hot unload，只有 config-reload hybrid。暂不实现。

---

## 3. 架构对比 — Gap Matrix

### 3.1 Plugin API 对齐

| OpenClaw Method | pi-gateway | 状态 | 备注 |
|-----------------|------------|------|------|
| registerTool | ✅ registerTool | 已接线 HTTP/WS | |
| registerHook | ✅ registerHook | 14 hooks 已接线 | |
| registerHttpHandler | ✅ registerHttpRoute | OpenClaw 是全局 catch-all（返回 boolean），pi-gateway 是 method+path 匹配（超集） | |
| registerHttpRoute | ✅ registerHttpRoute | | |
| registerChannel | ✅ registerChannel | | |
| registerGatewayMethod | ✅ registerGatewayMethod | WS RPC | |
| registerCommand | ✅ registerCommand | 绕过 LLM | |
| registerService | ✅ registerService | 后台服务 | |
| registerCli | ✅ registerCli | pi-gw CLI | |
| registerProvider | ❌ 不实现 | model provider 走 pi models.json | |
| on (lifecycle hooks) | ✅ on | 语法糖 | |

### 3.2 Hook 对齐

| Hook | OpenClaw | pi-gateway | 状态 |
|------|----------|------------|------|
| before_agent_start | ✅ | ✅ | 已接线 |
| agent_end | ✅ | ✅ | 已接线 |
| message_received | ✅ | ✅ | 已接线 |
| message_sending | ✅ (可修改 content) | ✅ | 已接线 |
| message_sent | ✅ | ✅ | 已接线 |
| before_tool_call | ✅ (可 block) | ✅ | 已接线 |
| after_tool_call | ✅ | ✅ | 已接线 |
| tool_result_persist | ✅ (可修改 message) | ✅ | 已接线 |
| session_start | ✅ | ✅ | 已接线 |
| session_end | ✅ | ✅ | 已接线 |
| before_compaction | ✅ | ✅ | 已接线 |
| after_compaction | ✅ | ✅ | 已接线 |
| gateway_start | ✅ | ✅ | 已接线 |
| gateway_stop | ✅ | ✅ | 已接线 |

### 3.3 Queue Mode 对齐

| Mode | OpenClaw | pi-gateway | 状态 |
|------|----------|------------|------|
| FIFO (queue) | ✅ | ✅ 当前默认 | |
| collect | ✅ debounce + merge | ❌ | P2 设计完成 |
| steer | ✅ 中断当前 run | ❌ | 后排 |
| followup | ✅ 排队等当前完成 | ❌ 当前是 queue（FIFO+drop on full） | P2 后可实现 |
| interrupt | ✅ abort + 重新 run | ❌ | 后排（GoldJaguar 预研） |
| steer-backlog | ✅ | ❌ | 后排（GoldJaguar 预研） |
| priority | ❌ 无显式优先级 | ❌ | P2 设计完成 |
| backpressure | ❌ 无显式背压 | ❌ | P2 设计完成 |
| dedup | ✅ message-id/prompt | ❌ | P2 设计完成 |
| drop policy | ✅ summarize/old/new | ❌ 当前是 new（拒绝新消息） | P2 设计选 summarize |

### 3.4 代码规模对比

| 模块 | OpenClaw | pi-gateway | 备注 |
|------|----------|------------|------|
| plugin-sdk (re-exports) | 389 行 | N/A | OpenClaw 是巨型桶文件 |
| plugins/types.ts | 537 行 | 308 行 | pi-gateway 更精简 |
| plugins/hooks.ts | 470 行 | 内联 server.ts | |
| plugins/registry.ts | 515 行 | 内联 server.ts | |
| gateway/ | ~100+ 文件 | 1 个 server.ts (2306行) | pi-gateway 需拆分 |
| auto-reply/queue/ | 独立模块 | 135 行 message-queue.ts | |

---

## 4. 团队分工与里程碑

### 当前分工（Updated 2026-02-11 14:30）

| Agent | 角色 | 已完成 | 下一步 |
|-------|------|--------|--------|
| KeenDragon | Telegram 插件 | P0 ✅, 文档更新 ✅, 嵌套 Markdown ✅ | P2 Telegram debounce 验证 |
| KeenUnion | Metrics + Extension UI | M1 endpoint ✅, Extension UI types ✅ | M3 WS 透传实现 |
| SwiftQuartz | Message Queue | P2 step 1-7 ✅ | P2 step 8-9 config + metrics hooks |
| DarkFalcon | OpenClaw 架构专家 | 对标分析 ✅, v3 路由设计 ✅ | v3 delegate_to_agent review |
| GoldJaguar | 全栈执行 | M1 埋点 ✅, P4 角色切换 ✅, steer 预研 ✅ | P2 review + steer/interrupt 实现 |
| MintTiger | BBD 测试 | 代码审查 ✅ | M1 Telegram 实测（等重启） |

### 里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| M1 | P0 Bug Fix + metrics endpoint + P4 角色切换 | ✅ 代码完成，等实测验证 |
| M2 | P2 Queue 背压 Layer 0-3 | 进行中（step 8-9） |
| M3 | Extension UI WS 透传（types ✅，实现待开始） | 待 M2 后 |
| M4 | steer/interrupt 实现 | 预研完成，待 P2 collect 落地 |
| M5 | CapabilityProfile hard/soft 拆分 | 按需 |
| v3 | 多 agent 协作网关 + delegate_to_agent | 设计文档完成 |

---

## 5. 验收标准

### M1 验收
- [ ] `GET /api/metrics` 返回 JSON snapshot（pool/queue/latency/counters）
- [ ] latency p95 < 30s
- [ ] Telegram 消息不重复
- [ ] editMessageText 不触发 429
- [ ] webhook enqueue 满时返回 HTTP 429（响应体：`{ error, sessionKey, retryAfter? }`）
- [ ] metrics endpoint 注册逻辑在 metrics.ts 而非 server.ts

### M2 验收
- [ ] 同一 session 连续 3 条消息在 1.5s 内合并为 1 个 prompt
- [ ] DM 消息优先于 group 消息处理
- [ ] 重复消息（相同 sender + 相同内容 60s 内）被去重
- [ ] pool 满时消息进入 waiting list 而非 throw
- [ ] waiting list TTL 30s 后返回"服务繁忙"

### M3 验收
- [ ] Extension UI prompt 通过 WS 转发到 WebChat 前端
- [ ] 前端可渲染 select/text/confirm 类型的 prompt
- [ ] 60s 无响应自动 cancel
- [ ] 迟到的 client 收到 dismissed 通知

### M4 验收
- [ ] `/role <name>` 命令切换角色
- [ ] WS method `session.setRole` / `session.listRoles` 可用

### M5 验收
- [ ] 角色切换（同 cwd + 不同 prompt）不 kill RPC 进程
- [ ] 不同 cwd 的角色切换仍然 respawn

---

## 6. 技术决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| Metrics 方案 | 内置 JSON endpoint | 目标用户不需要 OTel 全家桶 |
| registerProvider | 不实现 | model provider 走 pi 的 models.json，不在网关层管理 |
| Session Key 格式 | 保持当前格式 | 比 OpenClaw 更自描述 |
| Queue 优先级 | 新增（OpenClaw 没有） | pi-gateway 独有需求，DM 应优先于 group |
| Extension UI headless | WS 透传 | OpenClaw 无先例，pi-gateway 独有场景 |
| server.ts 拆分 | 后排 | 2306 行偏大但功能内聚，当前不阻塞开发 |

---

## 7. 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Queue 背压引入复杂度 | 回归 bug | 保持向后兼容，默认行为不变；每个 feature 有配置开关 |
| Extension UI WS 透传无先例 | 设计可能需迭代 | DarkFalcon 已提供 4 个关键设计点 |
| server.ts 持续膨胀 | 维护困难 | M1 起新逻辑放独立模块；M4 后考虑拆分 |
| RPC Pool respawn 延迟 | 角色切换慢 | P5 hard/soft signature 拆分 |
| 多 agent 并行改 server.ts | merge conflict | 通过 pi_messenger reserve 协调文件锁 |

---

*「計画は捨てるためにある。でも計画なしに捨てるものはない」*
