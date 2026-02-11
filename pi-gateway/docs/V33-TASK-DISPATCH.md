# v3.3 Task Dispatch — Status & Next Steps

**Date:** 2026-02-11 20:33
**PM:** pi-zero (HappyCastle)
**Baseline:** v3.2 (305/305), 10 commits since

---

## 1. Completed (Track 1: Structured Tools)

| ID | Task | Owner | Tests | Commit |
|---|---|---|---|---|
| F1 | System Prompt Layered Architecture | NiceViper | 21/21 (SP-10~SP-30) | `9daa815` |
| F1-T | System Prompt BBD Tests | HappyNova | — | `9daa815` |
| F2 | `send_media` Tool + `/api/media/send` | NiceViper | 21/21 (MS-10~MS-30) | `112d6db` |
| F2-T | Media Send BBD Tests | HappyNova | — | `d830cb1` |
| F3 | S1 MEDIA Path Security Hardening | TrueJaguar | 14/14 (S1-1~S1-14) | `c2ae567` |

**Total new tests: 56/56 green**

## 2. Completed (Track 2: Code Quality)

| ID | Task | Owner | Output | Commit |
|---|---|---|---|---|
| Q1 | Server Refactor Spec | DarkUnion | `docs/SERVER-REFACTOR-SPEC.md` | `7a47a8a` |
| Q2 | Media routes extraction | MintHawk | `src/api/media-routes.ts` (122 lines) | `90f18a3` |
| Q3 | Media send extraction | NiceViper | `src/api/media-send.ts` (129 lines) | `112d6db` |
| — | PRD v3.3 | pi-zero | `docs/PRD-GATEWAY-V33.md` | `d830cb1` |

## 3. In Progress

| ID | Task | Owner | Status | Blocker |
|---|---|---|---|---|
| Q4-P0 | Low-coupling extraction | DarkUnion | 🔨 Working | server.ts reserved |

**P0 scope:**
- [x] `src/core/auth.ts` (41 lines)
- [x] `src/core/static-server.ts` (53 lines)
- [x] `src/api/webhook-api.ts` (75 lines)
- [x] `src/api/openai-compat.ts` (145 lines)
- [x] `src/gateway/types.ts` — GatewayContext interface (85 lines)
- [ ] server.ts delegation wiring (still 2823 lines, target < 2500 after P0)
- [ ] Full test run (305 + 56 = 361 tests, 0 regression)

## 4. Next: Phase 1 (P1) — Blocked on P0 Completion

Three parallel tracks, start simultaneously after P0 lands:

### P1-A: HTTP + WS Router → MintHawk

| File | Lines (est.) | Source in server.ts |
|---|---|---|
| `src/api/http-router.ts` | ~300 | `handleHttp` if-else chain → declarative route table |
| `src/ws/ws-router.ts` | ~200 | `handleWsFrame` switch → method registry |
| `src/ws/ws-methods.ts` | ~200 | Built-in WS methods (chat.*/sessions.*/cron.*) |

**Key change:** Replace if-else/switch with declarative registration.
**Reserve:** `src/server.ts`, `src/api/http-router.ts`, `src/ws/`
**Dependency:** GatewayContext from `src/gateway/types.ts`

### P1-B: Commands + Roles → JadeHawk

| File | Lines (est.) | Source in server.ts |
|---|---|---|
| `src/gateway/command-handler.ts` | ~150 | Slash command parsing + registered command dispatch |
| `src/gateway/role-manager.ts` | ~80 | `listAvailableRoles` + `setSessionRole` |

**Reserve:** `src/gateway/command-handler.ts`, `src/gateway/role-manager.ts`
**Dependency:** GatewayContext, registry.commands

### P1-C: Tools + Sessions → NiceViper

| File | Lines (est.) | Source in server.ts |
|---|---|---|
| `src/gateway/tool-executor.ts` | ~120 | Tool resolution + execution + delegate interception |
| `src/api/session-api.ts` | ~150 | `/api/session/*`, `/api/sessions/*` |

**Reserve:** `src/gateway/tool-executor.ts`, `src/api/session-api.ts`
**Dependency:** GatewayContext, registry.tools, delegateExecutor

### P1 Coordination Rules

1. **Reserve before edit** — messenger lock on files you touch
2. **server.ts edits serialized** — only one person modifies server.ts at a time, coordinate via messenger
3. **Test after each extraction** — run full suite, confirm 0 regression before commit
4. **GatewayContext is the contract** — all modules receive `ctx: GatewayContext`, no direct Gateway class imports

## 5. Phase 2 (P2) — After P1

| File | Lines (est.) | Owner | Risk |
|---|---|---|---|
| `src/gateway/message-pipeline.ts` | ~300 | TBD (highest RPC/dispatch familiarity) | High |
| `src/gateway/plugin-api.ts` | ~300 | TBD (last to extract, depends on everything) | High |

**P2 starts only after P1 is merged and tested.** Owner assignment after P1 review.

## 6. Phase 3 (P3) — Cleanup

- server.ts final trim to < 500 lines (lifecycle + thin dispatch only)
- `madge --circular` check — zero circular dependencies
- Update `docs/SERVER-REFACTOR-SPEC.md` with final structure
- CHANGELOG entry

## 7. Standby / Available

| Agent | Current Task | Available For |
|---|---|---|
| TrueJaguar | F3 done | P1 overflow or P2 message-pipeline |
| HappyNova | F2-T done | P0/P1 regression tests |
| JadeHawk | Waiting P0 | P1-B (confirmed) |

## 8. server.ts Reduction Tracker

| Phase | server.ts Lines | Delta | Cumulative |
|---|---|---|---|
| Start (v3.2) | 2985 | — | — |
| Q2+Q3 media extraction | 2823 | -162 | -162 |
| P0 (est.) | ~2500 | ~-323 | ~-485 |
| P1 (est.) | ~1200 | ~-1300 | ~-1785 |
| P2 (est.) | ~600 | ~-600 | ~-2385 |
| P3 target | < 500 | — | > -2485 |

## 9. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| P1 merge conflicts (3 parallel tracks) | High | Medium | Serialize server.ts edits, reserve locks |
| GatewayContext interface churn | Medium | High | Freeze interface after P0, extend only via optional fields |
| Test regression in P2 (processMessage) | Medium | High | Extract with zero behavior change, snapshot test outputs |
| Plugin API breakage | Low | Critical | GatewayPluginApi signature frozen, only internal impl changes |

---

*Next update: after DarkUnion P0 completion.*
