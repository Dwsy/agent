import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.HERDR_ENV = "1";
process.env.HERDR_PANE_ID = "w1:p1";

const install = join(import.meta.dir, "../../install");
const version = readFileSync(join(install, "current-version"), "utf8").trim();
const { SessionManager } = await import(join(install, "releases", version, "node_modules/@earendil-works/pi-coding-agent/dist/index.js"));
mock.module("@earendil-works/pi-coding-agent", () => ({ SessionManager }));
const { default: extension } = await import("./index");

function setup(processes = [{ name: "node", argv0: "pi" }]) {
  const dir = mkdtempSync(join(tmpdir(), "fork-herdr-side-"));
  const source = join(dir, "source.jsonl");
  const entries = [
    { type: "session", version: 3, id: "source", timestamp: "2026-01-01T00:00:00.000Z", cwd: dir },
    { type: "message", id: "first", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "first", timestamp: 1 } },
    { type: "message", id: "selected", parentId: "first", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "user", content: "selected", timestamp: 2 } },
    { type: "message", id: "other", parentId: "first", timestamp: "2026-01-01T00:00:03.000Z", message: { role: "user", content: "other branch", timestamp: 3 } },
  ];
  writeFileSync(source, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const calls: string[][] = [];
  const notifications: [string, string][] = [];
  let handler: (args: string, ctx: any) => Promise<void>;
  extension({
    registerCommand(name: string, options: any) {
      expect(name).toBe("fork-herdr-side");
      handler = options.handler;
    },
    async exec(command: string, args: string[]) {
      if (command === "which") return { code: 0, stdout: `/usr/local/bin/${args[0]}\n`, stderr: "" };
      calls.push(args);
      if (args[1] === "process-info") return { code: 0, stdout: JSON.stringify({ result: { process_info: { foreground_processes: processes } } }), stderr: "" };
      if (args[1] === "split") return { code: 0, stdout: JSON.stringify({ result: { pane: { pane_id: "w1:p2" } } }), stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
  } as any);
  const ctx = {
    cwd: dir,
    sessionManager: { getSessionFile: () => source, getLeafId: () => "selected" },
    ui: { notify: (message: string, kind: string) => notifications.push([message, kind]) },
  };
  return { run: (args = "") => handler!(args, ctx), calls, notifications, source, dir };
}

describe("fork-herdr-side", () => {
  test("forks the selected branch on the right and starts pi", async () => {
    const s = setup();
    await s.run();
    const split = s.calls.find((call) => call[1] === "split")!;
    expect(split).toContain("right");
    expect(split).toContain("--no-focus");
    const run = s.calls.find((call) => call[1] === "run")!;
    expect(run[2]).toBe("w1:p2");
    expect(run[3]).toContain("'/usr/local/bin/pi' --session ");
    const path = run[3].match(/--session '([^']+)'/)![1];
    const fork = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(fork[0].parentSession).toBe(s.source);
    expect(fork.map((entry) => entry.id)).toContain("selected");
    expect(fork.map((entry) => entry.id)).not.toContain("other");
    expect(s.notifications.at(-1)?.[1]).toBe("info");
  });

  test("recognizes the grok-pi host around pi and places the pane on the left", async () => {
    const s = setup([{ name: "node", argv0: "pi" }, { name: "grok-pi", argv0: "pig" }]);
    await s.run("left");
    expect(s.calls.some((call) => call[1] === "swap" && call.includes("w1:p2"))).toBe(true);
    expect(s.calls.find((call) => call[1] === "run")![3]).toContain("'/usr/local/bin/grok-pi' --session ");
    expect(s.notifications.at(-1)?.[1]).toBe("info");
  });

  test("rejects invalid arguments before changing panes", async () => {
    const s = setup();
    await s.run("down");
    expect(s.calls).toHaveLength(0);
    expect(s.notifications.at(-1)?.[1]).toBe("error");
  });

  test("fails without creating a fork when the foreground host is unknown", async () => {
    const s = setup([{ name: "other", argv0: "other" }]);
    await s.run();
    expect(s.calls.some((call) => call[1] === "split")).toBe(false);
    expect(s.notifications.at(-1)?.[0]).toContain("Cannot identify");
  });

  test("fails outside Herdr without touching the session", async () => {
    const s = setup();
    const previous = process.env.HERDR_ENV;
    try {
      process.env.HERDR_ENV = "0";
      await s.run();
      expect(s.calls).toHaveLength(0);
      expect(s.notifications.at(-1)?.[0]).toContain("requires a Herdr pane");
    } finally {
      process.env.HERDR_ENV = previous;
    }
  });
});
