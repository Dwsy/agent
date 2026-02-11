# TESTING.md — pi-gateway Test Architecture

TL;DR: 305 tests across 23 files, using `bun:test`, organized by version milestone (v2/v3.0/v3.1/v3.2). BBD (Behavior-Driven Design) naming convention. Mocks are hand-rolled per-file, no shared mock library.

---

## Test Runner

- **Runtime:** Bun (`bun:test`)
- **Imports:** `describe`, `test`, `expect` from `bun:test`
- **Run:** `bun test` from project root
- **No external test framework** — no Jest, no Vitest

## File Organization

### Naming Convention

| Pattern | Meaning |
|---|---|
| `bbd-*.test.ts` | Behavior-Driven Design scenarios, grouped by milestone |
| `bbd-v3-*.test.ts` | v3.0 feature tests |
| `bbd-v31-*.test.ts` | v3.1 feature tests |
| `bbd-v32-*.test.ts` | v3.2 feature tests |
| `bbd-m{N}-*.test.ts` | v3.0 milestone N simulation tests |
| `*.integration.test.ts` | Integration tests (real dependencies) |
| `*.test.ts` (plain) | Unit tests |

### Directory Layout

```
src/
├── cli.plugin-command.test.ts          # CLI plugin command parsing
├── server.extensions.test.ts           # Extension lifecycle (FakeRpc)
├── core/
│   ├── bbd-simulation.test.ts          # v3.0 M1: dedup, priority, thinking filter
│   ├── bbd-m2-simulation.test.ts       # v3.0 M2: collect mode, queue eviction
│   ├── bbd-m3-simulation.test.ts       # v3.0 M3: extension UI forwarding
│   ├── bbd-m4-simulation.test.ts       # v3.0 M4: steer/interrupt modes
│   ├── bbd-v3-routing.test.ts          # v3.0: 3-layer routing (unit)
│   ├── bbd-v3-routing-real.test.ts     # v3.0: 3-layer routing (real config)
│   ├── bbd-v31-heartbeat-cron-media.test.ts  # v3.1: heartbeat H1-H16, cron C1-C14, linkage L1-L7, media
│   ├── bbd-v32-cron-api.test.ts        # v3.2 F2: cron CRUD CR-1~CR-11
│   ├── bbd-v32-media-security.test.ts  # v3.2 F4: path validation MS-1~MS-8
│   ├── bbd-v32-webchat-images.test.ts  # v3.2 F3: media token WI-1~WI-5
│   ├── capability-profile.test.ts      # Capability matching
│   ├── rpc-pool.integration.test.ts    # Pool lifecycle (integration)
│   └── session-router.test.ts          # Session key resolution
├── plugins/builtin/telegram/__tests__/
│   ├── accounts.test.ts                # Multi-account config
│   ├── bbd-v3-step10.test.ts           # Telegram v3 step 10 scenarios
│   ├── commands.test.ts                # Slash command registration (FakeBot)
│   └── target.test.ts                  # Message target resolution
├── plugins/
│   └── loader.test.ts                  # Plugin discovery/loading
└── tools/
    ├── bbd-v3-delegate.test.ts         # delegate_to_agent scenarios
    ├── bbd-v3-metrics.test.ts          # Metrics collection
    └── delegate-to-agent.test.ts       # Delegation handler unit tests
```

## Coverage Matrix

| Version | Files | Tests | Scope |
|---|---|---|---|
| v2 (pre-v3) | 5 | 28 | CLI, plugins, extensions, Telegram basics |
| v3.0 | 12 | 157 | Routing, dedup, queue, collect, extension UI, steer/interrupt, delegation, metrics |
| v3.1 | 1 | 71 | Heartbeat (H1-H16), Cron (C1-C14), Linkage (L1-L7), media inbound/outbound |
| v3.2 | 3 | 49 | Cron API (CR-1~CR-11), media security (MS-1~MS-8), WebChat images (WI-1~WI-5) |
| **Total** | **23** | **305** | |

## Test Layers

### Unit Tests
Direct function/class testing with inline mocks. Most `bbd-*.test.ts` files fall here — they import the module under test and exercise it with constructed inputs.

Examples:
- `bbd-v32-media-security.test.ts` — calls `validateMediaPath()` directly with attack vectors
- `capability-profile.test.ts` — builds profiles and checks matching
- `session-router.test.ts` — resolves session keys from source objects

### Simulation Tests
End-to-end behavior simulation using hand-rolled mocks of RPC, pool, and queue. These test multi-component interactions without real pi processes.

Examples:
- `bbd-simulation.test.ts` — dedup cache + queue priority + thinking filter chain
- `bbd-m2-simulation.test.ts` — collect mode debounce + merge + eviction
- `bbd-m4-simulation.test.ts` — steer/interrupt mode with queue clearing

### Integration Tests
Tests that use real dependencies (filesystem, config parsing).

Examples:
- `rpc-pool.integration.test.ts` — real pool lifecycle
- `bbd-v3-routing-real.test.ts` — routing with real config objects

## Mock Strategy

No shared mock library. Each test file defines its own mocks inline:

| Mock | File | Purpose |
|---|---|---|
| `FakeRpc` | `server.extensions.test.ts` | Simulates RPC client for extension lifecycle |
| `MockDelegateHandler` | `delegate-to-agent.test.ts` | Implements `DelegateHandler` interface for delegation tests |
| `MockCronEngine` | `bbd-v32-cron-api.test.ts` | Stubs cron engine methods for API handler tests |
| `MockWebSocket` | `bbd-m3-simulation.test.ts` | Simulates WS connection for extension UI forwarding |
| `FakeBot` | `telegram/commands.test.ts` | Stubs Telegram Bot API for command registration |

[TODO: Consider extracting common mocks (FakeRpc, FakePool) into a shared `test-utils.ts` if mock duplication grows.]

## Test ID Convention

Tests within BBD files use scenario IDs from PRD/spec documents:

| Prefix | Source | Example |
|---|---|---|
| H1-H16 | Heartbeat spec | `H1: empty HEARTBEAT.md skips API call` |
| C1-C14 | Cron spec | `C3: main mode injects system event` |
| L1-L7 | Linkage spec | `L1: cron triggers heartbeat wake` |
| CR-1~CR-11 | v3.2 PRD §4.2 | `CR-2: add valid every job` |
| MS-1~MS-8 | v3.2 PRD §4.4 | `MS-4: traversal blocked` |
| WI-1~WI-5 | v3.2 PRD §4.3 | `WI-1: MEDIA directive → signed URL` |
| SP-1~SP-6 | System prompt spec | `SP-1: no features → null prompt` |

## Writing New Tests

### Template

```typescript
import { describe, test, expect } from "bun:test";

describe("v3.X feature-name — SCENARIO-ID", () => {
  test("SCENARIO-ID: one-line description", () => {
    // Arrange
    const input = /* ... */;

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Conventions

1. **File naming:** `bbd-v{major}{minor}-{feature}.test.ts` for new version features
2. **Describe blocks:** Group by feature area, include version prefix
3. **Test IDs:** Use PRD scenario IDs (e.g., `XX-1`, `XX-2`) — makes traceability trivial
4. **Mocks:** Define inline in the test file. Only extract to shared utils if 3+ files need the same mock
5. **No watch mode:** Run `bun test` for single execution
6. **Assertions:** Use `expect().toBe()` for primitives, `expect().toEqual()` for objects, `expect().toContain()` for strings/arrays
