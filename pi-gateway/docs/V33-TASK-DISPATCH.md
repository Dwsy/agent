# v3.3 Task Dispatch — Status & Next Steps

**Date:** 2026-02-11 20:33 (updated 2026-02-12 02:40)
**PM:** pi-zero (HappyCastle)
**Baseline:** v3.2 (305/305), 25+ commits since

---

## 1. Completed (Track 1: Structured Tools + Media)

| ID | Task | Owner | Tests | Commit |
|---|---|---|---|---|
| F1 | System Prompt Layered Architecture | NiceViper | 21/21 (SP-10~SP-30) | `9daa815` |
| F1-T | System Prompt BBD Tests | HappyNova | — | `9daa815` |
| F2 | `send_media` Tool + `/api/media/send` | NiceViper | 26/26 (MS-10~MS-35) | `6fe7a84` |
| F2-T | Media Send BBD Tests (incl. direct delivery) | HappyNova | — | `1841636` |
| F3 | S1 MEDIA Path Security Hardening | TrueJaguar | 14/14 (S1-1~S1-14) | `c2ae567` |
| F4 | send_media Direct Delivery Architecture | NiceViper | — | `6fe7a84` |
| F4a | Telegram outbound.sendMedia | TrueJaguar | — | `495fab2` |
| F4b | Discord outbound.sendMedia | NiceViper | — | `bf3988a` |
| F4c | WebChat sendMedia WS push | MintHawk | — | `f504af3` |
| F4d | Video kind + document→file mapping | TrueJaguar | — | `20fb94b` |
| F5 | MEDIA_SEGMENT prompt update (send_media preferred) | NiceViper | — | `1841636` |

**Total new tests: 61 green (21 prompt + 26 media-send + 14 security)**

## 2. Completed (Track 2: Code Quality)

| ID | Task | Owner | Output | Commit |
|---|---|---|---|---|
| Q1 | Server Refactor Spec | DarkUnion | `docs/SERVER-REFACTOR-SPEC.md` | `7a47a8a` |
| Q2 | Media routes extraction | MintHawk | `src/api/media-routes.ts` | `90f18a3` |
| Q3 | Media send extraction | NiceViper | `src/api/media-send.ts` | `112d6db` |
| Q4-P0 | Low-coupling extraction | DarkUnion | auth + static + webhook + openai + GatewayContext | P0 commits |
| Q4-P1a | command-handler + role-manager | JadeHawk | slash commands + role switching | `4880b24` |
| Q4-P1b | tool-executor + session-api | NiceViper | tool dispatch + session CRUD | `4ca1e7d` |
| Q4-P1c | ws-router + ws-methods | MintHawk | 25 WS methods, method registry | `2bc014a` |
| Q4-P1 | server.ts P1 wiring | DarkUnion (review) | server.ts 2985→1783 (-40%) | `8772993` |
| Q5 | http-router declarative route table | MintHawk | `src/api/http-router.ts` (P2 ready) | `7e7b5bc` |

## 3. Documentation

| Doc | Owner | Status |
|---|---|---|
| PRD v3.3 | pi-zero | ✅ `docs/PRD-GATEWAY-V33.md` |
| Server Refactor Spec | DarkUnion | ✅ `docs/SERVER-REFACTOR-SPEC.md` |
| P2 Extraction Plan | DarkUnion | ✅ `docs/P2-EXTRACTION-PLAN.md` |
| Media Tool Architecture | NiceViper | ✅ `docs/MEDIA-TOOL-ARCHITECTURE.md` |
| System Prompt Architecture | NiceViper | ✅ `docs/SYSTEM-PROMPT-ARCHITECTURE.md` |
| Security (updated) | TrueJaguar | ✅ `docs/architecture/SECURITY.md` |
| Test Report | HappyNova | ✅ `docs/V33-TEST-REPORT.md` |
| CHANGELOG | TrueJaguar | ✅ `CHANGELOG.md` |

## 4. server.ts Reduction Tracker

| Phase | server.ts Lines | Delta | Cumulative |
|---|---|---|---|
| Start (v3.2) | 2985 | — | — |
| Q2+Q3 media extraction | 2823 | -162 | -162 |
| P0 (auth/static/webhook/openai) | 2582 | -241 | -403 |
| **P1 (commands/tools/sessions/WS)** | **1783** | **-799** | **-1202** |
| P2 (est. pipeline/plugin-api) | ~1230 | ~-550 | ~-1755 |
| P3 target | < 500 | — | > -2485 |

## 5. send_media Data Flow (Final Architecture)

```
Agent calls send_media tool
  → extension POST /api/media/send (internalToken auth)
    → validateMediaPath (7-layer security)
    → sessions.get(sessionKey) → lastChatId, lastChannel
    → registry.channels.get(channel).outbound.sendMedia(chatId, path, opts)
      ├── Telegram: bot.api.sendPhoto/sendVideo/sendAudio/sendDocument → messageId
      ├── Discord: AttachmentBuilder + channel.send({ files }) → messageId
      └── WebChat: signMediaUrl + WS media_event broadcast
    → tool result: {ok: true, messageId, delivered: true}
    → fallback (no sendMedia): {ok: true, directive: "MEDIA:...", delivered: false}
```

## 6. Next: Phase 2 (P2) — Ready to Start

Ref: `docs/P2-EXTRACTION-PLAN.md`

| Step | Task | Owner (proposed) | Lines | Risk |
|---|---|---|---|---|
| P2-1 | RpcEventCollector class | NiceViper | ~120 | Low |
| P2-2 | message-pipeline.ts | NiceViper | ~220 | Medium |
| P2-3 | plugin-api-factory.ts | DarkUnion | ~220 | High |
| P2-4 | GatewayContext additions | DarkUnion | ~10 | Low |
| P2-5 | server.ts wiring + http-router integration | MintHawk | — | Medium |

## 7. Remaining Before Release

- [ ] TrueJaguar: fix video kind + document→file mapping (DarkUnion review items)
- [ ] Full regression: 366+ tests green
- [ ] Deploy to 115.191.43.169 for real-env validation
- [ ] P2 (optional for v3.3 — can ship without)

---

*Next update: after P2 kickoff or v3.3 release decision.*
