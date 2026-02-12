# pi-gateway Kanban

> **Version:** v3.4 — Production Hardening + Deep Refactor
> **PM:** pi-zero (HappyCastle) | **Updated:** 2026-02-12 20:40
> **Baseline:** v3.3 (366 tests) | **Current:** 482/482 green | **server.ts:** 1228 lines

---

## 📋 Backlog

| ID | Task | Priority | Owner | Notes |
|---|---|---|---|---|
| V1 | send_media Telegram 实战验证 (115.191.43.169) | P0 | TrueJaguar + Dwsy | 需要部署 |
| T1 | send_message tool (text + reply) | P1 | NiceViper | 设计中 |
| F1 | 飞书 (Feishu/Lark) channel plugin | P1 | JadeStorm | 设计阶段，参考 clawdbot-feishu |

## 🔧 In Progress

| ID | Task | Owner | Started | Blocker |
|---|---|---|---|---|
| R3 | server.ts <500 行 (P3 cleanup) | MintHawk | 02-12 | — |
| F1 | 飞书 channel plugin 设计文档 | JadeStorm | 02-12 | — |

## 👀 In Review

| ID | Task | Owner | Reviewer | Issue |
|---|---|---|---|---|
| S3 | exec-guard.ts | JadeHawk | DarkUnion | P0: not wired to spawn; P1: --flag=value bypass, daemon allowlist |

## ✅ Done (v3.4)

| ID | Task | Owner | Tests | Commit |
|---|---|---|---|---|
| R1 | message-pipeline extraction | NiceViper | — | `d394924` |
| R2 | plugin-api-factory extraction | DarkUnion | — | `0322fab` |
| S1 | auth fail-closed | TrueJaguar | 30 | `1479143` |
| S2 | SSRF guard | JadeHawk | 34 | `0caf605` |
| S3 | exec allowlist (impl, pending wiring) | JadeHawk | 20 | `681cdfd` |
| E1 | session reset centralization | JadeHawk | 11 | `2b14d9a` |
| — | Telegram video kind fix | TrueJaguar | 21 | `1e36640` |
| — | WebChat media_event frontend | MintHawk | — | `193a689` |
| — | CHANGELOG v3.4 draft | JadeHawk | — | — |

## 🚫 Blocked

| ID | Task | Owner | Reason |
|---|---|---|---|
| V1 | send_media 实战验证 | TrueJaguar | 等 Dwsy 安排 115.191.43.169 部署 |

## 📊 Metrics

| Metric | Value |
|---|---|
| server.ts lines | 2985 → 1783 (v3.3) → 1228 (R2) → target <500 |
| Total tests | 482 pass / 0 fail / 8 skip |
| v3.4 new tests | 127 (30 auth + 34 ssrf + 20 exec + 21 media-kind + 11 reset + 11 other) |
| Commits since v3.3 | 11 |

## 👥 Team Status

| Agent | Current Task | Available |
|---|---|---|
| NiceViper | 架构顾问 (OpenClaw 参考) | 咨询 |
| DarkUnion | 等飞书设计 review | ✅ |
| TrueJaguar | V1 blocked + SECURITY.md done | ✅ |
| MintHawk | R3 server.ts cleanup | — |
| JadeHawk | S3 fix done, CHANGELOG done | ✅ |
| JadeStorm | F1 飞书 plugin 设计文档 | — |
| HappyNova | 回归守门 | ✅ |

---

*Edit this file directly. Move cards between columns by cut-paste.*
