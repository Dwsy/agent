import assert from "node:assert/strict";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

// 每个测试独享一个 socket 目录：守护进程按 socket 隔离，互不串扰。
async function freshEnv(clientPath, extra = {}) {
	const dir = path.join(tmpdir(), `computer-use-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	return {
		dir,
		env: {
			COMPUTER_USE_CLIENT_PATH: clientPath,
			COMPUTER_USE_BRIDGE_DIRECT_LAUNCH: "1",
			COMPUTER_USE_DAEMON_SOCK: path.join(dir, "daemon.sock"),
			COMPUTER_USE_DAEMON_IDLE_MS: "150",
			...extra,
		},
	};
}

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
	const { dir, env } = await freshEnv(fakeClientPath);
	const client = new ComputerUseMcpClient({ env });

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
		await rm(dir, { recursive: true, force: true });
	}
});

test("times out when the bridge never answers initialize", async () => {
	await chmod(silentClientPath, 0o755);
	const { dir, env } = await freshEnv(silentClientPath);
	const client = new ComputerUseMcpClient({ env, requestTimeoutMs: 25 });

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
		await rm(dir, { recursive: true, force: true });
	}
});

test("recycles the transport and retries read-only actions after a transient upstream error", async () => {
	await chmod(transientClientPath, 0o755);
	const dir = path.join(tmpdir(), `computer-use-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	const marker = path.join(dir, "marker");
	const attempts = path.join(dir, "attempts");
	await writeFile(marker, "1");
	const { env } = await freshEnv(transientClientPath, {
		TRANSIENT_MARKER: marker,
		TRANSIENT_ATTEMPTS: attempts,
	});

	const client = new ComputerUseMcpClient({ env });

	try {
		// 首次调用命中 -10000 → 守护进程换新整链，客户端重连后自动重放一次，
		// 调用方只见成功。
		const result = await client.callTool("list_apps", {});
		assert.equal(result.isError, undefined);
		assert.equal(result.content[0].text, "ok:list_apps");
		assert.deepEqual((await readFile(attempts, "utf8")).trim().split("\n"), ["list_apps", "list_apps"]);
	} finally {
		client.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test("never replays mutating actions after a transient upstream error", async () => {
	await chmod(transientClientPath, 0o755);
	const dir = path.join(tmpdir(), `computer-use-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	const marker = path.join(dir, "marker");
	const attempts = path.join(dir, "attempts");
	await writeFile(marker, "1");
	const { env } = await freshEnv(transientClientPath, {
		TRANSIENT_MARKER: marker,
		TRANSIENT_ATTEMPTS: attempts,
	});

	const client = new ComputerUseMcpClient({ env });

	try {
		// 有副作用的动作不重放（可能已执行），原样返回上游错误。
		const failed = await client.callTool("click", { app: "Fake App" });
		assert.equal(failed.isError, true);
		assert.match(failed.content[0].text, /server error -10000/);
		assert.deepEqual((await readFile(attempts, "utf8")).trim().split("\n"), ["click"]);

		// 但整链已换新：下一次调用直接健康。
		const recovered = await client.callTool("click", { app: "Fake App" });
		assert.equal(recovered.isError, undefined);
		assert.equal(recovered.content[0].text, "ok:click");
	} finally {
		client.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test("idle shutdown kills the whole bridge process tree", async () => {
	await chmod(treeClientPath, 0o755);
	const dir = path.join(tmpdir(), `computer-use-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	const pidFile = path.join(dir, "pids");
	const { env } = await freshEnv(treeClientPath, { TREE_PIDFILE: pidFile });

	const client = new ComputerUseMcpClient({ env });

	let pids = [];
	try {
		await client.listTools();
		pids = (await readFile(pidFile, "utf8")).trim().split("\n").map(Number);
		assert.equal(pids.length, 2);
	} finally {
		// close() 只断开 socket；守护进程在空闲超时后负责击杀整棵进程树。
		client.close();
	}

	for (const pid of pids) {
		assert.ok(await waitForProcessExit(pid), `process ${pid} should exit after idle shutdown`);
	}
	await rm(dir, { recursive: true, force: true });
});

test("multiple clients share one daemon and one bridge chain", async () => {
	await chmod(treeClientPath, 0o755);
	const dir = path.join(tmpdir(), `computer-use-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	const pidFile = path.join(dir, "pids");
	const { env } = await freshEnv(treeClientPath, { TREE_PIDFILE: pidFile });

	const first = new ComputerUseMcpClient({ env });
	const second = new ComputerUseMcpClient({ env });
	let pids = [];
	try {
		// 第二个客户端连接时守护进程已在运行：不再拉起第二条链。
		const toolsA = await first.listTools();
		const toolsB = await second.listTools();
		assert.deepEqual(toolsA.map((t) => t.name), toolsB.map((t) => t.name));

		pids = (await readFile(pidFile, "utf8")).trim().split("\n").map(Number);
		assert.equal(pids.length, 2, "one fixture + one grandchild means exactly one chain");
	} finally {
		first.close();
		second.close();
	}

	for (const pid of pids) {
		assert.ok(await waitForProcessExit(pid), `process ${pid} should exit after idle shutdown`);
	}
	await rm(dir, { recursive: true, force: true });
});
