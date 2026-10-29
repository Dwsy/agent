import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const bun = process.execPath;

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check, timeoutMs = 8_000, intervalMs = 40) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastError) throw lastError;
  throw new Error(`condition not met within ${timeoutMs}ms`);
}

async function health(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(300),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function readPid(path) {
  return Number((await readFile(path, "utf8")).trim());
}

async function stopSupervisor(stateDir) {
  const pid = await readPid(join(stateDir, "supervisor.pid")).catch(() => 0);
  if (processAlive(pid)) process.kill(pid, "SIGTERM");
  await waitFor(() => !processAlive(pid), 7_000).catch(() => {
    if (processAlive(pid)) process.kill(pid, "SIGKILL");
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr, pid: child.pid }));
  });
}

test("concurrent Pi processes converge on one atomically-created host token", { timeout: 10_000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "gapp-token-race-"));
  const globalDir = join(temp, "global");
  const script = join(temp, "token.mjs");
  const authUrl = pathToFileURL(join(root, "auth.ts")).href;
  await writeFile(
    script,
    `import { ensureHostToken } from ${JSON.stringify(authUrl)};\nconsole.log(await ensureHostToken());\n`,
  );
  try {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        run(bun, [script], { env: { ...process.env, GAPP_GLOBAL_DIR: globalDir } }),
      ),
    );
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    const tokens = new Set(results.map((result) => result.stdout.trim()));
    assert.equal(tokens.size, 1);
    const [token] = tokens;
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal((await readFile(join(globalDir, "host-token"), "utf8")).trim(), token);
    assert.equal((await stat(join(globalDir, "host-token"))).mode & 0o777, 0o600);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("memory guard requires repeated limits and detects sustained growth", async () => {
  const { MemoryGuard } = await import(pathToFileURL(join(root, "daemon-health.ts")).href);
  const absolute = new MemoryGuard({
    maxRssBytes: 100,
    maxRssConsecutive: 2,
    leakWindow: 5,
    leakGrowthBytes: 1_000,
    leakHeapGrowthBytes: 1_000,
    leakMinimumRssBytes: 0,
    monotonicRatio: 0.75,
  });
  assert.equal(absolute.observe({ at: 1, rss: 101, heapUsed: 20, external: 0 }).restart, false);
  assert.equal(absolute.observe({ at: 2, rss: 99, heapUsed: 20, external: 0 }).restart, false);
  assert.equal(absolute.observe({ at: 3, rss: 101, heapUsed: 20, external: 0 }).restart, false);
  const overLimit = absolute.observe({ at: 4, rss: 102, heapUsed: 20, external: 0 });
  assert.equal(overLimit.restart, true);
  assert.match(overLimit.reason, /RSS stayed above/);

  const mib = 1024 * 1024;
  const leak = new MemoryGuard({
    maxRssBytes: 1_000 * mib,
    maxRssConsecutive: 2,
    leakWindow: 6,
    leakGrowthBytes: 10 * mib,
    leakHeapGrowthBytes: 5 * mib,
    leakMinimumRssBytes: 1,
    monotonicRatio: 0.7,
  });
  let decision;
  for (let i = 0; i < 6; i += 1) {
    decision = leak.observe({
      at: i,
      rss: (100 + i * 4) * mib,
      heapUsed: (40 + i * 2) * mib,
      external: 0,
    });
  }
  assert.equal(decision.restart, true);
  assert.match(decision.reason, /sustained memory growth/);
});

