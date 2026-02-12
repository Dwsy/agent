# P2 Extraction Plan — Final Status

> Phase 2 of server.ts modularization (ref: SERVER-REFACTOR-SPEC.md §4.3)
> **Status:** R1 ✅ R2 ✅ — P2 complete. R3 candidates listed below.

---

## 1. message-pipeline.ts — ✅ Done (R1, NiceViper)

- **Commit:** `d394924`
- **File:** `src/gateway/message-pipeline.ts`
- **Extracted:** `processMessage()` + `normalizeOutgoingText()` (~340 lines)
- **GatewayContext additions:** `channelApis`, `resolveTelegramMessageMode`
- **Impact:** server.ts 1783 → 1447 (-336 lines)

## 2. plugin-api-factory.ts — ✅ Done (R2, DarkUnion)

- **Commit:** `0322fab`
- **File:** `src/plugins/plugin-api-factory.ts`
- **Extracted:** `createPluginApi()` (230 lines)
- **Impact:** server.ts 1447 → 1228 (-219 lines)
- **Note:** `self.*` → `ctx.*` mechanical replacement; test updated to call extracted function directly

## 3. GatewayContext Final State

All P2 fields are now on GatewayContext:

```typescript
// Core (P0/P1):
config, pool, queue, registry, sessions, transcripts, metrics,
extensionUI, systemEvents, dedup, cron, heartbeat, delegateExecutor,
log, wsClients, noGui, sessionMessageModeOverrides,
broadcastToWs, buildSessionProfile, dispatch, compactSessionWithHooks,
listAvailableRoles, setSessionRole, reloadConfig

// Added for P2:
channelApis: Map<string, GatewayPluginApi>
resolveTelegramMessageMode: (sessionKey, sourceAccountId?) => TelegramMessageMode
```

---

## 4. R3 — server.ts Final Cleanup (MintHawk)

**Current:** 739 lines | **Target:** <500 lines | **Need to cut:** ~240+ lines

### Section Map (as of R2 complete)

| Lines | Size | Section | Extractable? |
|---|---|---|---|
| 1-60 | 60 | Imports + types | Keep (shrinks as methods move out) |
| 61-152 | 92 | Class fields + constructor | Keep (core skeleton) |
| 153-265 | 113 | `start()` lifecycle | Partially — plugin init loop (~40 lines) |
| 266-322 | 57 | `stop()` lifecycle | Keep (small, lifecycle) |
| 323-364 | 42 | `dispatch()` + helpers | Keep (core routing, already thin) |
| 365-429 | 65 | `startServer()` (Bun.serve) | Keep (server bootstrap) |
| **430-624** | **195** | **`handleHttp()` route dispatch** | **Primary target** |
| 625-644 | 20 | Thin proxies (send/chat/stream) | Inline into route table |
| 645-653 | 9 | `broadcastToWs()` | Keep (tiny) |
| 654-700 | 47 | `ctx` getter + proxies | Keep (DI wiring) |
| 701-720 | 20 | `createMetricsDataSource()` | Extract to metrics.ts |
| 721-739 | 18 | Class close + remaining | Keep |

### Extraction Candidates (priority order)

#### R3-A: `handleHttp()` → declarative route table (~195 → ~40 lines)

The biggest win. Current `handleHttp` is 195 lines of `if (url.pathname === X)` chains. Replace with:

```typescript
// src/api/http-router.ts
interface Route {
  method: string;
  path: string | ((p: string) => boolean);
  handler: (req: Request, url: URL, ctx: GatewayContext) => Response | Promise<Response>;
}

export function createHttpRoutes(ctx: GatewayContext): Route[] { ... }
export function matchRoute(routes: Route[], method: string, pathname: string): Route | null { ... }
```

server.ts `handleHttp` becomes:
```typescript
private async handleHttp(req: Request, url: URL): Promise<Response> {
  const route = matchRoute(this.httpRoutes, req.method, url.pathname);
  if (route) return route.handler(req, url, this.ctx);
  return serveStaticFile(url.pathname, this.noGui);
}
```

**Estimated savings:** ~155 lines (195 → ~40 for route init + match)

Inline handlers that are currently in `handleHttp` but not yet extracted:
- `/api/pool` stats (15 lines) → `src/api/pool-api.ts` or inline in route
- `/api/plugins` list (10 lines) → inline in route
- `/api/memory/*` (20 lines) → already delegates to `memory-access.ts`, just move route entries
- `/api/transcripts` + `/api/transcript/:key` (15 lines) → route entries

Already-extracted handlers (just need route entries):
- `/api/chat`, `/api/chat/stream` → `chat-api.ts` ✅
- `/api/send` → `send-api.ts` ✅
- `/api/session/*` → `session-api.ts` ✅
- `/api/tools/*` → `tool-executor.ts` ✅
- `/api/cron/*` → `cron-api.ts` ✅
- `/api/media/*` → `media-routes.ts` + `media-send.ts` ✅
- `/webhook/*` → `webhook-api.ts` ✅
- `/v1/chat/completions` → `openai-compat.ts` ✅

#### R3-B: Thin proxy elimination (~20 lines)

`handleApiSend`, `handleApiChat`, `handleApiChatStream` are one-line proxies:
```typescript
private async handleApiSend(req: Request): Promise<Response> {
  return handleApiSend(req, this.ctx);
}
```
With a route table, these disappear — routes call the imported functions directly.

#### R3-C: `createMetricsDataSource()` → `metrics.ts` (~20 lines)

Small but clean extraction. Move to `src/core/metrics.ts` as a factory function taking `ctx`.

#### R3-D: `start()` plugin init loop (~40 lines)

The channel init + start loop (lines ~188-218) could move to a `initPlugins(ctx)` helper in `src/plugins/plugin-lifecycle.ts`. Optional — only if needed to hit <500.

### Expected R3 Impact

| Extraction | Lines saved |
|---|---|
| R3-A: handleHttp → route table | ~155 |
| R3-B: Thin proxy elimination | ~20 |
| R3-C: Metrics data source | ~20 |
| R3-D: Plugin init loop (optional) | ~40 |
| **Total** | **~235** |
| **server.ts after R3** | **~504** (or ~464 with R3-D) |

### R3 Execution Order

1. `http-router.ts` — route table + match function (independent, no server.ts changes yet)
2. Wire `handleHttp` to use route table, delete if-else chain + thin proxies
3. Move `createMetricsDataSource` to metrics.ts
4. (If needed) Extract plugin init loop
5. Full regression: 482+ tests, 0 fail

---

## 5. Cumulative Impact

| Phase | server.ts | Delta | Commit |
|---|---|---|---|
| v3.3 baseline | 1783 | — | `v3.3` tag |
| R1 message-pipeline | 1447 | -336 | `d394924` |
| R2 plugin-api-factory | 1228 | -219 | `0322fab` |
| S1+S2+S3+other | 739 | -489 | various |
| R3 target | <500 | ~-240 | pending |
| **Total reduction** | **~1300 lines** | **-73%** | — |
