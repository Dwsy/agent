# PRD: pi-gateway v3.8 — Agent Autonomy & Interaction

**Author:** pi-zero (PM)  
**Date:** 2026-02-13  
**Status:** Active  
**Baseline:** v3.7 (703 tests, tag `32ce426`)  
**Consultant:** EpicViper (architecture review, not implementation)

---

## Goal

v3.8 聚焦 agent 自治能力和消息交互扩展。让 agent 能自管 gateway、操作更多消息类型、获取运行状态。

---

## Scope 决策

**进 v3.8：**
- gateway tool — agent 自管能力（设计已就绪）
- message tool Phase 2 — pin/read-history
- cron 补齐 — update/runs/status
- session_status tool — 可观测性

**不进 v3.8：**
- BG-001 Tool Bridge — 依赖 pi-mono，不可控
- BG-004 Hot-Reload — 中等工作量，顺延 v3.9
- Role 统一 — 等 Dwsy 定方向
- F3a 飞书 CardKit — 已取消

---

## Task DAG

```
  ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐
  │  T1  │   │  T2  │   │  T3  │   │  T4  │   ← 四个独立，可并行
  │  gw  │   │  msg  │   │ cron │   │ sess │
  │ tool │   │ pin/ │   │ 补齐  │   │ stat │
  │      │   │ read │   │      │   │      │
  └──┬───┘   └──┬───┘   └──────┘   └──────┘
     │          │
     ▼          ▼
  ┌──────┐   ┌──────┐
  │  T5  │   │  T6  │   ← 测试补齐
  │ gw   │   │ msg  │
  │ test │   │ test │
  └──────┘   └──────┘
```

**并行组：**
- Group A: T1 + T2 + T3 + T4（四个独立，可同时开工）
- Group B: T5 (依赖 T1) + T6 (依赖 T2)

---

## Task Details

### T1 — gateway tool Phase 1
- **优先级:** P0
- **预估:** ~80 行
- **设计:** EpicViper 草案已就绪
- **内容:**
  - HTTP 端点: `GET /api/gateway/config` + `POST /api/gateway/reload` + `POST /api/gateway/restart`
  - Extension tool: `extensions/gateway-tools/gateway.ts` — 3 actions (config.get / reload / restart)
  - Config: `gateway.commands.restart` 默认 false
  - restart 不需要 sentinel（RPC pool 自动重连）
- **文件:** http-router.ts, gateway-tools/gateway.ts, gateway-tools/index.ts, config.ts
- **验收:** agent 能通过 tool 查看配置、触发 reload、触发 restart（开关开启时）

### T2 — message tool Phase 2 (pin + read-history)
- **优先级:** P1
- **预估:** ~150 行
- **内容:**
  - `message` tool 新增 2 个 action: `pin` / `read`
  - `pin`: messageId + optional unpin flag
  - `read`: chatId + optional limit/before 参数，返回最近 N 条消息
  - ChannelOutbound 新增: `pinMessage?()` + `readHistory?()`
  - Telegram / Discord 实现，Feishu / WebChat stub
- **文件:** plugins/types.ts, message-action.ts, gateway-tools/message-action.ts, telegram/outbound.ts, discord/handlers.ts
- **验收:** agent 能置顶消息、读取聊天历史

### T3 — cron 补齐 (update + runs + status)
- **优先级:** P1
- **预估:** ~60 行
- **内容:**
  - cron tool 新增 3 个 action: `update`（修改已有 job）、`runs`（查看执行历史）、`status`（cron 引擎状态）
  - 对齐 OpenClaw cron tool 8 actions
- **文件:** gateway-tools/cron.ts, src/core/cron.ts
- **验收:** cron tool 支持 10 个 action（现有 7 + 新增 3）

### T4 — session_status tool
- **优先级:** P2
- **预估:** ~80 行
- **内容:**
  - 新 tool `session_status`: 返回当前会话的 token count、cost、model、context usage、message count
  - 复用 `getSessionStats` RPC + model config
  - HTTP 端点: `GET /api/session/status?sessionKey=xxx`
- **文件:** gateway-tools/session-status.ts, gateway-tools/index.ts, http-router.ts
- **验收:** agent 能查询自身会话状态

### T5 — gateway tool 测试
- **优先级:** P1
- **预估:** ~50 行
- **依赖:** T1
- **内容:** gateway tool 端到端测试（config.get / reload / restart 三个 action）
- **验收:** ≥6 个 test case

### T6 — message tool Phase 2 测试
- **优先级:** P1
- **预估:** ~50 行
- **依赖:** T2
- **内容:** pin + read-history 端到端测试
- **验收:** ≥8 个 test case

---

## Claim Rules

1. 在 messenger 里发 `认领 T<N>` 即可
2. 认领后 reserve 相关文件
3. 完成后跑 `bun test` 确认 0 fail，发 commit hash
4. 有问题问 EpicViper（咨询专家）
5. T1-T4 可并行，T5/T6 等依赖完成后开工

---

## Timeline

- T1/T2/T3/T4 立即可开工
- T5 等 T1，T6 等 T2
- 全部完成后 v3.8 封版