test("detached daemon survives launchers, is single-instance, then exits idle", { timeout: 20_000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "gapp-daemon-idle-"));
  const globalDir = join(temp, "global");
  const stateDir = join(temp, "state");
  const port = await freePort();
  const launcher = join(temp, "launch.mjs");
  const managerUrl = pathToFileURL(join(root, "daemon-manager.ts")).href;
  await writeFile(
    launcher,
    `import { ensureGappDaemon } from ${JSON.stringify(managerUrl)};\n` +
      `await ensureGappDaemon({ bind: "127.0.0.1", port: ${port}, stateDir: ${JSON.stringify(stateDir)}, startupTimeoutMs: 10000, env: ${JSON.stringify({
        GAPP_GLOBAL_DIR: globalDir,
        GAPP_HOST_IDLE_MS: "1800",
        GAPP_HOST_MONITOR_MS: "50",
      })} });\n`,
  );

  try {
    const [first, second] = await Promise.all([run(bun, [launcher]), run(bun, [launcher])]);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(second.code, 0, second.stderr);

    const live = await waitFor(() => health(port));
    assert.equal(live.service, "gapp-host");
    assert.equal(live.role, "daemon");
    assert.equal(live.mode, "daemon");

    const supervisorPid = await readPid(join(stateDir, "supervisor.pid"));
    const daemonPid = await readPid(join(stateDir, "daemon.pid"));
    assert.equal(processAlive(supervisorPid), true);
    assert.equal(processAlive(daemonPid), true);
    assert.notEqual(supervisorPid, first.pid);
    assert.notEqual(daemonPid, first.pid);

    const token = (await readFile(join(globalDir, "host-token"), "utf8")).trim();
    const heartbeat = setInterval(() => {
      void fetch(`http://127.0.0.1:${port}/v1/gapp/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: "idle-heartbeat",
          pid: process.pid,
          cwd: temp,
        }),
      }).catch(() => {});
    }, 75);
    try {
      await waitFor(async () => (await health(port)) === null, 7_000, 75);
    } finally {
      clearInterval(heartbeat);
    }
    await waitFor(() => !processAlive(supervisorPid), 7_000, 75);
    assert.equal(processAlive(daemonPid), false);
  } finally {
    await stopSupervisor(stateDir);
    await rm(temp, { recursive: true, force: true });
  }
});

test("memory threshold makes the supervisor replace the daemon process", { timeout: 20_000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "gapp-daemon-memory-"));
  const globalDir = join(temp, "global");
  const stateDir = join(temp, "state");
  const port = await freePort();
  const managerUrl = pathToFileURL(join(root, "daemon-manager.ts")).href + `?memory=${Date.now()}`;
  const { ensureGappDaemon } = await import(managerUrl);
  try {
    await ensureGappDaemon({
      bind: "127.0.0.1",
      port,
      stateDir,
      startupTimeoutMs: 10_000,
      env: {
        GAPP_GLOBAL_DIR: globalDir,
        GAPP_HOST_IDLE_MS: "20000",
        GAPP_HOST_MONITOR_MS: "150",
        GAPP_HOST_MAX_RSS_MB: "16",
        GAPP_HOST_MAX_RSS_SAMPLES: "1",
      },
    });
    const supervisorPid = await readPid(join(stateDir, "supervisor.pid"));
    const firstDaemonPid = await readPid(join(stateDir, "daemon.pid"));
    const replacementPid = await waitFor(async () => {
      const pid = await readPid(join(stateDir, "daemon.pid")).catch(() => 0);
      return pid && pid !== firstDaemonPid ? pid : 0;
    }, 8_000, 30);
    assert.notEqual(replacementPid, firstDaemonPid);
    assert.equal(processAlive(supervisorPid), true);
    const log = await readFile(join(stateDir, "gapp-host.log"), "utf8");
    assert.match(log, /memory_restart/);
    assert.match(log, /daemon_restart_scheduled/);
  } finally {
    await stopSupervisor(stateDir);
    await rm(temp, { recursive: true, force: true });
  }
});

test("default generate stays in the daemon when a registered Pi bridge is unavailable", { timeout: 20_000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "gapp-daemon-generate-"));
  const globalDir = join(temp, "global");
  const stateDir = join(temp, "state");
  const projectDir = join(temp, "project");
  const fakePi = join(temp, "fake-pi.mjs");
  const port = await freePort();
  const deadBridgePort = await freePort();
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    fakePi,
    `console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "generated-by-daemon" }] } }));\n` +
      `console.log(JSON.stringify({ type: "agent_settled" }));\n`,
  );

  const managerUrl = pathToFileURL(join(root, "daemon-manager.ts")).href + `?generate=${Date.now()}`;
  const { ensureGappDaemon } = await import(managerUrl);
  try {
    await ensureGappDaemon({
      bind: "127.0.0.1",
      port,
      stateDir,
      startupTimeoutMs: 10_000,
      env: {
        GAPP_GLOBAL_DIR: globalDir,
        GAPP_HOST_IDLE_MS: "30000",
        GAPP_HOST_MONITOR_MS: "500",
        GAPP_SUBAGENT_CMD: `${bun} ${fakePi}`,
      },
    });
    const token = (await readFile(join(globalDir, "host-token"), "utf8")).trim();
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const request = async (method, path, body) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    const sessionId = `stale-pi-${Date.now()}`;
    const appId = `persistent-generate-${Date.now()}`;
    assert.equal(
      (await request("POST", "/v1/gapp/sessions", {
        sessionId,
        pid: process.pid,
        cwd: projectDir,
        bridgeBase: `http://127.0.0.1:${deadBridgePort}`,
      })).status,
      200,
    );
    assert.equal(
      (await request("PUT", `/v1/gapp/leases/${encodeURIComponent(appId)}`, {
        sessionId,
        instances: "single",
        pid: process.pid,
        cwd: projectDir,
        scope: "project",
      })).status,
      200,
    );

    const requestId = `daemon-gen-${Date.now()}`;
    const started = await request("POST", `/v1/gapp/apps/${encodeURIComponent(appId)}/generate`, {
      requestId,
      prompt: "continue after Pi exits",
    });
    assert.equal(started.status, 202, JSON.stringify(started.data));
    assert.equal(started.data.via, "subagent");

    const completed = await waitFor(async () => {
      const result = await request(
        "GET",
        `/v1/gapp/apps/${encodeURIComponent(appId)}/generate/${encodeURIComponent(requestId)}`,
      );
      return result.data?.status === "done" ? result : null;
    }, 8_000, 40);
    assert.equal(completed.data.text, "generated-by-daemon");
  } finally {
    await stopSupervisor(stateDir);
    await rm(temp, { recursive: true, force: true });
  }
});

