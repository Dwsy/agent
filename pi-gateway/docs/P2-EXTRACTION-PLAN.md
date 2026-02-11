# P2 Extraction Plan — message-pipeline.ts + plugin-api.ts

> Phase 2 of server.ts modularization (ref: SERVER-REFACTOR-SPEC.md §4.3)

## 1. message-pipeline.ts

### Source Range
- `processMessage()`: lines 870–1203 (~334 lines)
- `normalizeOutgoingText()`: lines 627–631 (5 lines, pure utility)

### Dependencies (this.xxx → ctx.xxx)
| Field | Usage |
|-------|-------|
| config | timeoutMs, logging |
| pool | acquire, getForSession |
| sessions | has, getOrCreate, get |
| registry | hooks.dispatch (session_start, before_agent_start, agent_end, message_sending, message_sent) |
| transcripts | logPrompt, logResponse, logError, logEvent, logMeta |
| metrics | incMessageProcessed, incRpcTimeout, recordLatency |
| extensionUI | forward (wired to rpc.extensionUIHandler) |
| wsClients | passed to extensionUI.forward |
| log | info, debug, warn, error |
| broadcastToWs | broadcast agent events to WS clients |
| buildSessionProfile | resolve role → capability profile |
| ctx | passed to tryHandleCommand |

### Proposed Signature
```typescript
export async function processMessage(
  msg: InboundMessage,
  ctx: GatewayContext,
  queueItem?: PrioritizedWork,
): Promise<void>
```

### RpcEventCollector — Worth Extracting?

**Yes.** The event handler closure (lines ~895–1005, ~110 lines) manages:
- `fullText` accumulation (text_delta/start/end with partial extraction)
- `thinkingText` accumulation (thinking_delta/start/end)
- `toolLabels` collection (tool_execution_start)
- `agentEndMessages` / `agentEndStopReason` capture
- `extractPartialText()` helper (~30 lines)
- Stream delta callbacks (msg.onStreamDelta, msg.onThinkingDelta, msg.onToolStart)
- WS broadcast per event

**Proposed class:**
```typescript
export class RpcEventCollector {
  fullText = "";
  thinkingText = "";
  toolLabels: string[] = [];
  agentEndMessages: unknown[] = [];
  stopReason = "stop";
  eventCount = 0;

  constructor(
    private sessionKey: string,
    private msg: InboundMessage,
    private ctx: GatewayContext,
  ) {}

  /** Returns unsubscribe function */
  subscribe(rpc: RpcClient): () => void { ... }
}
```

This reduces processMessage from ~334 to ~220 lines and makes event handling independently testable.

### Extraction Steps
1. Create `src/core/rpc-event-collector.ts` (~120 lines)
2. Create `src/core/message-pipeline.ts` (~220 lines)
3. Move `normalizeOutgoingText` as module-level utility
4. Replace `this.processMessage(...)` with `processMessage(msg, this.ctx, queueItem)`
5. Delete original from server.ts

### Risk
- **Medium**: processMessage is the core message flow. Any missed state mutation = silent regression.
- **Mitigation**: Event collector has no side effects beyond accumulation; pipeline is linear (acquire → prompt → collect → respond). Existing tests cover webhook/chat/Telegram flows end-to-end.

---

## 2. plugin-api.ts

### Source Range
- `createPluginApi()`: lines 2227–2440 (~214 lines)
- `registerBuiltinCommands()`: lines 2441–2530 (~90 lines) — already partially extracted to command-handler.ts by JadeHawk

### Dependencies (self.xxx / this.xxx → ctx.xxx)
| Field | Usage |
|-------|-------|
| config | passed as api.config, plugins.config |
| registry | channels, tools, commands, hooks, gatewayMethods, cliRegistrars, services |
| pool | acquire (for dispatch) |
| queue | enqueue (for dispatch) |
| sessions | getOrCreate (for dispatch) |
| log | plugin logger creation |
| broadcastToWs | passed to channel dispatch |
| buildSessionProfile | for dispatch profile |
| dispatch | for channel message handling |
| cron | addJob, removeJob |
| wsClients | for WS broadcast |
| dedup | for dedup check |
| extensionUI | forwarding |
| heartbeatExecutor | wake |
| delegateExecutor | delegation |
| compactSessionWithHooks | session compaction |
| listAvailableRoles | role listing |
| setSessionRole | role switching |
| sessionMessageModeOverrides | Telegram message mode |
| resolveTelegramMessageMode | Telegram mode resolution |
| noGui | GUI state |
| systemEvents | system event injection |
| metrics | metrics access |
| transcripts | transcript access |
| _channelApis | channel API cache |

### Proposed Signature
```typescript
export function createPluginApi(
  pluginId: string,
  manifest: PluginManifest,
  ctx: GatewayContext,
): GatewayPluginApi
```

### Extraction Steps
1. Create `src/plugins/plugin-api-factory.ts` (~220 lines)
2. Add `resolveTelegramMessageMode` and `_channelApis` to GatewayContext (currently missing)
3. Replace `this.createPluginApi(...)` with `createPluginApi(id, manifest, this.ctx)`
4. Delete original from server.ts

### Risk
- **High**: createPluginApi is the plugin contract surface. Every register* method touches registry state.
- **Mitigation**: Plugin API is a factory — it creates an object but doesn't execute logic at creation time. The real risk is in the closures it returns, which capture `self`. Replacing `self` with `ctx` is mechanical but must be exhaustive.

---

## 3. GatewayContext Additions Needed

For P2, GatewayContext (src/gateway/types.ts) needs these additional fields:

```typescript
// Already present:
config, pool, queue, registry, sessions, transcripts, metrics,
extensionUI, systemEvents, dedup, cron, heartbeat, delegateExecutor,
log, wsClients, noGui, sessionMessageModeOverrides,
broadcastToWs, buildSessionProfile, dispatch, compactSessionWithHooks,
listAvailableRoles, setSessionRole

// Need to add for P2:
resolveTelegramMessageMode: (sessionKey: SessionKey) => TelegramMessageMode;
_channelApis: Map<string, GatewayPluginApi>;
normalizeOutgoingText: (value: unknown, fallback: string) => string;
getRegisteredToolSpecs: () => ToolSpec[];
executeRegisteredTool: (toolName: string, params: Record<string, unknown>, sessionKey: SessionKey) => Promise<unknown>;
resolveToolPlugin: (toolName: string) => ToolPlugin | null;
```

---

## 4. Execution Order

```
P2-Step1: RpcEventCollector class (independent, no server.ts changes)
P2-Step2: message-pipeline.ts (depends on Step1 + GatewayContext)
P2-Step3: plugin-api-factory.ts (depends on GatewayContext additions)
P2-Step4: Update GatewayContext with new fields
P2-Step5: Wire server.ts to use new modules, delete originals
```

Each step: full 361 test suite, 0 regression.

---

## 5. Expected Impact

| Metric | Before P2 | After P2 |
|--------|-----------|----------|
| server.ts lines | 2582 | ~2030 |
| New files | — | rpc-event-collector.ts (~120), message-pipeline.ts (~220), plugin-api-factory.ts (~220) |
| Lines extracted | — | ~550 |

Combined with P0 (-403) and P1 (est. -500), server.ts target of <500 lines requires P3 cleanup of remaining helpers + startServer.
