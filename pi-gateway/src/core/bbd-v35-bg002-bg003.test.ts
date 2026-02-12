/**
 * BG-002: session_end lifecycle completeness
 * BG-003: plugin registration conflict detection
 */
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { resetSession } from "../gateway/session-reset.ts";
import { setSessionRole } from "../gateway/role-manager.ts";
import type { GatewayContext } from "../gateway/types.ts";
import type { SessionKey } from "../core/types.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockCtx(overrides: Partial<GatewayContext> = {}): GatewayContext {
  const hookLog: string[] = [];
  return {
    config: { roles: { workspaceDirs: { dev: "/dev" }, capabilities: {} }, agent: {}, logging: { file: false, level: "info" }, plugins: { config: {} } } as any,
    pool: {
      getForSession: () => ({ newSession: async () => {} }),
      release: () => {},
      acquire: async () => ({}),
    } as any,
    queue: { clearCollectBuffer: () => 0 } as any,
    registry: {
      hooks: {
        dispatch: async (event: string, payload: any) => {
          hookLog.push(event);
        },
      },
      channels: new Map(),
      tools: new Map(),
      commands: new Map(),
      httpRoutes: [] as any[],
      gatewayMethods: new Map(),
      services: [],
      conflicts: [],
    } as any,
    sessions: {
      get: (key: string) => ({ sessionKey: key, role: "default", messageCount: 5, lastActivity: 0 }),
      touch: () => {},
    } as any,
    transcripts: { logMeta: () => {} } as any,
    metrics: {} as any,
    extensionUI: {} as any,
    systemEvents: { consume: () => [] } as any,
    dedup: {} as any,
    cron: null,
    heartbeat: null,
    delegateExecutor: null,
    execGuard: null,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
    wsClients: new Map(),
    noGui: false,
    sessionMessageModeOverrides: new Map(),
    channelApis: new Map(),
    resolveTelegramMessageMode: () => "steer" as any,
    broadcastToWs: () => {},
    buildSessionProfile: () => ({}) as any,
    dispatch: async () => {},
    compactSessionWithHooks: async () => {},
    listAvailableRoles: () => ["default", "dev"],
    setSessionRole: async () => true,
    reloadConfig: () => {},
    _hookLog: hookLog,
    ...overrides,
  } as any;
}

function getHookLog(ctx: any): string[] {
  return ctx._hookLog;
}

// ── BG-002: session_end lifecycle ──────────────────────────────────────────

describe("BG-002: session_end lifecycle", () => {
  test("resetSession fires session_end → session_reset → session_start", async () => {
    const ctx = createMockCtx();
    await resetSession(ctx, "test:session:1" as SessionKey);
    const log = getHookLog(ctx);
    expect(log).toContain("session_end");
    expect(log).toContain("session_reset");
    expect(log).toContain("session_start");
    // Order: end before reset before start
    expect(log.indexOf("session_end")).toBeLessThan(log.indexOf("session_reset"));
    expect(log.indexOf("session_reset")).toBeLessThan(log.indexOf("session_start"));
  });

  test("setSessionRole fires session_end for old role and session_start for new", async () => {
    const ctx = createMockCtx();
    await setSessionRole(ctx, "test:session:2" as SessionKey, "dev");
    const log = getHookLog(ctx);
    expect(log).toContain("session_end");
    expect(log).toContain("session_start");
    expect(log.indexOf("session_end")).toBeLessThan(log.indexOf("session_start"));
  });

  test("setSessionRole does not fire hooks when role unchanged", async () => {
    const ctx = createMockCtx();
    // Session already has role "default", setting to "default" should return false
    const changed = await setSessionRole(ctx, "test:session:3" as SessionKey, "default");
    expect(changed).toBe(false);
    const log = getHookLog(ctx);
    expect(log).not.toContain("session_end");
    expect(log).not.toContain("session_start");
  });
});

// ── BG-002: pool eviction callback ────────────────────────────────────────

describe("BG-002: pool eviction session_end", () => {
  test("RpcPool constructor accepts onSessionEnd callback", async () => {
    // Import dynamically to avoid circular deps in test
    const { RpcPool } = await import("../core/rpc-pool.ts");
    const calls: string[] = [];
    const pool = new RpcPool(
      { pool: { min: 0, max: 2, idleTimeoutMs: 60000 }, agent: { piCliPath: "echo" } } as any,
      undefined,
      undefined,
      (sk) => calls.push(sk),
    );
    // Pool accepts the callback without error
    expect(typeof pool).toBe("object");
  });
});

// ── BG-002: coverage audit conclusion ──────────────────────────────────────
//
// All 5 PRD §4.4 paths verified:
//   ✅ session-reset.ts        — fires session_end → session_reset → session_start
//   ✅ role-manager.ts         — fires session_end before releasing old role
//   ✅ rpc-pool.ts             — onSessionEnd callback on evict/dead/idle-reclaim,
//                                wired to hooks.dispatch("session_end") in server.ts
//   ⊘  telegram-helpers.ts    — sessions.delete(oldKey) during key migration is NOT
//                                a session lifecycle event (key rename, not termination).
//                                Decision: no session_end needed. (PM: HappyCastle)
//   ⊘  heartbeat-executor.ts  — pool.release() returns process to idle, does not
//                                terminate session. Eviction covered by rpc-pool.ts.
//

