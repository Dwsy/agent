# v3.3 Task Dispatch — Status & Next Steps

**Date:** 2026-02-11 20:33 (updated 2026-02-11 21:15)
**PM:** pi-zero (HappyCastle)
**Baseline:** v3.2 (305/305), 18 commits since

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
| Q4-P0 | Low-coupling extraction | DarkUnion | auth + static + webhook + openai + GatewayContext | `cfe4866` |
| Q4-P1a | command-handler + role-manager | JadeHawk | slash commands + role switching | `4880b24` |
| Q4-P1b | tool-executor + session-api | NiceViper | tool dispatch + session CRUD | `4ca1e7d` |
| Q4-P1c | ws-router + ws-methods | MintHawk | 25 WS methods, method registry | `2bc014a` |
| Q4-P1 | server.ts P1 wiring | DarkUnion (review) | server.ts 2985→1783 (-40%) | `8772993` |
| — | PRD v3.3 | pi-zero | `docs/PRD-GATEWAY-V33.md` | `d830cb1` |

## 3. P0+P1 Extracted Modules

| Module | Path | Lines | Owner |
|---|---|---|---|
| auth | `src/core/auth.ts` | 41 | DarkUnion |
| static-server | `src/core/static-server.ts` | 53 | DarkUnion |
| webhook-api | `src/api/webhook-api.ts` | 75 | DarkUnion |
| openai-compat | `src/api/openai-compat.ts` | 145 | DarkUnion |
| GatewayContext | `src/gateway/types.ts` | 85 | DarkUnion |
| command-handler | `src/gateway/command-handler.ts` | 190 | JadeHawk |
| role-manager | `src/gateway/role-manager.ts` | 68 | JadeHawk |
| tool-executor | `src/gateway/tool-executor.ts` | 120 | NiceViper |
| session-api | `src/api/session-api.ts` | 210 | NiceViper |
| ws-router | `src/ws/ws-router.ts` | 130 | MintHawk |
| ws-methods | `src/ws/ws-methods.ts` | 306 | MintHawk |

## 4. Next: Phase 2 (P2) — Ready to Start

Ref: `docs/P2-EXTRACTION-PLAN.md`

| Step | Task | Owner (proposed) | Lines | Risk |
|---|---|---|---|---|
| P2-1 | RpcEventCollector class | NiceViper | ~120 | Low |
| P2-2 | message-pipeline.ts | NiceViper | ~220 | Medium |
| P2-3 | plugin-api-factory.ts | DarkUnion | ~220 | High |
| P2-4 | GatewayContext additions | DarkUnion | ~10 | Low |
| P2-5 | server.ts wiring + delete originals | DarkUnion | — | Medium |

**GatewayContext additions needed for P2:**
- `reloadConfig` (already added ✅)
- `resolveTelegramMessageMode`
- `_channelApis`
- `normalizeOutgoingText`
- `getRegisteredToolSpecs`
- `executeRegisteredTool`
- `resolveToolPlugin`

## 5. Phase 3 (P3) — After P2

- server.ts final trim to < 500 lines (lifecycle + thin dispatch only)
- `madge --circular` check — zero circular dependencies
- Update `docs/SERVER-REFACTOR-SPEC.md` with final structure
- CHANGELOG entry

## 6. server.ts Reduction Tracker

| Phase | server.ts Lines | Delta | Cumulative |
|---|---|---|---|
| Start (v3.2) | 2985 | — | — |
| Q2+Q3 media extraction | 2823 | -162 | -162 |
| P0 (auth/static/webhook/openai) | 2582 | -241 | -403 |
| **P1 (commands/tools/sessions/WS)** | **1783** | **-799** | **-1202** |
| P2 (est. pipeline/plugin-api) | ~1230 | ~-550 | ~-1755 |
| P3 target | < 500 | — | > -2485 |

## 7. Agent Status

| Agent | Completed | Available For |
|---|---|---|
| DarkUnion | P0, P1 review, P2 plan | P2-3 plugin-api-factory |
| NiceViper | P1-C tool-executor/session-api | P2-1/P2-2 RpcEventCollector + pipeline |
| MintHawk | P1-A ws-router/ws-methods | P2 support or P3 |
| JadeHawk | P1-B command-handler/role-manager | P2 support or P3 |
| TrueJaguar | F3 security | P2 overflow |
| HappyNova | F2-T tests | Regression testing |

## 8. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| P2 processMessage regression | Medium | High | RpcEventCollector extracted first (independently testable) |
| Plugin API contract breakage | Low | Critical | GatewayPluginApi signature frozen, only internal impl changes |
| GatewayContext field explosion | Medium | Medium | Group related fields, consider sub-contexts in P3 |
| Circular dependency introduction | Low | High | Sub-modules import gateway/types.ts only, never server.ts |

---

*Next update: after P2 owner assignment and kickoff.*
