import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { RpcPool } from "./rpc-pool.ts";
import { buildCapabilityProfile } from "./capability-profile.ts";
import { DEFAULT_CONFIG, type Config } from "./config.ts";
import { getSessionDir } from "./session-store.ts";

let tempRoot = "";
let pool: RpcPool | null = null;

function mkConfig(piCliPath: string): Config {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
  config.agent.piCliPath = piCliPath;
  config.agent.pool = {
    min: 0,
    max: 8,
    idleTimeoutMs: 60_000,
  };
  config.session.dataDir = join(tempRoot, "sessions");
  config.agent.runtime = {
    agentDir: join(tempRoot, "runtime-agent"),
  };
  config.roles.workspaceDirs = {
    default: join(tempRoot, "workspace-default"),
    mentor: join(tempRoot, "workspace-mentor"),
  };
  config.roles.capabilities = {};
  return config;
}

function createFakePiCliScript(root: string): string {
  const scriptPath = join(root, "fake-pi.js");
  const content = `#!/usr/bin/env node
process.stdin.setEncoding("utf8");
let buf = "";
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\\n");
}
function onLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let cmd;
  try {
    cmd = JSON.parse(trimmed);
  } catch {
    return;
  }
  const id = cmd.id;
  const type = cmd.type || "unknown";
  send({ type: "response", id, command: type, success: true, data: {} });
  if (type === "prompt") {
    send({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "ok" }
    });
    send({ type: "agent_end", messages: [] });
  }
}
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let idx = -1;
  while ((idx = buf.indexOf("\\n")) !== -1) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    onLine(line);
  }
});
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
process.stdin.resume();
`;
  writeFileSync(scriptPath, content, "utf-8");
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "pi-gw-rpc-pool-"));
});

afterEach(async () => {
  if (pool) {
    const stopOrTimeout = await Promise.race([
      pool.stop().then(() => "stopped"),
      Bun.sleep(1500).then(() => "timeout"),
    ]);
    if (stopOrTimeout === "timeout") {
      Bun.spawnSync(["pkill", "-f", `${tempRoot}/fake-pi.js`], { stdout: "ignore", stderr: "ignore" });
    }
    pool = null;
  }
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("rpc pool capability profile isolation", () => {
  test("reuses idle process when profile signature matches", async () => {
    const piCliPath = createFakePiCliScript(tempRoot);
    const config = mkConfig(piCliPath);
    pool = new RpcPool(config);
    await pool.start();

    const cwd = resolve(join(tempRoot, "workspace-default"));
    mkdirSync(cwd, { recursive: true });

    const profile = buildCapabilityProfile({
      config,
      role: "default",
      cwd,
      sessionKey: "agent:main:main:main",
    });

    const c1 = await pool.acquire("agent:main:webchat:session:1", profile);
    pool.release("agent:main:webchat:session:1");
    const c2 = await pool.acquire("agent:main:webchat:session:2", profile);

    expect(c1.id).toBe(c2.id);
    expect(c2.signature).toBe(profile.signature);
    expect(c2.cwd).toBe(cwd);
  });

  test("does not reuse idle process when signature differs", async () => {
    const piCliPath = createFakePiCliScript(tempRoot);
    const config = mkConfig(piCliPath);
    config.roles.capabilities = {
      mentor: {
        skills: [join(tempRoot, "skills", "mentor")],
      },
    };

    pool = new RpcPool(config);
    await pool.start();

    const cwd = resolve(join(tempRoot, "workspace-default"));
    mkdirSync(cwd, { recursive: true });

    const profileA = buildCapabilityProfile({
      config,
      role: "default",
      cwd,
      sessionKey: "agent:main:main:main",
    });
    const profileB = buildCapabilityProfile({
      config,
      role: "mentor",
      cwd,
      sessionKey: "agent:main:main:main",
    });

    const c1 = await pool.acquire("agent:main:webchat:session:1", profileA);
    pool.release("agent:main:webchat:session:1");
    const c2 = await pool.acquire("agent:main:webchat:session:2", profileB);

    expect(profileA.signature).not.toBe(profileB.signature);
    expect(c1.id).not.toBe(c2.id);
  });

  test("lazy switch on next acquire after config/profile change", async () => {
    const piCliPath = createFakePiCliScript(tempRoot);
    const config = mkConfig(piCliPath);
    pool = new RpcPool(config);
    await pool.start();

    const cwd = resolve(join(tempRoot, "workspace-default"));
    mkdirSync(cwd, { recursive: true });

    const profileBefore = buildCapabilityProfile({
      config,
      role: "default",
      cwd,
      sessionKey: "agent:main:main:main",
    });
    const sessionKey = "agent:main:webchat:session:same";
    const c1 = await pool.acquire(sessionKey, profileBefore);
    pool.release(sessionKey);

    const config2 = JSON.parse(JSON.stringify(config)) as Config;
    config2.agent.skillsGateway = [join(tempRoot, "skills", "gateway")];
    pool.setConfig(config2);

    // Config reload should proactively recycle idle clients so old signatures don't linger.
    expect(pool.getAllClients().some((c) => c.id === c1.id)).toBeFalse();

    const profileAfter = buildCapabilityProfile({
      config: config2,
      role: "default",
      cwd,
      sessionKey: "agent:main:main:main",
    });
    const c2 = await pool.acquire(sessionKey, profileAfter);

    expect(profileBefore.signature).not.toBe(profileAfter.signature);
    expect(c1.id).not.toBe(c2.id);
  });
});
