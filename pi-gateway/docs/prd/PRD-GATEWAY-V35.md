# PRD: pi-gateway v3.5 — Channel Maturity + Extensibility

**Status:** Final (7/7 reviewed)
**Author:** pi-zero (PM)
**Date:** 2026-02-12
**Baseline:** v3.4 (540/540 pass, server.ts 484 lines, 7-layer security, 4-channel)

---

## 1. Overview

v3.4 完成了 production hardening（安全三件套 + 模块化到 484 行）。v3.5 转向两个方向：

1. **Channel Maturity** — Channel Adapter RFC 落地 + 飞书 PR3 + 全通道迁移
2. **Extensibility** — 架构审计 backlog 修复（BG-001~003）

## 2. Target Users

Technical solo devs and 2-5 person teams running pi-gateway for multi-channel agent workflows.

## 3. Scope

### P0 — Must Ship

| ID | Feature | Description | Owner |
|---|---|---|---|
| CA-0 | Telegram/Feishu 模式对比文档 | 从实际代码提取共性/差异，作为 CA-1 evidence base | NiceViper |
| CA-1 | Channel Adapter interface | RFC 落地：optional adapters + sendText→MessageSendResult + `wrapLegacyOutbound()` | NiceViper |
| CA-2 | Telegram adapter migration | 迁移到新 adapter interface（与 D1 同 sprint） | TrueJaguar |
| D1 | Discord + WebChat adapter migration | 迁移到新 adapter interface（与 CA-2 同 sprint） | MintHawk |
| F3a | 飞书 PR3a: streaming + DM policy | 流式卡片更新 + DM policy（allowFrom/pairing）。群组 policy 已在 PR1 完成。不 block on CA-1，先用当前接口，CA-1 合入后适配 | JadeStorm |

### P1 — Should Ship

| ID | Feature | Description | Owner |
|---|---|---|---|
| F3b | 飞书 PR3b: 事件卡片回调 | 按钮回调 → dispatch 到 agent（独立交互模式） | JadeStorm |
| BG-001 | Tool bridge (gateway side) | 方案 A: pi-mono 侧 register_tool RPC（需跨仓）。方案 B: system prompt 注入工具描述 + agent 用 curl 调 gateway HTTP API（不依赖上游）。先出设计文档确认路径 | NiceViper |
| BG-002 | session_end lifecycle | 补全 5 条缺失路径（见 §4.4） | DarkUnion |
| BG-003 | 命名冲突治理 | 插件 command/tool 注册冲突检测 + 警告日志 | DarkUnion |
| V1 | send_media 实战验证 | 部署到 115.191.43.169，Telegram 端到端验证 | TrueJaguar + Dwsy |

### P2 — Can Ship

| ID | Feature | Description | Owner |
|---|---|---|---|
| BG-004 | 插件 CLI 冷启动优化 | profile 加载耗时 → 确认瓶颈 → 优化 | JadeHawk |
| BG-005 | 扩展能力回归测试 | 基于架构全景图做实现与文档漂移检测 | JadeHawk |

### Deferred

| Feature | Reason |
|---|---|
| TTS outbound | Voice model evaluation needed |
| WEBP sticker understanding | Vision provider wiring — separate track |
| Steer/Interrupt (M4) | Complex RPC coordination, v3.6+ |
| Multi-agent routing | delegate_to_agent sync shipped, advanced routing v4.0 |

## 4. Architecture

### 4.1 Channel Adapter Pattern (CA-1)

基于 RFC-CHANNEL-ADAPTER.md + CA-0 模式对比，从实际实现中提取：

```typescript
interface ChannelPlugin {
  id: string;
  meta: ChannelPluginMeta;
  capabilities: ChannelCapabilities;

  // Core (required)
  outbound: ChannelOutbound;  // sendText returns MessageSendResult
  init(api: GatewayPluginApi): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;

  // Optional adapters
  inbound?: ChannelInboundAdapter;
  streaming?: ChannelStreamingAdapter;
  security?: ChannelSecurityAdapter;
  dedup?: ChannelDedupAdapter;      // covers both inbound (Feishu) and outbound (Telegram) patterns
  messaging?: ChannelMessagingAdapter;
}

interface MessageSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}
```

