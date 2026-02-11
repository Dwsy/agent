/**
 * BBD v3 Phase 2 — Multi-Agent Routing Integration Tests
 *
 * Tests real resolveAgentId() from session-router.ts:
 * - Layer 1: Static binding (score-based: peer>guild>account>channel)
 * - Layer 2: Prefix command (/code, /docs, /ops)
 * - Layer 3: Default agent fallback
 * - Full pipeline: Layer 1 → Layer 2 → Layer 3
 */

import { describe, test, expect } from "bun:test";
import { resolveAgentId } from "./session-router.ts";
import type { Config, AgentBinding } from "./config.ts";
import type { MessageSource } from "./types.ts";

// ============================================================================
// Helpers
// ============================================================================

function makeConfig(
  agents: { id: string; workspace: string }[],
  defaultAgent: string,
  bindings?: AgentBinding[],
): Config {
  return {
    agents: {
      list: agents.map(a => ({ ...a })),
      default: defaultAgent,
      bindings,
    },
    gateway: { port: 18789, bind: "0.0.0.0", auth: { mode: "off" } },
    agent: { piCliPath: "pi", model: "test", thinkingLevel: "off", pool: { min: 1, max: 4, idleTimeoutMs: 300000 } },
    session: { dmScope: "main" },
    channels: {},
    plugins: { dirs: [], disabled: [] },
    roles: { workspaceDirs: {} },
    hooks: { enabled: false },
    cron: { enabled: false, jobs: [] },
    queue: {
      maxPerSession: 15, globalMaxPending: 100, collectDebounceMs: 1500,
      poolWaitTtlMs: 30000, mode: "collect", dropPolicy: "old",
      dedup: { enabled: true, cacheSize: 1000, ttlMs: 60000 },
      priority: { dm: 10, group: 5, webhook: 3, allowlistBonus: 2 },
    },
  } as any;
}

function makeSource(overrides?: Partial<MessageSource>): MessageSource {
  return {
    channel: "telegram",
    accountId: "default",
    chatType: "dm",
    chatId: "user-1",
    senderId: "user-1",
    ...overrides,
  };
}

const threeAgents = [
  { id: "code", workspace: "~/code" },
  { id: "docs", workspace: "~/docs" },
  { id: "ops", workspace: "~/ops" },
];

// ============================================================================
// Layer 1: Static Binding (score-based)
// ============================================================================

describe("v3 routing real: Layer 1 static binding", () => {
  test("peer binding matches group chat ID (score 8+1)", () => {
    const config = makeConfig(threeAgents, "code", [
      { agentId: "ops", match: { channel: "telegram", peer: { kind: "group", id: "-100ops" } } },
    ]);

    const result = resolveAgentId(
      makeSource({ channel: "telegram", chatType: "group", chatId: "-100ops" }),
      "check status",
      config,
    );

    expect(result.agentId).toBe("ops");
    expect(result.text).toBe("check status");
  });

  test("channel-only binding matches (score 1)", () => {
    const config = makeConfig(threeAgents, "code", [
      { agentId: "docs", match: { channel: "discord" } },
    ]);

    const result = resolveAgentId(
      makeSource({ channel: "discord", chatType: "dm", chatId: "user-2" }),
      "help me",
      config,
    );

    expect(result.agentId).toBe("docs");
  });

  test("account binding matches (score 2+1)", () => {
    const config = makeConfig(threeAgents, "code", [
      { agentId: "ops", match: { channel: "telegram", accountId: "bot-ops" } },
    ]);

    const result = resolveAgentId(
      makeSource({ channel: "telegram", accountId: "bot-ops" }),
      "deploy",
      config,
    );

    expect(result.agentId).toBe("ops");
  });

  test("peer binding beats channel binding (score 9 > 1)", () => {
    const config = makeConfig(threeAgents, "code", [
      { agentId: "general", match: { channel: "telegram" } },
      { agentId: "ops", match: { channel: "telegram", peer: { kind: "group", id: "-100ops" } } },
    ]);
    // Add "general" to agent list
    config.agents!.list.push({ id: "general", workspace: "~/general" });

    const result = resolveAgentId(
      makeSource({ channel: "telegram", chatType: "group", chatId: "-100ops" }),
      "status",
      config,
    );

    expect(result.agentId).toBe("ops"); // peer wins
  });

  test("unmatched source skips to next layer", () => {
    const config = makeConfig(threeAgents, "code", [
      { agentId: "ops", match: { channel: "telegram", peer: { kind: "group", id: "-100ops" } } },
    ]);

    const result = resolveAgentId(
      makeSource({ channel: "webchat", chatType: "dm", chatId: "anon" }),
      "hello",
      config,
    );

    // No binding match → falls through to Layer 2 (no prefix) → Layer 3 default
    expect(result.agentId).toBe("code");
  });

  test("empty bindings skips to next layer", () => {
    const config = makeConfig(threeAgents, "code", []);

    const result = resolveAgentId(
      makeSource(),
      "hello",
      config,
    );

    expect(result.agentId).toBe("code");
  });
});

// ============================================================================
// Layer 2: Prefix Command
// ============================================================================

