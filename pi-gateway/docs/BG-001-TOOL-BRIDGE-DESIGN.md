# BG-001: Gateway ↔ Agent Tool Bridge Design

> Status: DRAFT  
> Author: NiceViper (OpenClaw Architecture Consultant)  
> Date: 2026-02-12  
> Scope: pi-gateway v3.6+

---

## 1. Problem Statement

Gateway plugins register tools via `registerTool(ToolPlugin)`, but the pi agent running in a separate RPC process **cannot discover or call them**. The two tool ecosystems are disconnected:

| Ecosystem | Registration | Discovery | Execution |
|---|---|---|---|
| **Agent tools** | pi extensions (`registerTool` in-process) | Automatic (extension loader) | Direct function call |
| **Gateway tools** | Plugin API (`registerTool` cross-process) | Manual (system prompt text) | HTTP callback to gateway |

**Current workaround**: `gateway-tools` extension hardcodes `send_media` and `send_message` tool definitions + HTTP fetch back to gateway. Each new gateway tool requires:
1. Extension code change (tool schema + execute function)
2. System prompt update (tool description text)
3. Gateway endpoint (HTTP handler)

This doesn't scale. A plugin author who calls `api.registerTool(myTool)` expects the agent to be able to use it.

### 1.1 Known Pain Points

| Pain Point | Severity | Current State |
|---|---|---|
| PID-based session resolution | Medium | Works but fragile (PID changes on restart) |
| No schema validation on gateway side | Medium | Extension validates, gateway trusts blindly |
| Tool discovery is hardcoded | High | Agent only knows tools listed in system prompt |
| No error surfacing | Medium | Gateway 400/500 errors swallowed by agent |
| Each tool needs 3 touchpoints | High | Extension + prompt + endpoint per tool |

---

## 2. OpenClaw Reference: How Embedded Tools Work

OpenClaw uses an **embedded model** — plugins and agent run in the same process.

```
Plugin                    Agent Loop
  │                          │
  ├─ registerTool(tool) ──→  registry.tools.push(factory)
  │                          │
  │                     buildToolList()
  │                          │ reads registry.tools
  │                          │ creates AgentTool[]
  │                          │ passes to LLM API
  │                          │
  │                     LLM calls tool
  │                          │
  │                     execute(params)  ← direct function call
  │                          │
  └──────────────────────────┘
```

Key characteristics:
- **Zero-latency discovery**: `registry.tools` is an in-memory array, read at each agent turn
- **Direct execution**: Tool `execute()` is a function call, no serialization
- **Factory pattern**: `OpenClawPluginToolFactory = (ctx) => AgentTool` — tools can be context-aware
- **Optional tools**: `opts.optional = true` means tool is only included when relevant

This model is impossible for pi-gateway because the agent runs in a **separate RPC process** (Bun.spawn). There is no shared memory.

---

## 3. pi-gateway Constraints

### 3.1 RPC Protocol Limitation

The pi-coding-agent RPC protocol (`rpc-types.ts`) defines these commands:

```
prompt | steer | follow_up | abort | new_session
set_model | get_available_models | set_thinking_level
compact | get_session_stats | get_messages | get_commands
bash | export_html | fork | ...
```

**There is no `register_tool` command.** The RPC protocol has no mechanism for the gateway to inject tools into a running agent process.

### 3.2 Extension Loading

Pi extensions are loaded at agent startup from:
- `~/.pi/agent/extensions/` (user extensions)
- `.pi/extensions/` (project extensions)
- `--extension` CLI flag

Extensions call `pi.registerTool()` which writes to `extension.tools` Map — an in-process data structure. This happens once at startup, before any RPC commands.

### 3.3 The Gap

```
Gateway Process                    Agent Process (RPC)
  │                                    │
  ├─ plugin.registerTool(tool) ──→  ??? (no bridge)
  │                                    │
  │                               extensions loaded at startup
  │                               tools = extension.tools (frozen)
  │                                    │
  │  ←── RPC events (stdout) ─────────┤
  │  ──── RPC commands (stdin) ───────→│
  │                                    │
  └────────────────────────────────────┘
```

---

## 4. Solution Paths

