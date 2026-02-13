# pi-gateway Kanban

> **Version:** v3.8 — Agent Autonomy & Interaction
> **PM:** pi-zero (HappyCastle) | **Consultant:** BrightZenith | **Updated:** 2026-02-13 15:30
> **Baseline:** v3.7 (703 tests, tag `32ce426`) | **Current:** 723/723 green
> **PRD:** `docs/PRD-GATEWAY-V38.md`

---

## ✅ Done (v3.8)

| ID | Task | Owner | Commit |
|---|---|---|---|
| T1 | gateway tool (config.get/reload/restart) | YoungStorm | `5a648c6` |
| T2 | message tool Phase 2 (pin/read-history) | JadePhoenix | `d2fd73f` |
| T3 | cron 补齐 (update/runs/status) | JadePhoenix | in T2 batch |
| T4 | session_status tool | NiceNova | `d70290e` |
| T5 | gateway tool 测试 (GW-01~GW-10) | YoungStorm | `ae07db4` |
| T6 | message Phase 2 测试 (MA-21~MA-30) | CalmArrow | `d6d3183` |
| T7 | session --continue 恢复 | Dwsy | `6d2b783` |
| T8 | /sessions + /resume 命令 | Dwsy | `7fbc3b6` |

## 🔍 In Design

| ID | Task | Owner | Notes |
|---|---|---|---|
| — | 群聊 per-group role | BrightZenith 出方案 | 基础设施 80% 就绪，验证 wiring |
| — | 模型容灾 (fallback chain) | BrightZenith 已出方案 | Phase 1 ~170 行，Phase 2 ~80 行 |

## 👥 Team Status

| Agent | 状态 | 说明 |
|---|---|---|
| BrightZenith | 🟢 在线 | 咨询专家，出群聊 + 模型容灾方案 |
| CalmArrow | 🟠 away 25m | T6 完成，待命 |
| CalmBear | 🟠 away 36m | 待命 |
| JadePhoenix | 🔴 stuck 37m | T2+T3 完成，需释放 reserve |
| NiceNova | 🔴 stuck 32m | T4 完成，需释放 reserve |
| YoungStorm | 🔴 stuck 27m | T1+T5+T8 完成，需释放 reserve |
| UltraBear | 🟠 away 1h+ | 待命 |

## 📋 Backlog (v3.9+)

| ID | Task | Priority | Notes |
|---|---|---|---|
| BG-001 | Tool Bridge Generator 实现 | P1 | 设计文档 ✅，依赖 pi-mono |
| BG-004 | Plugin Hot-Reload 实现 | P2 | 设计文档 ✅ |
| gateway-P2 | gateway tool Phase 2 (config.patch/update.run) | P2 | |
| Role 统一 | gateway /role + role-persona 统一 | P1 | 等 Dwsy 定方向 |
| `as any` | 全局 `as any` 持续清理 | P3 | |

---

## ✅ Done (v3.7) — tag `32ce426`

10 tasks, 703 tests. Telegram 模块拆分 + 类型安全 + security 测试。

## ✅ Done (v3.6) — tag `923a855`

20 tasks, 687 tests. Message tool + cron + steer fix + ordering fix。
