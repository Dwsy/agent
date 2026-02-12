/**
 * v3.3 System Prompt Architecture Tests — SP-10 ~ SP-28
 *
 * Tests the three-layer prompt system:
 * - Layer 1: Gateway Identity (always injected unless identity=false)
 * - Layer 2: Capability Prompts (conditional per feature)
 * - Config overrides via gatewayPrompts
 * - Final assembly and segment ordering
 */

import { describe, test, expect } from "bun:test";
import {
  buildGatewaySystemPrompt,
  buildGatewayIdentityPrompt,
  buildDelegationSegment,
  buildChannelSegment,
} from "./system-prompts.ts";
import type { Config } from "./config.ts";

// ============================================================================
// Helpers
// ============================================================================

/** Minimal config with nothing enabled */
function bareConfig(overrides?: Partial<Config>): Config {
  return {
    port: 18789,
    host: "0.0.0.0",
    auth: { mode: "none" },
    channels: {},
    hooks: { enabled: false },
    pool: { min: 1, max: 4, idleTimeoutMs: 300_000 },
    queue: {},
    agent: { gatewayPrompts: {} },
    delegation: { timeoutMs: 120_000, maxTimeoutMs: 600_000, onTimeout: "abort", maxDepth: 1, maxConcurrent: 2 },
    ...overrides,
  } as Config;
}

/** Config with Telegram enabled */
function telegramConfig(overrides?: Partial<Config>): Config {
  return bareConfig({
    channels: { telegram: { enabled: true, accounts: { default: { botToken: "fake", allowFrom: [] } } } },
    ...overrides,
  } as any);
}

/** Config with multiple agents */
function multiAgentConfig(overrides?: Partial<Config>): Config {
  return bareConfig({
    agents: {
      default: "main",
      list: [
        { id: "main", workspace: "/tmp/main" },
        { id: "helper", workspace: "/tmp/helper" },
      ],
    },
    ...overrides,
  });
}

// ============================================================================
// Layer 1: Gateway Identity
// ============================================================================

describe("Layer 1: Gateway Identity", () => {
  test("SP-10: identity prompt includes runtime line", () => {
    const config = bareConfig();
    const result = buildGatewayIdentityPrompt(config, { agentId: "main", hostname: "test-host" });
    expect(result).toContain("## Gateway Environment");
    expect(result).toContain("agent=main");
    expect(result).toContain("host=test-host");
    expect(result).toContain("gateway=pi-gateway");
  });

  test("SP-11: identity prompt uses config defaults when no context", () => {
    const config = bareConfig({ agents: { default: "alpha", list: [{ id: "alpha", workspace: "/tmp" }] } });
    const result = buildGatewayIdentityPrompt(config);
    expect(result).toContain("agent=alpha");
    expect(result).toContain("agents=1");
  });

  test("SP-12: identity prompt lists enabled capabilities", () => {
    const config = bareConfig({
      heartbeat: { enabled: true, every: "1m" } as any,
      cron: { enabled: true },
      channels: { telegram: { enabled: true, accounts: { default: { botToken: "t", allowFrom: [] } } } },
      agents: { default: "main", list: [{ id: "main", workspace: "/tmp" }, { id: "b", workspace: "/tmp" }] },
    });
    const result = buildGatewayIdentityPrompt(config);
    expect(result).toContain("capabilities=heartbeat,cron,media,delegation");
  });

  test("SP-13: identity prompt omits capabilities line when none enabled", () => {
    const config = bareConfig();
    const result = buildGatewayIdentityPrompt(config);
    expect(result).not.toContain("capabilities=");
  });

  test("SP-14: identity=false suppresses Layer 1", () => {
    const config = telegramConfig({ agent: { gatewayPrompts: { identity: false } } as any });
    const result = buildGatewaySystemPrompt(config);
    expect(result).not.toContain("## Gateway Environment");
    // But media segment should still be present
    expect(result).toContain("## Gateway: Media & Message Tools");
  });
});

// ============================================================================
// Layer 2: Heartbeat
// ============================================================================

describe("Layer 2: Heartbeat", () => {
  test("SP-15: heartbeat segment injected when heartbeat.enabled=true", () => {
    const config = bareConfig({ heartbeat: { enabled: true, every: "1m" } as any });
    const result = buildGatewaySystemPrompt(config);
    expect(result).toContain("## Gateway: Heartbeat Protocol");
    expect(result).toContain("HEARTBEAT_OK");
  });

  test("SP-16: heartbeat segment NOT injected when heartbeat.enabled=false", () => {
    const config = bareConfig({ heartbeat: { enabled: false, every: "1m" } as any });
    const result = buildGatewaySystemPrompt(config);
    // May be null or not contain heartbeat
    if (result) expect(result).not.toContain("## Gateway: Heartbeat Protocol");
  });

  test("SP-17: alwaysHeartbeat=true injects heartbeat even when disabled", () => {
    const config = bareConfig({
      heartbeat: { enabled: false, every: "1m" } as any,
      agent: { gatewayPrompts: { alwaysHeartbeat: true } } as any,
    });
    const result = buildGatewaySystemPrompt(config);
    expect(result).toContain("## Gateway: Heartbeat Protocol");
  });
});

// ============================================================================
// Layer 2: Cron
// ============================================================================