### Path A: RPC `register_tool` (Upstream Change)

Add a new RPC command to pi-coding-agent:

```typescript
| { type: "register_tool"; tool: { name: string; description: string; parameters: JSONSchema } }
| { type: "unregister_tool"; name: string }
```

The agent would maintain a `dynamicTools` Map alongside `extension.tools`, and include both when building tool lists for the LLM.

**Pros:**
- Clean architecture — tools are first-class in the agent
- Schema validation happens in the agent (where the LLM sees it)
- Tool execution round-trips: agent → RPC event → gateway → execute → RPC response → agent
- Hot-reload: gateway can add/remove tools at runtime

**Cons:**
- Requires upstream pi-mono change (new RPC command type)
- Execution round-trip adds latency (~5-20ms per tool call)
- Tool execution needs a new RPC event type (`tool_call_request` / `tool_call_response`)
- Breaking change to RPC protocol — all consumers need updating

**Execution flow:**
```
Gateway                          Agent (RPC)
  │                                 │
  ├── register_tool(schema) ──────→ dynamicTools.set(name, schema)
  │                                 │
  │                            LLM calls tool
  │                                 │
  │  ←── tool_call_request ────────┤ (new event type)
  │                                 │
  ├── execute tool locally          │ (waiting)
  │                                 │
  ├── tool_call_response ──────────→│
  │                                 │
  │                            agent continues
```

### Path B: Extension Bridge (No Upstream Change)

Generate a bridge extension at gateway startup that wraps all `registerTool` plugins into pi extension tools. The extension is written to a temp file and loaded via `--extension`.

**Pros:**
- No upstream changes needed
- Works with current pi-coding-agent
- Extension has full access to agent context (bash, files, etc.)
- Tool execution is local to the agent process (fast)

**Cons:**
- Tools execute via HTTP callback (same as current `send_media` pattern)
- Extension must be regenerated when plugins change (restart required)
- Schema must be serialized to TypeBox (pi extension format)
- PID-based session resolution remains (though can be improved)

**Execution flow:**
```
Gateway startup
  │
  ├── Collect all registerTool plugins
  │     tools = registry.tools entries
  │
  ├── Generate bridge extension file:
  │     /tmp/pi-gateway-tools-bridge-{hash}.ts
  │     ┌─────────────────────────────────────┐
  │     │ export default function(pi) {       │
  │     │   pi.registerTool({                 │
  │     │     name: "cron_list",              │
  │     │     parameters: Type.Object({...}), │
  │     │     execute(id, params) {           │
  │     │       return fetch(gateway/api/     │
  │     │         tools/call, {tool, params}) │
  │     │     }                               │
  │     │   });                               │
  │     │   // ... more tools                 │
  │     │ }                                   │
  │     └─────────────────────────────────────┘
  │
  ├── Spawn RPC with --extension /tmp/pi-gateway-tools-bridge-{hash}.ts
  │
  Agent process
  │
  ├── Loads bridge extension
  ├── Tools registered in-process
  ├── LLM sees all gateway tools
  ├── Tool call → fetch(gateway) → gateway executes → response
```

### Path C: Prompt Injection + Structured Output (Lightweight)

Don't register tools at all. Instead:
1. Inject tool descriptions into system prompt (already done for send_media/send_message)
2. Agent uses `bash` tool to `curl` the gateway API
3. Gateway validates and executes

**Pros:**
- Zero code change to pi-coding-agent or extensions
- Works today
- No new abstractions

**Cons:**
- Agent must know curl syntax (unreliable)
- No schema validation on agent side
- No tool call tracking in session stats
- Fragile — prompt injection can be ignored by LLM
- Doesn't scale beyond 3-4 tools (prompt bloat)

---

## 5. Recommendation: Path B (Extension Bridge)

**Path B is the pragmatic choice.** It requires no upstream changes, works with the current RPC protocol, and solves the core problem (automatic tool discovery).

Path A is architecturally cleaner but requires pi-mono changes that are outside our control and timeline. It should be proposed as a **pi-mono RFC** for future consideration.

Path C is what we have today — it works for 2 tools but won't scale.

### 5.1 Extension Bridge Architecture

