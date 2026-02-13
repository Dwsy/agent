# v3.3 Test Coverage Report

**Total: 361 pass, 0 fail** | 26 files | 6.3s runtime

---

## Full Test Matrix

| File | Tests | Version | Coverage |
|---|---|---|---|
| `cli.plugin-command.test.ts` | 1 | v2 | CLI plugin command parsing |
| `server.extensions.test.ts` | 9 | v2 | Extension lifecycle, hooks, slash commands, dispatch modes |
| `plugins/loader.test.ts` | 1 | v2 | Plugin discovery/loading |
| `telegram/accounts.test.ts` | 2 | v2 | Multi-account config |
| `telegram/commands.test.ts` | 3 | v2 | Slash command registration (FakeBot) |
| `telegram/target.test.ts` | 3 | v2 | Message target resolution |
| `telegram/bbd-v3-step10.test.ts` | 9 | v2 | Telegram v3 step 10 scenarios |
| `bbd-simulation.test.ts` | 17 | v3.0 | Dedup, priority, thinking filter |
| `bbd-m2-simulation.test.ts` | 10 | v3.0 | Collect mode, queue eviction |
| `bbd-m3-simulation.test.ts` | 15 | v3.0 | Extension UI forwarding |
| `bbd-m4-simulation.test.ts` | 14 | v3.0 | Steer/interrupt modes |
| `bbd-v3-routing.test.ts` | 19 | v3.0 | 3-layer routing (unit) |
| `bbd-v3-routing-real.test.ts` | 20 | v3.0 | 3-layer routing (real config) |
| `capability-profile.test.ts` | 5 | v3.0 | Capability matching |
| `rpc-pool.integration.test.ts` | 3 | v3.0 | Pool lifecycle (integration) |
| `session-router.test.ts` | 2 | v3.0 | Session key resolution |
| `bbd-v3-delegate.test.ts` | 22 | v3.0 | delegate_to_agent scenarios |
| `bbd-v3-metrics.test.ts` | 11 | v3.0 | Metrics collection |
| `delegate-to-agent.test.ts` | 19 | v3.0 | Delegation handler unit tests |
| `bbd-v31-heartbeat-cron-media.test.ts` | 71 | v3.1 | Heartbeat H1-H16, Cron C1-C14, Linkage L1-L7, media |
| `bbd-v32-cron-api.test.ts` | 19 | v3.2 | Cron CRUD CR-1~CR-11 |
| `bbd-v32-media-security.test.ts` | 15 | v3.2 | Path validation MS-1~MS-8 |
| `bbd-v32-webchat-images.test.ts` | 15 | v3.2 | Media token WI-1~WI-5 |
| `bbd-v33-system-prompts.test.ts` | 21 | v3.3 | 3-layer prompt SP-10~SP-30 |
| `bbd-v33-media-send.test.ts` | 21 | v3.3 | send_media endpoint MS-10~MS-30 |
| `bbd-v33-media-security.test.ts` | 14 | v3.3 | S1 security hardening |

## Version Distribution

| Version | Tests | % | Files |
|---|---|---|---|
| v2 (pre-v3) | 28 | 7.8% | 7 |
| v3.0 | 157 | 43.5% | 12 |
| v3.1 | 71 | 19.7% | 1 |
| v3.2 | 49 | 13.6% | 3 |
| v3.3 | 56 | 15.5% | 3 |
| **Total** | **361** | **100%** | **26** |

## v3.3 New Tests (56)

### F1: System Prompt 3-Layer Architecture (21 tests)
| ID | Scenario |
|---|---|
| SP-10 | Identity prompt includes runtime line |
| SP-11 | Identity uses config defaults when no context |
| SP-12 | Identity lists enabled capabilities |
| SP-13 | Identity omits capabilities when none enabled |
| SP-14 | identity=false suppresses Layer 1 |
| SP-15 | Heartbeat injected when enabled |
| SP-16 | Heartbeat NOT injected when disabled |
| SP-17 | alwaysHeartbeat=true overrides disabled |
| SP-18 | Cron injected when enabled |
| SP-19 | Cron NOT injected when disabled |
| SP-20 | Media injected when channel active |
| SP-21 | Media NOT injected when no channels |
| SP-22 | Delegation injected for multi-agent |
| SP-23 | Delegation NOT injected for single agent |
| SP-24 | Delegation segment includes constraints |
| SP-25 | Telegram hints when enabled |
| SP-26 | Discord hints when enabled |
| SP-27 | WebChat hints always included |
| SP-28 | All features → all segments in order |
| SP-29 | No features → null |
| SP-30 | Config overrides force-disable segments |

### F2: send_media Tool (21 tests)
| ID | Scenario |
|---|---|
| MS-10 | Valid sessionKey authenticates |
| MS-11 | Invalid sessionKey → 403 |
| MS-12 | Valid internalToken authenticates |
| MS-13 | Invalid internalToken → 403 |
| MS-14 | Missing auth → 400 |
| MS-15 | Absolute path blocked |
| MS-16 | Traversal path blocked |
| MS-17 | URL scheme blocked |
| MS-18 | Home path blocked |
| MS-19 | Missing path → 400 |
| MS-20 | .png → photo |
| MS-21 | .mp3 → audio |
| MS-22 | .mp4 → video |
| MS-23 | .pdf → document |
| MS-24 | Explicit type overrides inference |
| MS-25 | Caption passed through |
| MS-26 | File not found → 404 |
| MS-27 | Invalid JSON → 400 |
| MS-28 | Channel parsed from sessionKey |
| MS-29 | Token deterministic for same config |
| MS-30 | Token is 32-char hex |

### F3: S1 Security Hardening (14 tests)
Covers URL scheme blocking (`file://`, `data:`, `ftp:`), `parseOutboundMediaDirectives` scheme filtering, and mixed attack vector scenarios. By TrueJaguar.

---

*Generated: 2026-02-11 | Runner: bun test v1.3.4*