describe("Layer 2: Cron", () => {
  test("SP-18: cron segment injected when cron.enabled=true", () => {
    const config = bareConfig({ cron: { enabled: true } });
    const result = buildGatewaySystemPrompt(config);
    expect(result).toContain("## Gateway: Scheduled Tasks");
    expect(result).toContain("/cron list");
  });

  test("SP-19: cron segment NOT injected when cron.enabled=false", () => {
    const config = bareConfig({ cron: { enabled: false } });
    const result = buildGatewaySystemPrompt(config);
    if (result) expect(result).not.toContain("## Gateway: Scheduled Tasks");
  });
});

// ============================================================================
// Layer 2: Media
// ============================================================================

describe("Layer 2: Media", () => {
  test("SP-20: media segment injected when channel active", () => {
    const config = telegramConfig();
    const result = buildGatewaySystemPrompt(config);
    expect(result).toContain("## Gateway: Media & Message Tools");
    expect(result).toContain("MEDIA:<relative-path>");
  });

  test("SP-21: media segment NOT injected when no channels", () => {
    const config = bareConfig();
    const result = buildGatewaySystemPrompt(config);
    if (result) expect(result).not.toContain("## Gateway: Media & Message Tools");
  });
});

// ============================================================================
// Layer 2: Delegation
// ============================================================================

describe("Layer 2: Delegation", () => {
  test("SP-22: delegation segment injected when multiple agents", () => {
    const config = multiAgentConfig();
    const result = buildGatewaySystemPrompt(config);
    expect(result).toContain("## Gateway: Agent Delegation");
    expect(result).toContain("main");
    expect(result).toContain("helper");
  });

  test("SP-23: delegation segment NOT injected for single agent", () => {
    const config = bareConfig({ agents: { default: "main", list: [{ id: "main", workspace: "/tmp" }] } });
    const result = buildGatewaySystemPrompt(config);
    if (result) expect(result).not.toContain("## Gateway: Agent Delegation");
  });

  test("SP-24: buildDelegationSegment includes constraints", () => {
    const config = multiAgentConfig();
    const segment = buildDelegationSegment(config);
    expect(segment).not.toBeNull();
    expect(segment!).toContain("Timeout: 120s");
    expect(segment!).toContain("Max chain depth: 1");
    expect(segment!).toContain("Max concurrent: 2");
  });
});

// ============================================================================
// Layer 2: Channel Hints
// ============================================================================

describe("Layer 2: Channel Hints", () => {
  test("SP-25: Telegram hints included when Telegram enabled", () => {
    const config = telegramConfig();
    const segment = buildChannelSegment(config);
    expect(segment).toContain("### Telegram");
    expect(segment).toContain("4096");
  });

  test("SP-26: Discord hints included when Discord enabled", () => {
    const config = bareConfig({ channels: { discord: { enabled: true, token: "fake" } } });
    const segment = buildChannelSegment(config);
    expect(segment).toContain("### Discord");
    expect(segment).toContain("2000");
  });

  test("SP-27: WebChat hints always included", () => {
    const config = bareConfig();
    const segment = buildChannelSegment(config);
    expect(segment).toContain("### WebChat");
    expect(segment).toContain("lightbox");
  });
});

// ============================================================================
// Full Assembly
// ============================================================================

describe("Full Assembly", () => {
  test("SP-28: all features enabled produces all segments in order", () => {
    const config = bareConfig({
      heartbeat: { enabled: true, every: "1m" } as any,
      cron: { enabled: true },
      channels: { telegram: { enabled: true, accounts: { default: { botToken: "t", allowFrom: [] } } } },
      agents: { default: "main", list: [{ id: "main", workspace: "/tmp" }, { id: "helper", workspace: "/tmp" }] },
    });
    const result = buildGatewaySystemPrompt(config)!;
    expect(result).not.toBeNull();

    // Verify all segments present
    expect(result).toContain("## Gateway Environment");
    expect(result).toContain("## Gateway: Heartbeat Protocol");
    expect(result).toContain("## Gateway: Scheduled Tasks");
    expect(result).toContain("## Gateway: Media & Message Tools");
    expect(result).toContain("## Gateway: Agent Delegation");
    expect(result).toContain("## Gateway: Channel Formatting");

    // Verify ordering: identity before capabilities
    const idxIdentity = result.indexOf("## Gateway Environment");
    const idxHeartbeat = result.indexOf("## Gateway: Heartbeat Protocol");
    const idxCron = result.indexOf("## Gateway: Scheduled Tasks");
    const idxMedia = result.indexOf("## Gateway: Media & Message Tools");
    expect(idxIdentity).toBeLessThan(idxHeartbeat);
    expect(idxHeartbeat).toBeLessThan(idxCron);
    expect(idxCron).toBeLessThan(idxMedia);
  });

  test("SP-29: no features enabled returns null", () => {
    const config = bareConfig({ agent: { gatewayPrompts: { identity: false } } as any });
    const result = buildGatewaySystemPrompt(config);
    expect(result).toBeNull();
  });

  test("SP-30: config overrides can force-disable individual segments", () => {
    const config = telegramConfig({
      heartbeat: { enabled: true, every: "1m" } as any,
      agent: { gatewayPrompts: { heartbeat: false, channel: false } } as any,
    });
    const result = buildGatewaySystemPrompt(config)!;
    expect(result).toContain("## Gateway Environment"); // identity still on
    expect(result).toContain("## Gateway: Media & Message Tools"); // media still on
    expect(result).not.toContain("## Gateway: Heartbeat Protocol"); // forced off
    expect(result).not.toContain("## Gateway: Channel Formatting"); // forced off
  });
});