```
┌─────────────────────────────────────────────────┐
│ Gateway Process                                  │
│                                                  │
│  Plugins                                         │
│  ├── cron-plugin    → registerTool("cron_list")  │
│  ├── session-plugin → registerTool("session_reset")│
│  └── custom-plugin  → registerTool("my_tool")    │
│                                                  │
│  ToolBridgeGenerator                             │
│  ├── collectRegisteredTools()                    │
│  ├── generateBridgeExtension()                   │
│  └── bridgePath: /tmp/pi-gw-bridge-{hash}.ts    │
│                                                  │
│  POST /api/tools/call                            │
│  ├── validate(toolName, params)                  │
│  ├── resolveSession(token/pid)                   │
│  └── registry.tools.get(name).execute(params)    │
│                                                  │
└─────────────────────────────────────────────────┘
         │                    ▲
         │ --extension        │ fetch(/api/tools/call)
         ▼                    │
┌─────────────────────────────────────────────────┐
│ Agent Process (RPC)                              │
│                                                  │
│  Bridge Extension (auto-generated)               │
│  ├── cron_list      → fetch → gateway executes   │
│  ├── session_reset  → fetch → gateway executes   │
│  └── my_tool        → fetch → gateway executes   │
│                                                  │
│  Existing Extensions                             │
│  ├── gateway-tools (send_media, send_message)    │
│  └── user extensions                             │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 5.2 Interface Design

#### ToolBridgeGenerator

```typescript
// src/core/tool-bridge.ts

interface BridgeToolSpec {
  name: string;
  description: string;
  /** JSON Schema for parameters (converted to TypeBox in generated code) */
  parameters: Record<string, unknown>;
}

interface ToolBridgeGenerator {
  /**
   * Collect all tools from registry that should be bridged to the agent.
   * Excludes tools already provided by gateway-tools extension.
   */
  collectBridgeableTools(registry: PluginRegistryState): BridgeToolSpec[];

  /**
   * Generate a pi extension file that wraps gateway tools.
   * Returns the file path for --extension flag.
   */
  generateBridgeExtension(
    tools: BridgeToolSpec[],
    gatewayUrl: string,
    internalToken: string,
  ): string;

  /**
   * Clean up generated extension files.
   */
  cleanup(): void;
}
```

#### Gateway Tool Call Endpoint

```typescript
// POST /api/tools/call (already exists in tool-executor.ts)
// Request:
{
  token: string;        // internal token (same as send_media)
  pid: number;          // caller PID for session resolution
  sessionKey?: string;  // explicit session key
  tool: string;         // tool name
  params: Record<string, unknown>;
}

// Response:
{
  ok: boolean;
  result?: { content: Array<{ type: string; text?: string }> };
  error?: string;
}
```

#### Generated Extension Template

```typescript
// Auto-generated by pi-gateway ToolBridgeGenerator
// DO NOT EDIT — regenerated on gateway restart
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const GATEWAY_URL = "{{gatewayUrl}}";
const INTERNAL_TOKEN = "{{internalToken}}";