test("daemon forwards a live tool call through the Pi session bridge", { timeout: 20_000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "gapp-daemon-bridge-"));
  const globalDir = join(temp, "global");
  const stateDir = join(temp, "state");
  const projectDir = join(temp, "project");
  const port = await freePort();
  const sessionId = `test-session-${Date.now()}`;
  const appId = `bridge-app-${Date.now()}`;
  const helperPath = join(temp, "pi-bridge-helper.mjs");
  const helperInfoPath = join(temp, "pi-bridge.json");
  const registryUrl = pathToFileURL(join(root, "registry.ts")).href;
  const bridgeUrl = pathToFileURL(join(root, "session-bridge.ts")).href;
  await writeFile(
    helperPath,
    `import { writeFile } from "node:fs/promises";\n` +
      `import * as registry from ${JSON.stringify(registryUrl)};\n` +
      `import { startGappSessionBridge, stopGappSessionBridge } from ${JSON.stringify(bridgeUrl)};\n` +
      `const sessionId = ${JSON.stringify(sessionId)};\n` +
      `const appId = ${JSON.stringify(appId)};\n` +
      `const win = { send(source) {\n` +
      `  const marker = "__dispatch(";\n` +
      `  const start = source.indexOf(marker);\n` +
      `  const end = source.lastIndexOf(")");\n` +
      `  const message = JSON.parse(source.slice(start + marker.length, end));\n` +
      `  if (message.type === "gapp_tool_call") queueMicrotask(() => registry.resolveToolResult(message.requestId, { ok: true, result: { echoed: message.arguments.value, handledBy: "pi-bridge" } }));\n` +
      `} };\n` +
      `registry.setHostSessionId(sessionId);\n` +
      `registry.registerLiveApp({ appId, sessionId, scope: "project", cwd: ${JSON.stringify(projectDir)}, instances: "single", win, diskTools: [] });\n` +
      `registry.setLiveTools(appId, [{ name: "echo", description: "Echo through the live window", inputSchema: { type: "object" } }], 1);\n` +
      `const bridge = await startGappSessionBridge(sessionId);\n` +
      `await writeFile(${JSON.stringify(helperInfoPath)}, JSON.stringify({ base: bridge.base, pid: process.pid }));\n` +
      `let stopping = false;\n` +
      `async function stop() { if (stopping) return; stopping = true; await stopGappSessionBridge().catch(() => {}); registry.unregisterLiveApp(appId, sessionId, win); process.exit(0); }\n` +
      `process.on("SIGTERM", stop); process.on("SIGINT", stop);\n` +
      `setInterval(() => {}, 1000);\n`,
  );

  let helper;
  let daemon;
  let helperStderr = "";
  let daemonStderr = "";
  try {
    helper = spawn(bun, [helperPath], {
      env: {
        ...process.env,
        GAPP_GLOBAL_DIR: globalDir,
        GAPP_HOST_STATE_DIR: stateDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    helper.stderr.on("data", (chunk) => { helperStderr += chunk; });
    const helperInfo = await waitFor(async () => {
      try {
        return JSON.parse(await readFile(helperInfoPath, "utf8"));
      } catch {
        if (helper.exitCode != null || helper.signalCode != null) {
          throw new Error(`Pi bridge helper exited early: ${helperStderr}`);
        }
        return null;
      }
    }, 10_000);

    daemon = spawn(bun, [join(root, "daemon.ts")], {
      env: {
        ...process.env,
        GAPP_GLOBAL_DIR: globalDir,
        GAPP_HOST_STATE_DIR: stateDir,
        GAPP_HOST_PORT: String(port),
        GAPP_HOST_BASE: `http://127.0.0.1:${port}`,
        GAPP_HOST_IDLE_MS: "30000",
        GAPP_HOST_MONITOR_MS: "1000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    daemon.stderr.on("data", (chunk) => { daemonStderr += chunk; });
    await waitFor(() => health(port), 10_000);

    const token = (await readFile(join(globalDir, "host-token"), "utf8")).trim();
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const request = async (method, path, body) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };

    const registered = await request("POST", "/v1/gapp/sessions", {
      sessionId,
      pid: helperInfo.pid,
      cwd: projectDir,
      bridgeBase: helperInfo.base,
    });
    assert.equal(registered.status, 200);

    const leased = await request("PUT", `/v1/gapp/leases/${encodeURIComponent(appId)}`, {
      sessionId,
      instances: "single",
      pid: helperInfo.pid,
      cwd: projectDir,
      scope: "project",
    });
    assert.equal(leased.status, 200);

    const catalog = await request("GET", `/v1/gapp/apps/${encodeURIComponent(appId)}/tools`);
    assert.equal(catalog.status, 200);
    assert.deepEqual(catalog.data.tools.map((entry) => entry.name), ["echo"]);

    const called = await request("POST", `/v1/gapp/apps/${encodeURIComponent(appId)}/call`, {
      tool: "echo",
      arguments: { value: "hello" },
    });
    assert.equal(called.status, 200, JSON.stringify(called.data));
    assert.deepEqual(called.data.result, { echoed: "hello", handledBy: "pi-bridge" });
    assert.equal(called.data.via, "live");
    assert.doesNotMatch(helperStderr, /uncaught|unhandled/i);
    assert.doesNotMatch(daemonStderr, /uncaught_exception|unhandled_rejection/);
  } finally {
    if (daemon && daemon.exitCode == null) {
      daemon.kill("SIGTERM");
      await waitFor(() => daemon.exitCode != null || daemon.signalCode != null, 7_000).catch(() => {
        daemon.kill("SIGKILL");
      });
    }
    if (helper && helper.exitCode == null) {
      helper.kill("SIGTERM");
      await waitFor(() => helper.exitCode != null || helper.signalCode != null, 7_000).catch(() => {
        helper.kill("SIGKILL");
      });
    }
    await rm(temp, { recursive: true, force: true });
  }
});
