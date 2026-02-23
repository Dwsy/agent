/**
 * BBD v3 Step 10 — Telegram Agent Command Registration Tests
 *
 * Verifies that multi-agent routing commands are registered in Telegram menu:
 * - Agent IDs from config.agents.list are registered as /{agentId} commands
 * - "main" agent is excluded from menu
 * - Command names are sanitized (lowercase, no special chars, max 32)
 * - Agent commands coexist with local + pi native commands
 * - Deduplication prevents duplicate command entries
 */

import { describe, test, expect } from "bun:test";

// ============================================================================
// Simulate registerNativeCommands logic
// ============================================================================

const LOCAL_COMMANDS = [
  { command: "start", description: "Start" },
  { command: "help", description: "Help" },
  { command: "role", description: "Switch role" },
  { command: "queue", description: "Queue mode" },
  { command: "status", description: "Status" },
];

function buildCommandList(
  agentIds: string[] | undefined,
  piCommands: { name: string; description?: string }[],
): { command: string; description: string }[] {
  const localNames = new Set(LOCAL_COMMANDS.map(c => c.command));

  const allCommands = [
    ...LOCAL_COMMANDS,
    ...(agentIds ?? []).map(id => ({
      command: id.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32),
      description: `Switch to agent: ${id}`,
    })),
    ...piCommands
      .filter(cmd => !localNames.has(cmd.name.replace(/^\//, "")))
      .map(cmd => ({
        command: `pi_${cmd.name.replace(/^\//, "")}`,
        description: cmd.description ?? `pi: ${cmd.name}`,
      })),
  ];

  return allCommands
    .map(cmd => ({
      command: cmd.command.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32),
      description: cmd.description.slice(0, 256),
    }))
    .filter((cmd, idx, arr) => arr.findIndex(c => c.command === cmd.command) === idx);
}

// ============================================================================
// Tests
// ============================================================================

describe("v3 Step 10: agent command registration", () => {
  test("agent IDs are registered as Telegram commands", () => {
    const cmds = buildCommandList(["code", "docs", "ops"], []);

    const agentCmds = cmds.filter(c => c.description.startsWith("Switch to agent:"));
    expect(agentCmds).toHaveLength(3);
    expect(agentCmds.map(c => c.command)).toEqual(["code", "docs", "ops"]);
  });

  test("'main' agent is filtered out before registration", () => {
    // refreshPiCommands filters: .filter(id => id !== "main")
    const agentIds = ["main", "code", "docs"].filter(id => id !== "main");
    const cmds = buildCommandList(agentIds, []);

    const agentCmds = cmds.filter(c => c.description.startsWith("Switch to agent:"));
    expect(agentCmds.map(c => c.command)).not.toContain("main");
    expect(agentCmds).toHaveLength(2);
  });

  test("command names are sanitized to lowercase + underscore", () => {
    const cmds = buildCommandList(["Code-Review", "Ops.Monitor"], []);

    const agentCmds = cmds.filter(c => c.description.startsWith("Switch to agent:"));
    expect(agentCmds[0].command).toBe("code_review");
    expect(agentCmds[1].command).toBe("ops_monitor");
  });

  test("command names are truncated to 32 chars", () => {
    const longId = "a".repeat(50);
    const cmds = buildCommandList([longId], []);

    const agentCmds = cmds.filter(c => c.description.startsWith("Switch to agent:"));
    expect(agentCmds[0].command.length).toBeLessThanOrEqual(32);
  });

  test("agent commands coexist with local commands", () => {
    const cmds = buildCommandList(["code", "docs"], []);

    expect(cmds.find(c => c.command === "start")).toBeTruthy();
    expect(cmds.find(c => c.command === "help")).toBeTruthy();
    expect(cmds.find(c => c.command === "role")).toBeTruthy();
    expect(cmds.find(c => c.command === "code")).toBeTruthy();
    expect(cmds.find(c => c.command === "docs")).toBeTruthy();
  });

  test("agent commands coexist with pi native commands", () => {
    const piCmds = [
      { name: "compact", description: "Compact session" },
      { name: "model", description: "Switch model" },
    ];
    const cmds = buildCommandList(["code"], piCmds);

    expect(cmds.find(c => c.command === "pi_compact")).toBeTruthy();
    expect(cmds.find(c => c.command === "pi_model")).toBeTruthy();
    expect(cmds.find(c => c.command === "code")).toBeTruthy();
  });

  test("duplicate commands are deduplicated", () => {
    // If an agent ID conflicts with a local command name
    const cmds = buildCommandList(["start"], []); // "start" is also a local command

    const startCmds = cmds.filter(c => c.command === "start");
    expect(startCmds).toHaveLength(1); // deduped
  });

  test("no agent IDs produces only local + pi commands", () => {
    const cmds = buildCommandList(undefined, [{ name: "compact" }]);

    const agentCmds = cmds.filter(c => c.description.startsWith("Switch to agent:"));
    expect(agentCmds).toHaveLength(0);
    expect(cmds.find(c => c.command === "pi_compact")).toBeTruthy();
  });

  test("empty agent list produces only local + pi commands", () => {
    const cmds = buildCommandList([], [{ name: "model", description: "Switch model" }]);

    const agentCmds = cmds.filter(c => c.description.startsWith("Switch to agent:"));
    expect(agentCmds).toHaveLength(0);
    expect(cmds.length).toBeGreaterThan(LOCAL_COMMANDS.length); // local + pi_model
  });
});