// NOTE: Template syntax is pseudocode. Implementation uses string concatenation.
export default function gatewayToolBridge(pi: ExtensionAPI) {
  {{#each tools}}
  pi.registerTool({
    name: "{{name}}",
    label: "Gateway: {{name}}",
    description: "{{description}}",
    parameters: {{parametersTypeBox}},
    async execute(_toolCallId, params) {
      try {
        const res = await fetch(`${GATEWAY_URL}/api/tools/call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: INTERNAL_TOKEN,
            pid: process.pid,
            sessionKey: "",  // resolved via PID on gateway side
            tool: "{{name}}",
            params,
          }),
        });
        const data = await res.json();
        // ... error handling
      }
    },
  });
  // ... more tools (generated via string concatenation)
}
```

### 5.3 Migration Plan

#### Phase 1: Bridge Generator (v3.6)
1. Implement `ToolBridgeGenerator` in `src/core/tool-bridge.ts`
2. Hook into gateway startup: after plugin init, before RPC pool spawn
3. Pass generated extension path to `spawnClient` via `--extension`
4. Add `/api/tools/call` schema validation (currently trusts caller)

#### Phase 2: Migrate gateway-tools (v3.6, cautious)
1. Move `send_media` and `send_message` from hardcoded extension to `registerTool` in a builtin plugin
2. Bridge generator auto-wraps them like any other tool
3. **Caveat**: `send_media` has special logic (absolute path allowlist, `validateMediaPath`, `skipPathValidation`) that doesn't fit a generic schema+fetch pattern. May need to keep as a specialized tool with bridge-aware execution, or move validation into the `/api/tools/call` handler.
4. Remove `gateway-tools` extension (or keep as fallback)

#### Phase 3: Upstream RFC (v4.0 proposal)
1. Propose `register_tool` / `unregister_tool` RPC commands to pi-mono
2. If accepted, implement Path A as the long-term solution
3. Bridge generator becomes a compatibility layer

### 5.4 Schema Conversion

Gateway tools use plain JSON Schema (`parameters: Record<string, unknown>`).  
Pi extensions use TypeBox (`Type.Object({...})`).

The bridge generator needs a `jsonSchemaToTypeBox` converter:

```typescript
function jsonSchemaToTypeBox(schema: Record<string, unknown>): string {
  // Convert JSON Schema → TypeBox source code string
  // Phase 1 scope: string, number, boolean, object, array, enum, optional
  // Deferred: anyOf, oneOf, allOf, $ref, conditional schemas
  // Falls back to Type.Unknown() for unsupported types
}
```

This is a code generation step (string output), not a runtime conversion.

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Generated extension has syntax error | Agent starts without gateway tools | Validate generated code with `Bun.build` dry-run before spawning |
| Tool execution latency (HTTP round-trip) | ~5-20ms per call | Acceptable for gateway tools (not hot-path) |
| PID session resolution fails | Tool call returns 400 | Improve: gateway maps PID→sessionKey via `pool.getByPid()` (current mechanism); consider adding sessionKey to spawn env in future |
| Plugin adds tool after startup | Tool not available until restart | Document: tool registration is startup-time only (same as OpenClaw) |
| TypeBox conversion loses schema detail | Agent gets imprecise tool params | Test with all existing tool schemas; fallback to `Type.Unknown()` |

---

## 7. Rollback Strategy

The bridge generator is additive — it generates an extra `--extension` flag. Rollback:
1. Remove `--extension /tmp/pi-gw-bridge-*.ts` from spawn args
2. Gateway-tools extension continues working as before
3. No data migration needed

---

## 8. Acceptance Criteria

- [ ] AC-1: Any `registerTool` plugin tool is automatically available to the agent
- [ ] AC-2: Agent can call gateway tools and receive structured results
- [ ] AC-3: Tool schemas are validated on both sides (agent + gateway)
- [ ] AC-4: `send_media` and `send_message` migrated to bridge (Phase 2)
- [ ] AC-5: No upstream pi-mono changes required
- [ ] AC-6: Gateway restart regenerates bridge extension
- [ ] AC-7: Rollback to gateway-tools extension works without data loss

---

## Appendix A: OpenClaw vs pi-gateway Tool Architecture

| Dimension | OpenClaw | pi-gateway (current) | pi-gateway (with bridge) |
|---|---|---|---|
| Process model | Embedded (same process) | RPC (separate process) | RPC + bridge extension |
| Tool registration | `registry.tools.push()` | `registry.tools.set()` | Same + auto-bridge |
| Agent discovery | Reads registry at each turn | Hardcoded in extension | Auto-generated extension |
| Execution | Direct function call | HTTP fetch to gateway | HTTP fetch to gateway |
| Latency | ~0ms | ~5-20ms | ~5-20ms |
| Hot-reload | Yes (next turn) | No (restart required) | No (restart required) |
| Schema format | AgentTool (TypeBox) | ToolDefinition (JSON Schema) | Converted to TypeBox |

## Appendix B: Existing `/api/tools/call` Endpoint

The `tool-executor.ts` module already handles `POST /api/tools/call` and `GET /api/tools`:

```typescript
// GET /api/tools → list registered tools (name, description, plugin)
// POST /api/tools/call → execute a tool by name with params
```

The bridge extension would call this same endpoint. No new HTTP routes needed.