**Breaking change mitigation (3-step):**
1. CA-1: 类型签名改为 `Promise<MessageSendResult | void>`（union type 兼容期）
2. CA-2/D1: 各 channel 迁移，返回 MessageSendResult
3. 全部迁移完后：收紧为纯 `Promise<MessageSendResult>`，去掉 `| void`

调用侧（dispatch.ts/send-api.ts 等）await 但不消费返回值，自然兼容。

**CA-1 workflow:** CA-0 模式对比 → CA-1 draft → 全员 review → 定稿 → 实现

**F3a 不 block on CA-1：** JadeStorm 先用当前接口开发，CA-1 合入后适配。

### 4.2 Dedup Adapter 双模式

CA-0 调研发现 Telegram 和 Feishu 的 dedup 模式不同：
- **Telegram:** outbound sent-message cache（防自己发的消息被重复处理）
- **Feishu:** inbound message-id dedup（防 WebSocket 重连重发，Map + 30min TTL）

`ChannelDedupAdapter` 需要同时覆盖两种模式：

```typescript
interface ChannelDedupAdapter {
  // Inbound dedup (Feishu pattern: WS reconnect replay)
  isInboundDuplicate?(messageId: string): boolean;
  recordInbound?(messageId: string): void;
  // Outbound dedup (Telegram pattern: own-message echo)
  isOutboundDuplicate?(messageId: string): boolean;
  recordOutbound?(messageId: string): void;
}
```

### 4.3 Tool Bridge (BG-001) — P1

降级理由：依赖 pi-mono 侧支持，跨仓协调不可控。

**两条路径（设计文档确认后选择）：**

| 方案 | 描述 | 依赖 | 复杂度 |
|---|---|---|---|
| A: RPC register_tool | pi-mono 新增 RPC 命令，运行时注入工具到 agent tool registry | pi-mono 改动 | 高 |
| B: Prompt + curl | gateway extension 注入工具描述到 system prompt，agent 用 bash curl 调 gateway HTTP API | 无外部依赖 | 低 |

方案 B 不优雅但能用，且不依赖上游。v3.5 先出设计文档，确认可行性后实现。

**BG-001 拆分：**
- P1-a: 设计文档 + gateway 侧准备（工具 schema 导出 + capability-profile 注入点）
- P1-b: 端到端打通（视 pi-mono 进度或走方案 B）

### 4.4 session_end 缺口路径 (BG-002)

DarkUnion 审计发现 5 条缺失路径：

| 路径 | 当前行为 | 应有行为 |
|---|---|---|
| `gateway/session-reset.ts` reset | 不触发 | session_end + session_start |
| `gateway/role-manager.ts` setSessionRole 释放旧 session | 不触发 | session_end（旧）+ session_start（新） |
| `gateway/telegram-helpers.ts` migration delete 旧 key | 不触发 | session_end |
| `core/heartbeat-executor.ts` heartbeat 导致 session 终止 | 不触发 | session_end |
| RPC pool evict idle 进程回收 | 不触发 | session_end |

已触发的路径（2 处）：
- `server.ts` stop() — gateway 关闭
- `ws-methods.ts` sessions.delete — WS 手动删除

### 4.5 飞书 PR3

**F3a (P0):** 流式卡片更新 + DM policy
| 能力 | 实现方式 | 风险 |
|---|---|---|
| 流式消息 | 飞书交互卡片 patch API | SDK 限制需调研 |
| DM policy | allowFrom + pairing（复用 Telegram 模式） | 低，有参考实现 |
| 群组 policy | ✅ 已在 PR1 完成 | — |

注：如果流式卡片 SDK 调研遇阻，DM policy 可先独立交付。

**F3b (P1):** 事件卡片按钮回调 → dispatch 到 agent

## 5. Execution Order

