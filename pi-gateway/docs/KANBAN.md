# pi-gateway Kanban

> **Version:** v3.4 — Production Hardening + Deep Refactor
> **PM:** pi-zero (HappyCastle) | **Updated:** 2026-02-12 21:45
> **Baseline:** v3.3 (366 tests) | **Current:** 518/518 green | **server.ts:** 485 lines (-84%)

---

## 📋 Backlog

| ID | Task | Priority | Owner | Notes |
|---|---|---|---|---|
| V1 | send_media Telegram 实战验证 (115.191.43.169) | P0 | TrueJaguar + Dwsy | 需要部署 |

## 🔧 In Progress

| ID | Task | Owner | Started | Blocker |
|---|---|---|---|---|
| ARCH | 架构全景图 (Mermaid + JSON Canvas + 审计) | DarkUnion | 02-12 | — |
| ARCH-data | 循环依赖检测 + 文件统计 | JadeHawk | 02-12 | — |
| ARCH-ref | OpenClaw 架构对比材料 | NiceViper | 02-12 | — |

## 👀 In Review

| ID | Task | Owner | Reviewer | Issue |
|---|---|---|---|---|
| F1 | 飞书 v1 channel plugin | JadeStorm | DarkUnion | Pending (DarkUnion 先做 ARCH) |

## ✅ Done (v3.4)

| ID | Task | Owner | Tests | Commit |
|---|---|---|---|---|
| R1 | message-pipeline extraction | NiceViper | — | `d394924` |
| R2 | plugin-api-factory extraction | DarkUnion | — | `0322fab` |
| R3 | server.ts <500 lines (2985→485, -84%) | MintHawk | — | `0a3e0ee` |
| S1 | auth fail-closed | TrueJaguar | 30 | `1479143` |
| S2 | SSRF guard | JadeHawk | 34 | `0caf605` |
| S3 | exec allowlist + wiring | JadeHawk | 20 | `a1a49c6` |
| E1 | session reset centralization | JadeHawk | 11 | `2b14d9a` |
| T1 | send_message tool (text + reply) | NiceViper | 14 | `7e31b3e` |
| F1-impl | 飞书 v1 plugin (pending review) | JadeStorm | 21 | `b8f4b9c` |
| — | Telegram video kind fix | TrueJaguar | 21 | `1e36640` |
| — | WebChat media_event frontend | MintHawk | — | `193a689` |
| — | WebChat send_message support | MintHawk | — | `9681fbf` |
| — | R3 review fixes (typo/rename/reuse) | MintHawk | — | `9681fbf` |
| — | tsc zero errors | JadeHawk | — | `48e572c` |
| — | SECURITY.md v3.4 update | TrueJaguar | — | `d355c2f` |
| — | RFC Channel Adapter | NiceViper | — | `48e572c` |
| — | CHANGELOG v3.4 draft | JadeHawk | — | — |

## 🚫 Blocked

| ID | Task | Owner | Reason |
|---|---|---|---|
| V1 | send_media 实战验证 | TrueJaguar | 等 Dwsy 安排 115.191.43.169 部署 |

## 📊 Metrics

| Metric | Value |
|---|---|
| server.ts | 2985 → 485 (-84%) |
| Total tests | 518 pass / 0 fail / 8 skip |
| v3.4 new tests | 152+ |
| Commits since v3.3 | 21 |
| tsc errors | 0 |
| Circular deps | 3 (JadeHawk detected) |

## 👥 Team Status

| Agent | Current Task | Available |
|---|---|---|
| NiceViper | ARCH OpenClaw 对比 | — |
| DarkUnion | ARCH 架构全景图 | — |
| TrueJaguar | V1 blocked | ✅ |
| MintHawk | R3 done | ✅ |
| JadeHawk | ARCH 数据支撑 done | ✅ |
| JadeStorm | F1 done, awaiting review | — |
| HappyNova | 回归守门 | ✅ |

---

*Edit this file directly. Move cards between columns by cut-paste.*
