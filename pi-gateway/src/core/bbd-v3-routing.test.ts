/**
 * BBD v3 Phase 2 — Multi-Agent Routing Tests (Skeleton)
 *
 * Covers v3 Step 2/3:
 * - Layer 1: Static binding routing (channel/peer/account)
 * - Layer 2: Prefix command routing (/code, /docs, /ops)
 * - Layer 3: Default agent fallback
 * - Binding priority: peer > account > channel > default
 *
 * Status: SKELETON — fill in when GoldJaguar completes Step 2/3
 */

import { describe, test, expect } from "bun:test";
import type { AgentBinding, AgentsConfig } from "../core/config.ts";

// ============================================================================
// Helpers — routing logic simulation (replace with real imports when ready)
// ============================================================================

interface RoutingSource {
  channel: string;
  accountId?: string;
  chatType: "dm" | "group";
  chatId: string;
}

/**
 * Simulate Layer 1 static binding resolution.
 * Priority: peer (kind+id) > account > channel > default
 */
function resolveStaticBinding(
  bindings: AgentBinding[],
  source: RoutingSource,
  defaultAgent: string,
): string {
  // Pass 1: peer match (highest priority)
  for (const b of bindings) {
    if (
      b.match.peer?.kind === source.chatType &&
      b.match.peer?.id === source.chatId &&
      (!b.match.channel || b.match.channel === source.channel)
    ) {
      return b.agentId;
    }
  }

  // Pass 2: account match
  for (const b of bindings) {
    if (
      b.match.accountId === source.accountId &&
      (!b.match.channel || b.match.channel === source.channel) &&
      !b.match.peer
    ) {
      return b.agentId;
    }
  }

  // Pass 3: channel match
  for (const b of bindings) {
    if (
      b.match.channel === source.channel &&
      !b.match.accountId &&
      !b.match.peer
    ) {
      return b.agentId;
    }
  }

  // Layer 3: default
  return defaultAgent;
}

/**
 * Simulate Layer 2 prefix command extraction.
 * Returns { agentId, task } if prefix matches, null otherwise.
 */
function extractPrefixCommand(
  text: string,
  agentIds: string[],
): { agentId: string; task: string } | null {
  const match = text.match(/^\/(\w+)\s+(.*)/s);
  if (!match) return null;

  const prefix = match[1];
  const task = match[2].trim();

  if (agentIds.includes(prefix)) {
    return { agentId: prefix, task };
  }

  return null;
}

// ============================================================================
// Layer 1: Static Binding
// ============================================================================

describe("v3 routing: Layer 1 static binding", () => {
  const bindings: AgentBinding[] = [
    { agentId: "code", match: { channel: "telegram", peer: { kind: "group", id: "-1001234" } } },
    { agentId: "ops", match: { channel: "telegram", peer: { kind: "group", id: "-1005678" } } },
    { agentId: "docs", match: { channel: "discord" } },
    { agentId: "support", match: { accountId: "bot-support" } },
  ];

  test("peer binding matches group chat ID", () => {
    const agent = resolveStaticBinding(bindings, {
      channel: "telegram",
      chatType: "group",
      chatId: "-1001234",
    }, "main");

    expect(agent).toBe("code");
  });

  test("different group routes to different agent", () => {
    const agent = resolveStaticBinding(bindings, {
      channel: "telegram",
      chatType: "group",
      chatId: "-1005678",
    }, "main");

    expect(agent).toBe("ops");
  });

  test("channel-only binding matches any chat on that channel", () => {
    const agent = resolveStaticBinding(bindings, {
      channel: "discord",
      chatType: "dm",
      chatId: "user-abc",
    }, "main");

    expect(agent).toBe("docs");
  });

  test("account binding matches specific bot account", () => {
    const agent = resolveStaticBinding(bindings, {
      channel: "telegram",
      accountId: "bot-support",
      chatType: "dm",
      chatId: "user-xyz",
    }, "main");

    expect(agent).toBe("support");
  });

  test("peer binding takes priority over channel binding", () => {
    // Add a channel-level telegram binding
    const extBindings: AgentBinding[] = [
      ...bindings,
      { agentId: "general-tg", match: { channel: "telegram" } },
    ];

    // Group -1001234 should still match peer binding (code), not channel binding (general-tg)
    const agent = resolveStaticBinding(extBindings, {
      channel: "telegram",
      chatType: "group",
      chatId: "-1001234",
    }, "main");

    expect(agent).toBe("code");
  });

  test("unmatched source falls back to default", () => {
    const agent = resolveStaticBinding(bindings, {
      channel: "webchat",
      chatType: "dm",
      chatId: "anon-1",
    }, "main");

    expect(agent).toBe("main");
  });

  test("empty bindings always returns default", () => {
    const agent = resolveStaticBinding([], {
      channel: "telegram",
      chatType: "dm",
      chatId: "user-1",
    }, "fallback");

    expect(agent).toBe("fallback");
  });
});

