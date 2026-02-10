import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG, type Config } from "./core/config.ts";

const tempDirs: string[] = [];

describe("cli plugin command", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("runs registerCli command from external plugin", async () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gw-cli-test-"));
    tempDirs.push(root);

    const pluginsRoot = join(root, "plugins");
    const pluginDir = join(pluginsRoot, "cli-demo");
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(join(pluginDir, "plugin.json"), JSON.stringify({
      id: "cli-demo",
      name: "CLI Demo",
      main: "index.ts",
    }, null, 2));

    writeFileSync(join(pluginDir, "index.ts"), `
export default function register(api) {
  api.registerCli((program) => {
    program.command("hello-plugin", "demo plugin command", async (argv, flags) => {
      const first = argv[0] || "none";
      const mode = typeof flags.mode === "string" ? flags.mode : "none";
      console.log("PLUGIN_OK:" + first + ":" + mode);
    });
  });
}
`);

    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
    config.plugins.dirs = [pluginsRoot];
    config.session.dataDir = join(root, "sessions");
    const configPath = join(root, "pi-gateway.jsonc");
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "hello-plugin", "alice", "--mode", "fast", "--config", configPath],
      {
        cwd: "/Users/dengwenyu/.pi/agent/pi-gateway",
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(code).toBe(0);
    expect(stderr).not.toContain("Unknown command");
    expect(stdout).toContain("PLUGIN_OK:alice:fast");
  });
});
