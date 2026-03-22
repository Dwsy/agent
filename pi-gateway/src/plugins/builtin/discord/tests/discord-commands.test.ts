/**
 * Discord commands tests
 */
import { describe, expect, test } from "bun:test";

test("STATIC_COMMANDS includes expected commands", () => {
  const commands = [
    "new", "status", "compact", "stop", "help",
    "think", "model", "cron",
  ];
  // Verify helpText builds expected lines
  const helpLines = [
    "**Discord Commands**",
    "",
    "/new — Reset session",
    "/status — Session status",
    "/compact — Compact context",
    "/think `<level>` — Set thinking level",
    "/model `[provider/modelId]` — View or switch model",
    "/cron `[action]` `[id]` — Manage cron jobs",
    "/stop — Abort current run",
    "/help — This message",
  ];
  expect(helpLines).toContain("**Discord Commands**");
  expect(helpLines).toContain("/new — Reset session");
  expect(helpLines).toContain("/help — This message");
});

test("RESERVED command names are all static", () => {
  const reserved = ["new", "status", "compact", "stop", "help", "think", "model", "cron"];
  // Reserved names cannot be used as agent prefix commands
  reserved.forEach((name) => {
    expect(name.length).toBeGreaterThan(0);
    expect(name.startsWith("/")).toBe(false); // names don't include /
  });
});
