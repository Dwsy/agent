# pi-gateway Kanban

> **Version:** v3.6 — Agent Tool Ecosystem
> **PM:** pi-zero (HappyCastle) | **Updated:** 2026-02-12 22:45
> **Baseline:** v3.5 (612 tests) | **Current:** 629/629 green

---

## 📋 Backlog

| ID | Task | Priority | Owner | Notes |
|---|---|---|---|---|
| Role 统一 | gateway /role + role-persona 双系统统一 | P1 | TBD | 等 Dwsy 定方向。调研报告: `docs/issues/20260212-telegram-role-investigation.md` |
| BG-001 实现 | Tool Bridge Generator | P1 | TBD | 设计文档 ✅ `docs/BG-001-TOOL-BRIDGE-DESIGN.md` |
| BG-004 实现 | Plugin Hot-Reload | P2 | TBD | 设计文档 ✅ `docs/BG-004-HOT-RELOAD-DESIGN.md` |

## 🔧 In Progress

| ID | Task | Owner | Started | Blocker |
|---|---|---|---|---|
| Heartbeat tool | agent heartbeat 管理工具 | EpicViper | 02-12 | — |

## ✅ Done (v3.6)

| ID | Task | Owner | Tests | Commit |
|---|---|---|---|---|
| Cron tool | agent cron CRUD 工具 (6 actions) | EpicViper | 17 | `ab67301` |

## ✅ Done (v3.5) — 44 commits, 612 tests

### Channel Adapter (CA-1 三步迁移)
| ID | Task | Owner | Commit |
|---|---|---|---|
| CA-0 | Pattern comparison doc | NiceViper | — |
| CA-1 Step 1 | types.ts 接口定义 | NiceViper | `cb9139e` |
| CA-2 | Telegram adapter migration | PureWolf | `fc17b5a` |
| D1 | Discord/WebChat capabilities | KeenWolf | `27143e1` `9b26222` |
| Step 3 | 收紧 sendText → MessageSendResult | PureWolf | `f7e2c3a` |

### Feishu
| ID | Task | Owner | Commit |
|---|---|---|---|
| F3a | CardKit v1 streaming cards + patch fallback | UltraBear | `d6021fa` |

### Extensibility Backlog
| ID | Task | Owner | Commit |
|---|---|---|---|
| BG-001 设计 | Tool Bridge design doc | EpicViper | `c4b4e3e` `7b449c0` |
| BG-002 | session_end lifecycle audit (5/5 paths verified) | PureWolf | `3c49829` |
| BG-003 | Registration conflict detection + startup summary | KeenWolf | `97f00da` |
| BG-004 设计 | Hot-Reload design doc | EpicViper | `f218b1a` `0d2d77a` |
| BG-005 | drift-detect rewrite (directory context parsing) | KeenWolf | `44269c2` |

### Quality & Docs
| ID | Task | Owner | Commit |
|---|---|---|---|
| Security 测试 | allowlist + pairing (28 tests) | EpicViper | `6e45ce0` |
| sendText mock | 统一返回 MessageSendResult | KeenWolf | `1533837` |
| CHANGELOG | v3.5 entry | EpicViper | `e9d049e` |
| ARCH 更新 | feishu section 更新 | KeenWolf | `e12bdf0` |
| Role 调研 | gateway /role vs role-persona 分析 | PureWolf | — |

### Hotfixes (11 项)
| Task | Commit |
|---|---|
| RPC-EVENT log noise reduction | `fbc5b6f` `caec14d` `d53ed55` |
| Telegram respond diagnostic logging | `4a380fe` |
| Telegram bot.catch error handler | `33d6537` |
| Telegram steer spinner lazy init | `6ba07d8` |
| Telegram message ordering after tool calls | `b16396b` |
| Telegram /context + /status context usage | `b532210` |
| Telegram restore /stop command | `9b9fe92` `1ef9d25` |
| Telegram localCommands set fix | `f51696e` |
| RPC model fallback + ExecGuard fallback | `568dbbc` `744d0ff` |
| RPC abort() direct stdin write | `7721bf4` |
| Audio AIFF/AAC/OPUS/WMA support | `5ed5b2a` |

## 📊 Metrics

| Metric | v3.4 | v3.5 | v3.6 (current) |
|---|---|---|---|
| Tests | 540 | 612 | 629 |
| server.ts | 484 | 484 | 484 |
| Commits (cumulative) | — | +44 | +45 |

## 👥 Team Status

| Agent | Current Task | Available |
|---|---|---|
| EpicViper | Heartbeat tool 调研 | — |
| KeenWolf | — | ✅ |
| PureWolf | — | ✅ |
| UltraBear | — | ✅ |
| VividBear | PM 辅助 | — |

---

*Move cards between columns by cut-paste. Update after each commit.*