```
Week 1:
  CA-0 模式对比文档 + CA-1 draft (NiceViper)
  F3a start — DM policy + streaming 调研 (JadeStorm)
  BG-002 + BG-003 (DarkUnion)

Week 2:
  CA-1 review + finalize (NiceViper + all) → 实现开始
  F3a streaming 实现 (JadeStorm)
  BG-001 设计文档 (NiceViper)

Week 3:
  CA-2 + D1 parallel (TrueJaguar + MintHawk)
  F3a adapt to new interface + deliver
  BG-001 option 评估 (NiceViper)

Week 4:
  CA-2 + D1 complete → 收紧 MessageSendResult 类型
  F3b start (JadeStorm)
  V1 deploy + validate
  Full regression + CHANGELOG (HappyNova)
```

## 6. Dependencies

| Dependency | Impact |
|---|---|
| 115.191.43.169 部署 | V1 实战验证 blocked |
| Feishu SDK card patch API | F3a streaming 需调研 |
| pi-mono capability-profile | BG-001 方案 A 需要（方案 B 不需要） |

## 7. Acceptance Criteria

| ID | Criteria |
|---|---|
| CA-0 | Telegram/Feishu 模式对比文档，覆盖 dedup/streaming/security/messaging |
| CA-1 | ChannelPlugin 新接口 + wrapLegacyOutbound + union type 过渡 + types.ts + 文档 |
| CA-2 | Telegram 全部通过新接口，零回归，安全 checklist 通过 |
| D1 | Discord + WebChat 通过新接口，零回归 |
| F3a | 飞书流式卡片 + DM policy，测试覆盖 |
| F3b | 事件卡片回调 → agent dispatch，测试覆盖 |
| BG-001 | 设计文档 + gateway 侧准备（端到端视 pi-mono 进度） |
| BG-002 | 5 条缺失路径全部触发 session_end，无重复 |
| BG-003 | 冲突注册时 warn 日志 + 覆盖语义明确 |
| V1 | Telegram 端到端 send_media 验证通过 |
| 全量 | tsc 0 errors, 全部测试 green |

## 8. Risk

| Risk | Mitigation |
|---|---|
| sendText breaking change | 3-step union type 过渡 + CA-2/D1 同 sprint |
| BG-001 pi-mono 依赖 | 方案 B 兜底（prompt + curl） |
| 飞书卡片 API 限制 | F3a 调研先行，DM policy 可独立交付 |
| CA-1/F3a 依赖 | F3a 不 block on CA-1，后适配 |
| BG-002 scope 大于预期 | 5 条路径逐个修复，每条独立测试 |

## 9. Team Assignment

| Agent | Tasks | Priority |
|---|---|---|
| NiceViper | CA-0 + CA-1 + BG-001 设计 | P0 + P1 |
| DarkUnion | CA-1 review + BG-002 + BG-003 | P0 + P1 |
| JadeStorm | F3a + F3b | P0 + P1 |
| TrueJaguar | CA-2 Telegram + V1 验证 + 安全 review | P0 + P1 |
| MintHawk | D1 Discord + WebChat | P0 |
| JadeHawk | BG-004 + BG-005 | P2 |
| HappyNova | 全量回归 + CHANGELOG | P0 |

## 10. Review Log

| Date | Reviewer | Key Feedback | Resolution |
|---|---|---|---|
| 02-12 | HappyNova | BG-001 不应 P0；CA-2+D1 同 sprint；F3 拆分 | ✅ 采纳 |
| 02-12 | JadeStorm | 群组 policy 已完成；F3a=streaming+DM policy；CA-1 不 block F3 | ✅ 采纳 |
| 02-12 | MintHawk | legacy wrapper；CA-1 先 review 再实现；D1+WebChat 接受 | ✅ 采纳 |
| 02-12 | JadeHawk | BG-001 不应 P0；BG-004 需先 profile；BG-005 基于架构全景图 | ✅ 采纳 |
| 02-12 | TrueJaguar | void→MessageSendResult 协变；CA-2 安全 checklist；F3 拆分 | ✅ 采纳 |
| 02-12 | DarkUnion | union type 过渡；BG-002 五条缺口路径；BG-001 拆两步 | ✅ 采纳 |
| 02-12 | NiceViper | CA-0 前置；dedup 双模式；BG-001 方案 B 兜底；WebChat 也需迁移 | ✅ 采纳 |

---

*Final — 7/7 reviewed. Ready for Dwsy confirmation and team kickoff.*