// ============================================================================
// Layer 2: Prefix Command
// ============================================================================

describe("v3 routing: Layer 2 prefix command", () => {
  const agentIds = ["code", "docs", "ops"];

  test("/code extracts code agent + task", () => {
    const result = extractPrefixCommand("/code review this PR", agentIds);

    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("code");
    expect(result!.task).toBe("review this PR");
  });

  test("/docs extracts docs agent + task", () => {
    const result = extractPrefixCommand("/docs explain the API", agentIds);

    expect(result!.agentId).toBe("docs");
    expect(result!.task).toBe("explain the API");
  });

  test("unknown prefix returns null (not a routing command)", () => {
    const result = extractPrefixCommand("/unknown do something", agentIds);

    expect(result).toBeNull();
  });

  test("no prefix returns null", () => {
    const result = extractPrefixCommand("just a normal message", agentIds);

    expect(result).toBeNull();
  });

  test("prefix without task extracts empty task", () => {
    const result = extractPrefixCommand("/code ", agentIds);

    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("code");
    expect(result!.task).toBe("");
  });

  test("prefix command overrides static binding", () => {
    // Simulate: message from discord (static → docs), but /code prefix
    const staticAgent = resolveStaticBinding(
      [{ agentId: "docs", match: { channel: "discord" } }],
      { channel: "discord", chatType: "dm", chatId: "user-1" },
      "main",
    );
    expect(staticAgent).toBe("docs");

    // Prefix override
    const prefix = extractPrefixCommand("/code fix the bug", agentIds);
    const finalAgent = prefix?.agentId ?? staticAgent;

    expect(finalAgent).toBe("code"); // prefix wins
  });
});

// ============================================================================
// Layer 3: Default Fallback
// ============================================================================

describe("v3 routing: Layer 3 default fallback", () => {
  test("default agent used when no binding and no prefix", () => {
    const config: AgentsConfig = {
      list: [
        { id: "code", workspace: "~/code" },
        { id: "docs", workspace: "~/docs" },
      ],
      default: "code",
    };

    const staticAgent = resolveStaticBinding([], {
      channel: "webchat",
      chatType: "dm",
      chatId: "anon",
    }, config.default);

    const prefix = extractPrefixCommand("hello world", config.list.map(a => a.id));

    const finalAgent = prefix?.agentId ?? staticAgent;
    expect(finalAgent).toBe("code");
  });
});

// ============================================================================
// Full routing pipeline
// ============================================================================

describe("v3 routing: full pipeline", () => {
  const config: AgentsConfig = {
    list: [
      { id: "code", workspace: "~/code" },
      { id: "docs", workspace: "~/docs" },
      { id: "ops", workspace: "~/ops" },
    ],
    default: "code",
    bindings: [
      { agentId: "ops", match: { channel: "telegram", peer: { kind: "group", id: "-100ops" } } },
      { agentId: "docs", match: { channel: "discord" } },
    ],
  };

  const route = (source: RoutingSource, text: string): string => {
    const prefix = extractPrefixCommand(text, config.list.map(a => a.id));
    if (prefix) return prefix.agentId;

    return resolveStaticBinding(config.bindings!, source, config.default);
  };

  test("telegram DM with no prefix → default (code)", () => {
    expect(route({ channel: "telegram", chatType: "dm", chatId: "user-1" }, "hello")).toBe("code");
  });

  test("telegram ops group → ops (static binding)", () => {
    expect(route({ channel: "telegram", chatType: "group", chatId: "-100ops" }, "check status")).toBe("ops");
  });

  test("telegram ops group with /docs prefix → docs (prefix overrides)", () => {
    expect(route({ channel: "telegram", chatType: "group", chatId: "-100ops" }, "/docs explain API")).toBe("docs");
  });

  test("discord DM → docs (channel binding)", () => {
    expect(route({ channel: "discord", chatType: "dm", chatId: "user-2" }, "help me")).toBe("docs");
  });

  test("webchat → default (code)", () => {
    expect(route({ channel: "webchat", chatType: "dm", chatId: "anon" }, "hi")).toBe("code");
  });
});
