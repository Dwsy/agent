# pi-gateway Kanban

> **Version:** v3.7 — Code Quality & Type Safety
> **PM:** pi-zero (HappyCastle) | **Consultant:** EpicViper | **Updated:** 2026-02-13 13:30
> **Baseline:** v3.6 (687 tests, tag `923a855`) | **Current:** 703/703 green
> **PRD:** `docs/PRD-GATEWAY-V37.md`

---

## ✅ Done (v3.7)

| ID | Task | Owner | Commit | Tests |
|---|---|---|---|---|
| T1 | S3 ExecGuard wiring | EpicViper | `303bcb5` | 687 |
| T2 | handlers.ts 拆分 (1199→528+464+213) | EpicViper | `c64e913`+`66c0baf` | 687 |
| T3 | commands.ts 拆分 (650→464+222) | EpicViper | `2880d20` | 687 |
| T4 | Config 类型补全 (-8 `as any`) | EpicViper | `9d063c6` | 687 |
| T6 | gateway/ `catch (err: any)` 清理 (12处) | YoungStorm | `16f59db` | 703 |
| T9 | security/ 单元测试 (+16 tests) | JadePhoenix | `ed4e7c8` | 703 |
| T10 | SystemEventsQueue gc 定时 | IronIce | `34bf02b` | 703 |

## 🔧 In Progress

| ID | Task | Owner | Notes |
|---|---|---|---|
| T5 | RPC 事件类型定义 | VividBear | P1, T8 前置依赖 |
| T7 | server.ts cron announcer 提取 | PureWolf | 等 JadePhoenix 释放 server.ts reserve |
| T8 | gateway-tools 拆分 | IronIce (待 T5) | 依赖 T5 完成 |
| — | src/api/ + src/core/ `catch (err: any)` 扩展清理 | YoungStorm | T6 扩展范围 |

## 📋 Backlog (v3.8+)

| ID | Task | Priority | Notes |
|---|---|---|---|
| BG-001 | Tool Bridge Generator 实现 | P1 | 设计文档 ✅ `docs/BG-001-TOOL-BRIDGE-DESIGN.md`，依赖 pi-mono |
| BG-004 | Plugin Hot-Reload 实现 | P2 | 设计文档 ✅ `docs/BG-004-HOT-RELOAD-DESIGN.md` |
| F3a | Feishu CardKit v1 streaming | P1 | UltraBear 原任务，暂挂（身份重分配） |
| msg-pin | message tool Phase 2: pin/unpin | P2 | v3.7 scope per EpicViper |
| msg-read | message tool Phase 2: read-history | P2 | v3.7 scope per EpicViper |
| msg-thread | message tool Phase 3: thread | P3 | |
| msg-search | message tool Phase 3: search | P3 | |
| Role 统一 | gateway /role + role-persona 统一 | P1 | 等 Dwsy 定方向 |
| `as any` | 全局 109→~80 处 `as any` 持续清理 | P3 | top: discord/handlers(11), transcript-logger(9) |

---

## ✅ Done (v3.6) — tag `923a855`

20 tasks, 687 tests, 7-person team. See `CHANGELOG.md` for full list.

Key deliverables: message tool (react/edit/delete 四通道), cron enhancements (announcer + self-delivery), steer spinner fix (DispatchResult), message ordering fix (delta-based), BG-002 audit, Role RPC, thinking 1024 chars.
