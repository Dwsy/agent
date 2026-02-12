# BG-004: Plugin Hot-Reload Mechanism Design

> Status: DRAFT  
> Author: NiceViper (OpenClaw Architecture Consultant)  
> Date: 2026-02-12  
> Scope: pi-gateway v3.6+  
> Depends on: BG-001 (tool bridge, for agent-side tool refresh)

---

## 1. Problem Statement

Plugin changes require a full gateway restart. This kills all active RPC sessions, drops in-flight messages, and disconnects channel bots. For a gateway managing multiple channels and long-running agent sessions, this is disruptive.

**Impact of restart:**
- Telegram/Discord bots disconnect and reconnect (~2-5s)
- Active RPC sessions are terminated (agent loses context unless compacted)
- In-flight messages in the queue are dropped
- Cron jobs miss their window
- Users see the bot go offline briefly

**Goal:** Reload a plugin without disrupting unrelated channels or sessions.

---

## 2. Current Plugin Lifecycle

```
Gateway.start()
  │
  ├── PluginLoader.loadAll()          ← external plugins (config dirs + global)
  │     └── for each: import(main) → factory(api) → registers components
  │
  ├── PluginLoader.loadBuiltins()     ← telegram, discord, webchat, feishu
  │     └── for each: import(index.ts) → factory(api) → registers components
  │
  ├── hooks.dispatch("gateway_start")
  │
  ├── for each channel: channel.init(api) → channel.start()
  │
  ├── for each service: service.start(api)
  │
  └── startServer() (HTTP + WS)

Gateway.stop()
  │
  ├── hooks.dispatch("gateway_stop")
  ├── for each channel: channel.stop()
  ├── for each service: service.stop()
  ├── server.stop()
  ├── cron.stop()
  └── pool.shutdown()
```

### 2.1 Registry Structure

All plugin components are stored in flat collections on `PluginRegistryState`:

| Collection | Type | Key | Per-plugin isolation? |
|---|---|---|---|
| `channels` | `Map<string, ChannelPlugin>` | channel id | ✅ (1 channel = 1 plugin) |
| `tools` | `Map<string, ToolPlugin>` | tool name | ❌ (no pluginId on entry) |
| `commands` | `Map<string, {pluginId, handler}>` | command name | ✅ (has pluginId) |
| `httpRoutes` | `Array<{method, path, handler, pluginId}>` | — | ✅ (has pluginId) |
| `gatewayMethods` | `Map<string, {handler, pluginId}>` | method name | ✅ (has pluginId) |
| `services` | `BackgroundService[]` | — | ❌ (no pluginId) |
| `hooks` | `HookRegistry` (flat array) | — | ✅ (has pluginId) |
| `cliRegistrars` | `Array<{pluginId, registrar}>` | — | ✅ (has pluginId) |

**Gap:** `tools` and `services` lack `pluginId` tracking, making per-plugin cleanup impossible without changes.

### 2.2 Module Caching

Bun's `import()` caches modules by resolved path. Re-importing the same path returns the cached module. Hot-reload requires cache busting (query string or temp copy).

### 2.3 OpenClaw Reference

OpenClaw does **not** have plugin hot-reload. Plugin changes require a full restart. This is greenfield design for pi-gateway.

---

## 3. Design Constraints

1. **Channel plugins hold external connections** (Telegram bot polling, Discord gateway WS, Feishu WS). Reloading a channel means disconnect + reconnect.
2. **RPC processes have loaded extensions** at startup. Agent-side tools (from BG-001 bridge) cannot be hot-reloaded without RPC restart or a future `register_tool` RPC command.
3. **Registry is the source of truth** for HTTP routing, WS methods, and command dispatch. Stale entries cause 404s or wrong handlers.
4. **Hooks run in registration order.** Removing and re-adding changes order (acceptable).
5. **No plugin versioning.** Can't diff old vs new to determine what changed.

---

## 4. Solution: Scoped Plugin Reload

### 4.1 Approach

Instead of full hot-reload (which is complex and fragile), implement **scoped plugin reload** — unload one plugin's registrations, re-import the module, re-register.

```
reload(pluginId)
  │
  ├── 1. Drain: pause message processing for affected sessions
  ├── 2. Teardown: stop channel/services, remove all registrations
  ├── 3. Purge: bust module cache
  ├── 4. Reload: re-import, re-register via factory(api)
  ├── 5. Init: channel.init(api) + channel.start()
  └── 6. Resume: unpause message processing
```