describe("v3 routing real: Layer 2 prefix command", () => {
  test("/docs extracts agent and strips prefix", () => {
    const config = makeConfig(threeAgents, "code");

    const result = resolveAgentId(
      makeSource(),
      "/docs explain the API",
      config,
    );

    expect(result.agentId).toBe("docs");
    expect(result.text).toBe("explain the API");
  });

  test("/ops routes to ops agent", () => {
    const config = makeConfig(threeAgents, "code");

    const result = resolveAgentId(
      makeSource(),
      "/ops check server",
      config,
    );

    expect(result.agentId).toBe("ops");
    expect(result.text).toBe("check server");
  });

  test("unknown prefix is not treated as routing", () => {
    const config = makeConfig(threeAgents, "code");

    const result = resolveAgentId(
      makeSource(),
      "/unknown do something",
      config,
    );

    // /unknown is not in agent list → falls to default
    expect(result.agentId).toBe("code");
    expect(result.text).toBe("/unknown do something"); // text unchanged
  });

  test("no prefix → default agent", () => {
    const config = makeConfig(threeAgents, "code");

    const result = resolveAgentId(
      makeSource(),
      "just a normal message",
      config,
    );

    expect(result.agentId).toBe("code");
    expect(result.text).toBe("just a normal message");
  });

  test("prefix with no task gives empty text", () => {
    const config = makeConfig(threeAgents, "code");

    const result = resolveAgentId(
      makeSource(),
      "/code",
      config,
    );

    // /code with no following text
    expect(result.agentId).toBe("code");
    expect(result.text).toBe("");
  });
});

// ============================================================================
// Layer 1 + Layer 2 interaction
// ============================================================================

describe("v3 routing real: Layer 1 vs Layer 2 priority", () => {
  test("static binding takes priority over prefix when binding matches", () => {
    const config = makeConfig(threeAgents, "code", [
      { agentId: "ops", match: { channel: "telegram", peer: { kind: "group", id: "-100ops" } } },
    ]);

    // Message from ops group with /docs prefix
    const result = resolveAgentId(
      makeSource({ channel: "telegram", chatType: "group", chatId: "-100ops" }),
      "/docs explain API",
      config,
    );

    // Layer 1 matches first → ops (binding wins over prefix)
    expect(result.agentId).toBe("ops");
  });

  test("prefix works when no binding matches", () => {
    const config = makeConfig(threeAgents, "code", [
      { agentId: "ops", match: { channel: "telegram", peer: { kind: "group", id: "-100ops" } } },
    ]);

    // DM (no binding match) with /docs prefix
    const result = resolveAgentId(
      makeSource({ channel: "telegram", chatType: "dm", chatId: "user-1" }),
      "/docs explain API",
      config,
    );

    // No binding match → Layer 2 prefix → docs
    expect(result.agentId).toBe("docs");
    expect(result.text).toBe("explain API");
  });
});

// ============================================================================
// Layer 3: Default Fallback
// ============================================================================

describe("v3 routing real: Layer 3 default", () => {
  test("no agents config returns 'main' default", () => {
    const config = makeConfig([], "code");
    config.agents = undefined as any;

    const result = resolveAgentId(
      makeSource(),
      "hello",
      config,
    );

    expect(result.agentId).toBe("main"); // hardcoded DEFAULT_AGENT_ID
  });

  test("empty agent list returns 'main' default", () => {
    const config = makeConfig([], "code");
    config.agents!.list = [];

    const result = resolveAgentId(
      makeSource(),
      "hello",
      config,
    );

    expect(result.agentId).toBe("main");
  });
});

// ============================================================================
// Full pipeline
// ============================================================================

describe("v3 routing real: full pipeline", () => {
  const config = makeConfig(threeAgents, "code", [
    { agentId: "ops", match: { channel: "telegram", peer: { kind: "group", id: "-100ops" } } },
    { agentId: "docs", match: { channel: "discord" } },
  ]);

  test("telegram DM normal message → default (code)", () => {
    const r = resolveAgentId(makeSource({ channel: "telegram", chatType: "dm" }), "hello", config);
    expect(r.agentId).toBe("code");
  });

  test("telegram ops group → ops (binding)", () => {
    const r = resolveAgentId(makeSource({ channel: "telegram", chatType: "group", chatId: "-100ops" }), "status", config);
    expect(r.agentId).toBe("ops");
  });

  test("telegram DM /docs prefix → docs (prefix)", () => {
    const r = resolveAgentId(makeSource({ channel: "telegram", chatType: "dm" }), "/docs help", config);
    expect(r.agentId).toBe("docs");
    expect(r.text).toBe("help");
  });

  test("discord → docs (channel binding)", () => {
    const r = resolveAgentId(makeSource({ channel: "discord", chatType: "dm", chatId: "u1" }), "hi", config);
    expect(r.agentId).toBe("docs");
  });

  test("webchat → default (code)", () => {
    const r = resolveAgentId(makeSource({ channel: "webchat", chatType: "dm" }), "hi", config);
    expect(r.agentId).toBe("code");
  });
});
