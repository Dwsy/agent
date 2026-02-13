# pi-gateway Kanban

> **Version:** v3.8 — Agent Autonomy & Interaction
> **PM:** pi-zero (HappyCastle) | **Consultant:** BrightZenith | **Updated:** 2026-02-13 15:20
> **Baseline:** v3.7 (703 tests, tag `32ce426`) | **Current:** 723/723 green
> **PRD:** `docs/PRD-GATEWAY-V38.md`

---

## ✅ Done (v3.8)

| ID | Task | Owner | Commit | Tests |
|---|---|---|---|---|
| T1 | gateway tool (config.get/reload/restart) | YoungStorm | `5a648c6` | 703 |
| T2 | message tool Phase 2 (pin/read-history) | JadePhoenix | `d2fd73f` | 703 |
| T3 | cron 补齐 (update/runs/status) | JadePhoenix | in T2 batch | 703 |
| T4 | session_status tool | NiceNova | `d70290e` | 723 |
| T5 | gateway tool 测试 (GW-01~GW-10) | YoungStorm | `ae07db4` | 713 |
| T6 | message Phase 2 测试 (MA-21~MA-30) | CalmArrow | `d6d3183` | 723 |
| T7 | session --continue 恢复 | Dwsy | `6d2b783` | 723 |
| T8 | /sessions + /resume 命令 | Dwsy | `7fbc3b6` | 723 |

## 📋 Backlog (v3.9+)

| ID | Task | Priority | Notes |
|---|---|---|---|
| BG-001 | Tool Bridge Generator 实现 | P1 | 设计文档 ✅，依赖 pi-mono |
| BG-004 | Plugin Hot-Reload 实现 | P2 | 设计文档 ✅ |
| gateway-P2 | gateway tool Phase 2 (config.patch/update.run) | P2 | |
| Role 统一 | gateway /role + role-persona 统一 | P1 | 等 Dwsy 定方向 |
| `as any` | 全局 `as any` 持续清理 | P3 | |
| model 容灾 | 模型 fallback 机制完善 | P1 | Dwsy 新需求 |

---

## ✅ Done (v3.7) — tag `32ce426`

10 tasks, 703 tests. Telegram 模块拆分 + 类型安全 + security 测试。

## ✅ Done (v3.6) — tag `923a855`

20 tasks, 687 tests. Message tool + cron + steer fix + ordering fix。