### 4.2 Scope Tiers

Not all plugin types need the same reload complexity:

| Tier | Plugin Type | Reload Complexity | Session Impact |
|---|---|---|---|
| **T1** | Tool plugins | Low — swap Map entry | None (next tool call uses new handler) |
| **T2** | Commands, HTTP routes, WS methods | Low — swap entries | None (next request uses new handler) |
| **T3** | Hooks | Low — remove + re-register | None (next event uses new handlers) |
| **T4** | Background services | Medium — stop + restart | None (service-internal) |
| **T5** | Channel plugins | High — disconnect + reconnect | Brief interruption (~2-5s) |

**T1-T3 are safe to reload at any time.** T4 needs graceful stop. T5 is the hard case.

### 4.3 Registry Changes Required

Add `pluginId` tracking to collections that lack it:

```typescript
// tools: add pluginId
tools: Map<string, ToolPlugin & { pluginId: string }>;

// services: add pluginId
services: Array<BackgroundService & { pluginId: string }>;
```

Add a `removeByPlugin(pluginId)` method to `HookRegistry`:

```typescript
class HookRegistry {
  removeByPlugin(pluginId: string): number {
    const before = this.hooks.length;
    this.hooks = this.hooks.filter(h => h.pluginId !== pluginId);
    return before - this.hooks.length;
  }
}
```

### 4.4 PluginReloader Interface

```typescript
// src/plugins/reloader.ts

interface ReloadResult {
  pluginId: string;
  success: boolean;
  /** Components removed during teardown */
  removed: { channels: string[]; tools: string[]; commands: string[];
             httpRoutes: number; wsMethods: string[]; services: string[];
             hooks: number };
  /** Components registered after reload */
  registered: { channels: string[]; tools: string[]; commands: string[];
                httpRoutes: number; wsMethods: string[]; services: string[];
                hooks: number };
  /** Duration in ms */
  durationMs: number;
  error?: string;
}

interface PluginReloader {
  /**
   * Reload a single plugin by ID.
   * For channel plugins: stops channel, removes registrations, re-imports, re-registers, re-starts.
   * For non-channel plugins: swaps registrations in-place.
   */
  reload(pluginId: string): Promise<ReloadResult>;

  /**
   * Check if a plugin can be safely reloaded right now.
   * Returns false if the plugin's channel has in-flight messages.
   */
  canReload(pluginId: string): { safe: boolean; reason?: string };

  /**
   * List reloadable plugins with their current state.
   */
  listReloadable(): Array<{
    pluginId: string;
    source: string;
    type: "channel" | "tool" | "service" | "mixed";
    canReload: boolean;
  }>;
}
```

### 4.5 Module Cache Busting

```typescript
async function reimport(modulePath: string): Promise<unknown> {
  // Bun caches by resolved URL. Append timestamp query to bust cache.
  const cacheBuster = `?t=${Date.now()}`;
  return import(modulePath + cacheBuster);
}
```

**Caveat:** This works for Bun but is not standard ESM behavior. If Bun changes caching semantics, this breaks. Alternative: copy plugin to temp path, import from there, delete after.

### 4.6 Channel Reload Flow (T5)

The most complex case. Detailed flow:

```
reload("telegram")
  │
  ├── 1. Check canReload
  │     └── Is any message currently being processed for telegram sessions?
  │         If yes: return { safe: false, reason: "in-flight messages" }
  │
  ├── 2. Pause
  │     └── queue.pauseChannel("telegram")
  │         (new messages for telegram sessions are held, not dropped)
  │
  ├── 3. Teardown
  │     ├── await channel.stop()           ← disconnects bot
  │     ├── registry.channels.delete("telegram")
  │     ├── registry.tools.deleteByPlugin("telegram")
  │     ├── registry.commands.deleteByPlugin("telegram")
  │     ├── registry.httpRoutes.filter(r => r.pluginId !== "telegram")
  │     ├── registry.gatewayMethods.deleteByPlugin("telegram")
  │     ├── registry.hooks.removeByPlugin("telegram")
  │     └── channelApis.delete("telegram")
  │
  ├── 4. Re-import
  │     └── module = await reimport("src/plugins/builtin/telegram/index.ts")
  │
  ├── 5. Re-register
  │     ├── api = createPluginApi("telegram", manifest, ctx)
  │     └── await factory(api)   ← registers channel + commands + hooks + routes
  │
  ├── 6. Re-init + Re-start
  │     ├── await channel.init(api)
  │     └── await channel.start()   ← reconnects bot
  │
  ├── 7. Resume
  │     └── queue.resumeChannel("telegram")
  │         (held messages are now processed)
  │
  └── 8. Return ReloadResult
```

