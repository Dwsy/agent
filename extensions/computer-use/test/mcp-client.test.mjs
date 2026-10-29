import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ComputerUseMcpClient } from "../mcp-client.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(testDir, "fixtures");
const fakeClientPath = path.join(fixturesDir, "fake-computer-use.mjs");
const silentClientPath = path.join(fixturesDir, "silent-computer-use.mjs");
const transientClientPath = path.join(fixturesDir, "transient-computer-use.mjs");
const treeClientPath = path.join(fixturesDir, "tree-computer-use.mjs");

async function waitForProcessExit(pid, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test("lists tools, auto-accepts elicitation, and preserves screenshots", async () => {
  await chmod(fakeClientPath, 0o755);
  const client = new ComputerUseMcpClient({
    env: {
      COMPUTER_USE_CLIENT_PATH: fakeClientPath,
      COMPUTER_USE_BRIDGE_DIRECT_LAUNCH: "1",
    },
  });

  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), ["get_app_state"]);

    const result = await client.callTool("get_app_state", { app: "Fake App" });
    assert.equal(result.content[0].text, "auto-approved");
    assert.deepEqual(result.content[1], {
      type: "image",
      data: "aGVsbG8=",
      mimeType: "image/jpeg",
    });
  } finally {
    client.close();
  }
});


test("times out when the bridge never answers initialize", async () => {
  const client = new ComputerUseMcpClient({
    env: {
      COMPUTER_USE_CLIENT_PATH: silentClientPath,
      COMPUTER_USE_BRIDGE_DIRECT_LAUNCH: "1",
    },
    requestTimeoutMs: 25,
  });

  try {
    await assert.rejects(
      () => client.listTools(),
      (error) => {
        assert.equal(error.name, "TimeoutError");
        assert.match(error.message, /initialize/);
        return true;
      },
    );
  } finally {
    client.close();
  }
});

test("recycles the transport and retries read-only actions after a transient upstream error", async () => {
  await chmod(transientClientPath, 0o755);
  const dir = await mkdtemp(path.join(tmpdir(), "computer-use-test-"));
  const marker = path.join(dir, "marker");
  const attempts = path.join(dir, "attempts");
  await writeFile(marker, "1");

  const client = new ComputerUseMcpClient({
    env: {
      COMPUTER_USE_CLIENT_PATH: transientClientPath,
      COMPUTER_USE_BRIDGE_DIRECT_LAUNCH: "1",
      TRANSIENT_MARKER: marker,
      TRANSIENT_ATTEMPTS: attempts,
    },
  });

  try {
    // 首次调用命中 -10000 → 整树换新传输后自动重放一次，调用方只见成功。
    const result = await client.callTool("list_apps", {});
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, "ok:list_apps");
    assert.deepEqual((await readFile(attempts, "utf8")).trim().split("\n"), ["list_apps", "list_apps"]);
  } finally {
    client.close();
  }
});

test("never replays mutating actions after a transient upstream error", async () => {
  await chmod(transientClientPath, 0o755);
  const dir = await mkdtemp(path.join(tmpdir(), "computer-use-test-"));
  const marker = path.join(dir, "marker");
  const attempts = path.join(dir, "attempts");
  await writeFile(marker, "1");

  const client = new ComputerUseMcpClient({
    env: {
      COMPUTER_USE_CLIENT_PATH: transientClientPath,
      COMPUTER_USE_BRIDGE_DIRECT_LAUNCH: "1",
      TRANSIENT_MARKER: marker,
      TRANSIENT_ATTEMPTS: attempts,
    },
  });

  try {
    // 有副作用的动作不重放（可能已执行），原样返回上游错误。
    const failed = await client.callTool("click", { app: "Fake App" });
    assert.equal(failed.isError, true);
    assert.match(failed.content[0].text, /server error -10000/);
    assert.deepEqual((await readFile(attempts, "utf8")).trim().split("\n"), ["click"]);

    // 但传输已换新：下一次调用直接健康。
    const recovered = await client.callTool("click", { app: "Fake App" });
    assert.equal(recovered.isError, undefined);
    assert.equal(recovered.content[0].text, "ok:click");
  } finally {
    client.close();
  }
});

test("close() kills the whole bridge process tree", async () => {
  await chmod(treeClientPath, 0o755);
  const dir = await mkdtemp(path.join(tmpdir(), "computer-use-test-"));
  const pidFile = path.join(dir, "pids");

  const client = new ComputerUseMcpClient({
    env: {
      COMPUTER_USE_CLIENT_PATH: treeClientPath,
      COMPUTER_USE_BRIDGE_DIRECT_LAUNCH: "1",
      TREE_PIDFILE: pidFile,
    },
  });

  let pids = [];
  try {
    await client.listTools();
    pids = (await readFile(pidFile, "utf8")).trim().split("\n").map(Number);
    assert.equal(pids.length, 2);
  } finally {
    client.close();
  }

  // fixture 及其孙进程都必须退出，不允许残留（此前会泄漏 codex sandbox + Sky client）。
  for (const pid of pids) {
    assert.ok(await waitForProcessExit(pid), `process ${pid} should exit after close()`);
  }
});
