# Heartbeat & Cron Design (v3.1 Baseline)

**Status:** Draft — v3.1 scope
**Author:** DarkFalcon
**Date:** 2026-02-11
**Reference:** OpenClaw `src/infra/heartbeat-runner.ts`, `src/auto-reply/heartbeat.ts`, `src/cron/`

## 1. Heartbeat

### 概念

定期唤醒 agent 检查待办事项。不是健康检查，是"主动巡逻"。

### 配置

```jsonc
{
  "heartbeat": {
    "enabled": true,
    "every": "30m",
    "activeHours": { "start": "08:00", "end": "23:00", "timezone": "Asia/Shanghai" },
    "prompt": "Check HEARTBEAT.md. If nothing needs attention, reply HEARTBEAT_OK.",
    "ackMaxChars": 300,
    "skipWhenBusy": true
  }
}
```

Per-agent 可覆盖（`agents.list[].heartbeat`）。

### 执行流程

```
定时器到期
→ 检查 activeHours（时段外跳过）
→ 检查 queue（有待处理消息时跳过）
→ 检查 HEARTBEAT.md（空文件跳过，省 API 调用）
→ pool.findBestMatch() 找空闲 RPC 进程（找不到跳过，不排队不创建）
→ 发 heartbeat prompt
→ Agent 回复 HEARTBEAT_OK → suppress，不投递
→ Agent 回复其他内容 → 视为 alert，投递到绑定通道
→ 释放 RPC 进程
→ 调度下一次
```

### 关键设计

- **HEARTBEAT.md** 是 agent 的待办清单，放在 agent workspace 根目录
- **HEARTBEAT_OK** token 被 strip，剩余内容 ≤ ackMaxChars 时 suppress
- **不触发 typing indicator**
- **不占 queue 位置**
- **pool 策略：findBestMatch only** — 心跳永远不影响正常消息处理。找不到空闲进程就跳过本次，等下一个周期
- **失败处理：** 记录错误，emit heartbeat event，按间隔调度下一次

### 与 OpenClaw 的差异

| 方面 | OpenClaw | pi-gateway |
|------|----------|-----------|
| 执行方式 | embedded（同进程 `getReplyFromConfig`） | RPC pool（acquire → prompt → release） |
| Pool 影响 | 无（同进程） | findBestMatch only，不排队不创建 |
| 多 agent | per-agent 独立定时器 | 同，复用 agents.list 配置 |
| 结果投递 | 通过 outbound delivery | 通过 agent 绑定的 channel plugin |

## 2. Cron（定时任务）

### 与心跳的区别

- 心跳：模糊调度（every 30m），"有事就说，没事 OK"
- Cron：精确调度（cron 表达式），"在这个时间做这件事"

### 配置

```jsonc
{
  "cron": {
    "enabled": true,
    "jobs": [
      {
        "id": "daily-report",
        "schedule": "0 9 * * *",
        "task": "Generate daily status report",
        "agentId": "code",
        "mode": "isolated",
        "delivery": "announce",
        "timeout": 120000,
        "deleteAfterRun": false
      }
    ]
  }
}
```

### 调度类型

| 类型 | 格式 | 场景 |
|------|------|------|
| cron | `"0 9 * * *"` | 每天 9 点 |
| every | `3600000` (ms) | 每小时 |
| at | ISO 8601 timestamp | 一次性 |

### 执行模式

**main 模式：** 注入 system message → 等下次心跳处理（或立即唤醒）
- 适合：需要主 session 上下文的任务
- 依赖心跳机制

**isolated 模式：** 独立 session（`cron:<jobId>`）→ acquire RPC → 执行 → 投递结果
- 适合：独立任务，不需要主 session 上下文
- 结果通过 announce 投递到目标通道

### 持久化

- Job 定义：`data/cron/jobs.json`
- 执行历史：`data/cron/runs/<jobId>.jsonl`
- 失败重试：指数退避

## 3. 实现优先级

| 优先级 | 功能 | 预估 |
|--------|------|------|
| P0 | 心跳机制（定时器 + HEARTBEAT.md + HEARTBEAT_OK + suppress） | 2d |
| P1 | Cron isolated 模式（cron parser + 独立 session + announce） | 2d |
| P2 | Cron main 模式（system event 注入 + 心跳联动） | 1d |
| P3 | CLI 管理（`gateway cron add/list/remove/history`） | 1d |

---

*Based on OpenClaw source analysis. DarkFalcon, 2026-02-11*