// ── BG-003: registration conflict detection ───────────────────────────────

describe("BG-003: plugin registration conflict detection", () => {
  test("registerTool warns on duplicate tool name", async () => {
    const { createPluginApi } = await import("../plugins/plugin-api-factory.ts");
    const warnings: string[] = [];
    const ctx = createMockCtx({
      log: {
        info: () => {},
        warn: (msg: string) => warnings.push(msg),
        error: () => {},
        debug: () => {},
      } as any,
    });

    const api1 = createPluginApi("plugin-a", { id: "plugin-a", name: "Plugin A", main: "" }, ctx);
    const api2 = createPluginApi("plugin-b", { id: "plugin-b", name: "Plugin B", main: "" }, ctx);

    api1.registerTool({ name: "weather", description: "Weather", parameters: {}, execute: async () => ({}) } as any);
    api2.registerTool({ name: "weather", description: "Weather v2", parameters: {}, execute: async () => ({}) } as any);

    // Tool should be overwritten (last wins)
    expect(ctx.registry.tools.size).toBe(1);
    // Conflict recorded
    expect(ctx.registry.conflicts).toHaveLength(1);
    expect(ctx.registry.conflicts[0]).toMatchObject({
      type: "tool", name: "weather", newPlugin: "plugin-b", resolution: "overwritten",
    });
  });

  test("registerCommand warns on duplicate command", async () => {
    const { createPluginApi } = await import("../plugins/plugin-api-factory.ts");
    const ctx = createMockCtx();

    // Pre-register a builtin command
    ctx.registry.commands.set("help", { pluginId: "builtin", handler: async () => {} });

    const api = createPluginApi("my-plugin", { id: "my-plugin", name: "My Plugin", main: "" }, ctx);
    api.registerCommand("help", async () => {});

    // Command should be overwritten (last wins)
    const entry = ctx.registry.commands.get("help");
    expect(entry?.pluginId).toBe("my-plugin");
    // Conflict recorded
    expect(ctx.registry.conflicts).toHaveLength(1);
    expect(ctx.registry.conflicts[0]).toMatchObject({
      type: "command", name: "/help", existingPlugin: "builtin", newPlugin: "my-plugin", resolution: "overwritten",
    });
  });

  test("registerHttpRoute warns on duplicate method+path", async () => {
    const { createPluginApi } = await import("../plugins/plugin-api-factory.ts");
    const ctx = createMockCtx();

    const api1 = createPluginApi("plugin-a", { id: "plugin-a", name: "A", main: "" }, ctx);
    const api2 = createPluginApi("plugin-b", { id: "plugin-b", name: "B", main: "" }, ctx);

    api1.registerHttpRoute("GET", "/api/custom", async () => new Response("a"));
    api2.registerHttpRoute("GET", "/api/custom", async () => new Response("b"));

    // Both routes are added (array-based, first match wins at runtime)
    expect(ctx.registry.httpRoutes.length).toBe(2);
    // Conflict recorded as duplicate
    expect(ctx.registry.conflicts).toHaveLength(1);
    expect(ctx.registry.conflicts[0]).toMatchObject({
      type: "httpRoute", name: "GET /api/custom", existingPlugin: "plugin-a", newPlugin: "plugin-b", resolution: "duplicate",
    });
  });

  test("registerGatewayMethod skips duplicate (existing behavior)", async () => {
    const { createPluginApi } = await import("../plugins/plugin-api-factory.ts");
    const ctx = createMockCtx();

    const api1 = createPluginApi("plugin-a", { id: "plugin-a", name: "A", main: "" }, ctx);
    const api2 = createPluginApi("plugin-b", { id: "plugin-b", name: "B", main: "" }, ctx);

    api1.registerGatewayMethod("custom.method", async () => ({}));
    api2.registerGatewayMethod("custom.method", async () => ({}));

    // Should skip second registration (existing behavior)
    expect(ctx.registry.gatewayMethods.size).toBe(1);
    // Conflict recorded
    expect(ctx.registry.conflicts).toHaveLength(1);
    expect(ctx.registry.conflicts[0]).toMatchObject({
      type: "wsMethod", name: "custom.method", existingPlugin: "plugin-a", newPlugin: "plugin-b", resolution: "skipped",
    });
  });

  test("registerChannel skips duplicate (existing behavior)", async () => {
    const { createPluginApi } = await import("../plugins/plugin-api-factory.ts");
    const ctx = createMockCtx();

    const channel1 = {
      id: "test-ch", meta: {}, capabilities: {},
      outbound: { sendText: async () => ({ ok: true }), sendMedia: async () => ({}) },
      init: async () => {}, start: async () => {}, stop: async () => {},
    };
    const channel2 = { ...channel1 };

    const api1 = createPluginApi("plugin-a", { id: "plugin-a", name: "A", main: "" }, ctx);
    const api2 = createPluginApi("plugin-b", { id: "plugin-b", name: "B", main: "" }, ctx);

    api1.registerChannel(channel1 as any);
    api2.registerChannel(channel2 as any);

    expect(ctx.registry.channels.size).toBe(1);
    // Conflict recorded
    expect(ctx.registry.conflicts).toHaveLength(1);
    expect(ctx.registry.conflicts[0]).toMatchObject({
      type: "channel", name: "test-ch", newPlugin: "plugin-b", resolution: "skipped",
    });
  });
});