### 4.7 Trigger Mechanisms

| Trigger | Interface | Use Case |
|---|---|---|
| WS method | `plugins.reload { pluginId }` | WebChat admin UI |
| HTTP endpoint | `POST /api/plugins/reload` | Automation / scripts |
| Slash command | `/reload <pluginId>` | Telegram admin |
| File watcher | `fs.watch` on plugin dirs | Dev mode only |

**File watcher** should be opt-in (`config.plugins.watchForChanges: true`) and debounced (500ms). Production should use explicit triggers only.

---

## 5. What Hot-Reload Does NOT Cover

| Scenario | Why Not | Alternative |
|---|---|---|
| Builtin plugin code changes | Builtins are bundled in the gateway binary | Rebuild + restart |
| Config changes (pi-gateway.jsonc) | Config affects all subsystems | `watchConfig` already handles partial reload |
| RPC pool / agent extensions | Agent process is separate | Restart specific RPC client |
| types.ts interface changes | TypeScript types are compile-time | Rebuild + restart |
| New plugin discovery | Scan runs at startup only | Restart or explicit `POST /api/plugins/scan` |

---

## 6. Implementation Plan

### Phase 1: Registry Isolation (v3.6, prerequisite)
1. Add `pluginId` to `ToolPlugin` entries in registry
2. Add `pluginId` to `BackgroundService` entries
3. Add `HookRegistry.removeByPlugin(pluginId)`
4. Add `PluginRegistryState.removeByPlugin(pluginId)` — centralized cleanup
5. Tests: verify clean removal of all component types

### Phase 2: Scoped Reload (v3.6)
1. Implement `PluginReloader` class
2. Module cache busting (`reimport`)
3. Channel pause/resume on `MessageQueueManager`
4. WS method `plugins.reload` + HTTP `POST /api/plugins/reload`
5. Tests: reload tool plugin, reload channel plugin, reload during in-flight

### Phase 3: Dev Mode File Watcher (v3.7, optional)
1. `fs.watch` on `config.plugins.dirs` + `~/.pi/gateway/plugins/`
2. Debounced auto-reload (500ms)
3. Console notification on reload
4. Only enabled when `config.plugins.watchForChanges: true`

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Module cache busting breaks on Bun update | Reload fails silently | Fallback: copy to temp path + import |
| Channel reconnect fails after reload | Channel offline | Retry with exponential backoff; if 3 failures, log error + keep old state |
| Stale closures reference old state | Subtle bugs | Factory pattern ensures fresh closures on re-register |
| Concurrent reload of same plugin | Race condition | Mutex per pluginId (reject concurrent reload) |
| Reload during in-flight message | Message lost | `canReload` check + queue pause/resume |
| Hook execution order changes | Behavior change | Acceptable — document as known behavior |

---

## 8. Acceptance Criteria

- [ ] AC-1: Tool/command/hook plugins reload without session interruption
- [ ] AC-2: Channel plugins reload with <5s interruption (pause → stop → reimport → start → resume)
- [ ] AC-3: In-flight messages are held during channel reload, not dropped
- [ ] AC-4: `POST /api/plugins/reload` returns `ReloadResult` with before/after component counts
- [ ] AC-5: Concurrent reload of same plugin is rejected
- [ ] AC-6: Failed reload leaves previous plugin state intact (rollback)
- [ ] AC-7: Registry tracks `pluginId` on all component types

---

## Appendix: Comparison with Other Systems

| System | Hot-Reload? | Mechanism |
|---|---|---|
| OpenClaw | ❌ | Full restart required |
| Discord.js bots | Partial | Command handler reload via `delete require.cache` |
| Fastify | ✅ | `fastify-plugin` with `encapsulate` + `decorate` |
| Webpack HMR | ✅ | Module graph diffing + `module.hot.accept` |
| pi-gateway (proposed) | Scoped | Per-plugin teardown + reimport + re-register |

The proposed approach is closest to Fastify's plugin encapsulation — each plugin's registrations are tracked and can be cleanly removed. The key difference is that pi-gateway also manages external connections (channel bots), which Fastify doesn't.
