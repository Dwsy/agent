/**
 * Unit tests: stateOps, lease, multipath host server.
 * Prefer bun (resolves .js→.ts); node --test also works for stateops-only if bun missing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

async function load(name) {
  return import(pathToFileURL(join(root, name)).href + "?t=" + Date.now());
}

test("old window cleanup cannot unregister a same-session replacement", async () => {
  const { registerLiveApp, unregisterLiveApp, getLiveApp } = await load("registry.ts");
  const oldWin = { id: "old" };
  const newWin = { id: "new" };
  registerLiveApp({
    appId: "generation-guard",
    sessionId: "same-session",
    scope: "project",
    cwd: "/tmp/project",
    instances: "single",
    win: oldWin,
  });
  registerLiveApp({
    appId: "generation-guard",
    sessionId: "same-session",
    scope: "project",
    cwd: "/tmp/project",
    instances: "single",
    win: newWin,
  });
  unregisterLiveApp("generation-guard", "same-session", oldWin);
  assert.equal(getLiveApp("generation-guard")?.win, newWin);
  unregisterLiveApp("generation-guard", "same-session", newWin);
  assert.equal(getLiveApp("generation-guard"), undefined);
});

test("stateOps push / updateWhere / get", async () => {
  const { applyStateOps } = await load("stateops.ts");
  let out = applyStateOps(
    { items: [] },
    [
      {
        op: "push",
        path: "items",
        value: { id: "$uuid", title: "$args.title", status: "open" },
      },
    ],
    { title: "Buy milk" },
  );
  assert.equal(out.state.items.length, 1);
  assert.equal(out.state.items[0].title, "Buy milk");
  assert.equal(out.state.items[0].status, "open");
  assert.ok(out.state.items[0].id);

  const id = out.state.items[0].id;
  out = applyStateOps(
    out.state,
    [{ op: "updateWhere", path: "items", match: { id }, set: { status: "done" } }],
    {},
  );
  assert.equal(out.result.updated, 1);
  assert.equal(out.state.items[0].status, "done");

  out = applyStateOps(out.state, [{ op: "get", path: "items" }], {});
  assert.equal(out.result.length, 1);
});

test("stateOps path template statusMap.$args.id", async () => {
  const { applyStateOps } = await load("stateops.ts");
  const out = applyStateOps(
    { statusMap: { "08-W0-01": "todo" }, data: { tasks: [] } },
    [{ op: "set", path: "statusMap.$args.id", value: "$args.status" }],
    { id: "08-W0-01", status: "done" },
  );
  assert.equal(out.state.statusMap["08-W0-01"], "done");

  const out2 = applyStateOps(
    out.state,
    [{ op: "set", path: "statusMap.$args.id", value: "$args.status" }],
    { id: "08-W1-02", status: "doing" },
  );
  assert.equal(out2.state.statusMap["08-W1-02"], "doing");
  assert.equal(out2.state.statusMap["08-W0-01"], "done");
});

test("lease single blocks other session; same session ok", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gapp-leases-"));
  process.env.GAPP_LEASES_DIR = dir;
  try {
    const { acquireLease, releaseLease, readLease } = await load("lease.ts");
    const a = await acquireLease({
      appId: "todo",
      sessionId: "sess-a",
      instances: "single",
      pid: process.pid,
    });
    assert.equal(a.ok, true);

    const b = await acquireLease({
      appId: "todo",
      sessionId: "sess-b",
      instances: "single",
      pid: process.pid,
    });
    assert.equal(b.ok, false);
    assert.equal(b.code, "already_connected");

    const again = await acquireLease({
      appId: "todo",
      sessionId: "sess-a",
      instances: "single",
      pid: process.pid,
    });
    assert.equal(again.ok, true);

    const multi = await acquireLease({
      appId: "viewer",
      sessionId: "sess-a",
      instances: "multi",
    });
    assert.equal(multi.ok, true);
    const multiB = await acquireLease({
      appId: "viewer",
      sessionId: "sess-b",
      instances: "multi",
    });
    assert.equal(multiB.ok, true);

    await releaseLease("todo", { sessionId: "sess-a" });
    assert.equal(await readLease("todo"), null);
  } finally {
    delete process.env.GAPP_LEASES_DIR;
    await rm(dir, { recursive: true, force: true });
  }
});

test("stale lease is removed without recursive read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gapp-stale-lease-"));
  process.env.GAPP_LEASES_DIR = dir;
  try {
    await writeFile(
      join(dir, "stale.json"),
      JSON.stringify({
        appId: "stale",
        sessionId: "dead-session",
        pid: 2147483647,
        openedAt: new Date().toISOString(),
        instances: "single",
      }),
    );
    const { readLease } = await load("lease.ts");
    assert.equal(await readLease("stale"), null);
    await assert.rejects(readFile(join(dir, "stale.json"), "utf8"));
  } finally {
    delete process.env.GAPP_LEASES_DIR;
    await rm(dir, { recursive: true, force: true });
  }
});

test("host multipath :54888 health + auth + lease + cwd guard", async () => {
  // Use ephemeral port + isolated global dir (token file) for test isolation
  const port = 54888 + Math.floor(Math.random() * 1000) + 100;
  const globalDir = await mkdtemp(join(tmpdir(), "gapp-host-global-"));
  const leaseDir = await mkdtemp(join(tmpdir(), "gapp-host-leases-"));
  process.env.GAPP_HOST_PORT = String(port);
  process.env.GAPP_HOST_BASE = `http://127.0.0.1:${port}`;
  process.env.GAPP_GLOBAL_DIR = globalDir;
  process.env.GAPP_LEASES_DIR = leaseDir;

  const { startGappHostServer, stopGappHostServer } = await load("host-server.ts");
  const { setHostSessionId } = await load("registry.ts");
  setHostSessionId("test-session");

  const info = await startGappHostServer({ sessionId: "test-session", port });
  assert.equal(info.role, "hub");
  assert.equal(info.port, port);

  const token = (await readFile(join(globalDir, "host-token"), "utf8")).trim();
  assert.ok(token.length >= 32, "hub wrote a token file");
  const auth = { Authorization: `Bearer ${token}` };

  try {
    // Health probe stays tokenless (hub discovery).
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.service, "gapp-host");
    assert.ok(health.prefix.includes("/v1/gapp"));

    // Everything else requires the token.
    const noToken = await fetch(`http://127.0.0.1:${port}/v1/gapp`);
    assert.equal(noToken.status, 401);
    const badToken = await fetch(`http://127.0.0.1:${port}/v1/gapp/leases/x`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    assert.equal(badToken.status, 401);

    const catalog = await fetch(`http://127.0.0.1:${port}/v1/gapp`, { headers: auth }).then((r) => r.json());
    assert.equal(catalog.ok, true);
    assert.ok(catalog.paths.leases);

    const rpcResponse = await fetch(
      `http://127.0.0.1:${port}/v1/gapp/apps/missing-handler/rpc`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ method: "echo", arguments: {} }),
      },
    );
    assert.equal(rpcResponse.status, 400);
    assert.equal(rpcResponse.headers.get("access-control-allow-origin"), null);
    const rpcBody = await rpcResponse.json();
    assert.match(rpcBody.error.message, /No host RPC handler/);

    // cwd outside process.cwd / registry / live apps is rejected.
    const badCwd = await fetch(`http://127.0.0.1:${port}/v1/gapp/apps/some-app/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ tool: "x", cwd: "/tmp/definitely-not-registered" }),
    });
    assert.equal(badCwd.status, 403);
    const badCwdBody = await badCwd.json();
    assert.equal(badCwdBody.error.code, "cwd_forbidden");

    const leasePut = await fetch(`http://127.0.0.1:${port}/v1/gapp/leases/todo-test`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ sessionId: "s1", instances: "single", pid: process.pid }),
    }).then((r) => r.json());
    assert.equal(leasePut.ok, true);

    const leaseConflict = await fetch(`http://127.0.0.1:${port}/v1/gapp/leases/todo-test`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ sessionId: "s2", instances: "single", pid: process.pid }),
    });
    assert.equal(leaseConflict.status, 409);
    const conflictBody = await leaseConflict.json();
    assert.equal(conflictBody.code, "already_connected");

    await fetch(`http://127.0.0.1:${port}/v1/gapp/leases/todo-test`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ sessionId: "s1" }),
    });
  } finally {
    await stopGappHostServer();
    delete process.env.GAPP_HOST_PORT;
    delete process.env.GAPP_HOST_BASE;
    delete process.env.GAPP_GLOBAL_DIR;
    delete process.env.GAPP_LEASES_DIR;
    await rm(globalDir, { recursive: true, force: true });
    await rm(leaseDir, { recursive: true, force: true });
  }
});
