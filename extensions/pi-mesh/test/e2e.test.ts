/**
 * End-to-end seam test: real daemon process + real MeshClient peers + HTTP API.
 *
 * WHY: unit suites cover registry/server/client in isolation; this proves the
 * assembled mesh (daemon, socket routing, heartbeat->offline, HTTP, CLI) works
 * across process boundaries — the shape of a real multi-pi deployment.
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, execFileSync, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MeshClient, nextId } from "../src/client.ts";
import { meshPaths, type FileActivity, type PeerView } from "../src/protocol.ts";

const EXT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const execFileP = promisify(execFile);
const HEARTBEAT_MS = 1000;
const OFFLINE_MS = 3000; // exactly 3x heartbeat, the config minimum

let home: string;
let daemon: ChildProcess;
let httpPort: number;
let base: string;
let clientA: MeshClient;
let clientB: MeshClient;

const gitA = { repoRoot: null, branch: null, worktree: null, commonRoot: null };
const gitB = {
	repoRoot: "/tmp/demo-repo",
	branch: "feat/mesh",
	worktree: "linked" as const,
	commonRoot: "/tmp/demo-repo",
};

function peerInfo(sessionId: string, cwd: string) {
	return {
		sessionId,
		sessionFile: join(home, `${sessionId}.jsonl`),
		pid: 4242,
		cwd,
		machineId: "test-host",
		startedAt: new Date().toISOString(),
	};
}

async function api(path: string, init?: RequestInit): Promise<Response> {
	return await fetch(`${base}${path}`, init);
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await api(path, init);
	expect(res.status).toBe(200);
	return (await res.json()) as T;
}

async function waitForSocket(timeoutMs = 5000): Promise<void> {
	const socketPath = meshPaths(home).socketPath;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (existsSync(socketPath)) {
			// The socket file existing does not mean listening yet; probe it.
			try {
				const probe = new MeshClient({ socketPath, backoffMinMs: 50, backoffMaxMs: 100 });
				await probe.connect();
				probe.close();
				return;
			} catch {}
		}
		await Bun.sleep(100);
	}
	throw new Error("pi-mesh daemon socket did not come up");
}

beforeAll(async () => {
	home = mkdtempSync(join(tmpdir(), "pi-mesh-e2e-"));
	httpPort = 20000 + Math.floor(Math.random() * 20000);
	base = `http://127.0.0.1:${httpPort}`;
	// Config lives under the mesh dir (<home>/.pi/pi-mesh/config.json), per config.ts.
	mkdirSync(join(home, ".pi", "pi-mesh"), { recursive: true });
	writeFileSync(
		join(home, ".pi", "pi-mesh", "config.json"),
		JSON.stringify({
			heartbeatIntervalMs: HEARTBEAT_MS,
			offlineTimeoutMs: OFFLINE_MS,
			retentionDays: 7,
			httpPort,
		}),
	);
	daemon = spawn("bun", [join(EXT_DIR, "src/hub/daemon.ts"), "--home", home], {
		stdio: "ignore",
		detached: false,
	});
	await waitForSocket();
	clientA = new MeshClient({ socketPath: meshPaths(home).socketPath, backoffMinMs: 50, backoffMaxMs: 100 });
	clientB = new MeshClient({ socketPath: meshPaths(home).socketPath, backoffMinMs: 50, backoffMaxMs: 100 });
	await clientA.connect();
	await clientB.connect();
});

afterAll(async () => {
	clientA?.close();
	clientB?.close();
	daemon?.kill("SIGTERM");
	await Bun.sleep(300);
	rmSync(home, { recursive: true, force: true });
});

test("two peers register, heartbeats and states are visible over HTTP", async () => {
	await clientA.request({ id: nextId(), type: "register", peer: peerInfo("session-aaaa", "/proj/a"), git: gitA });
	await clientB.request({ id: nextId(), type: "register", peer: peerInfo("session-bbbb", "/proj/b"), git: gitB });

	const a1 = await clientA.request({ id: nextId(), type: "heartbeat", sessionId: "session-aaaa", state: "waiting" });
	expect(a1.ok).toBe(true);

	const { peers } = await apiJson<{ peers: PeerView[] }>("/api/peers");
	expect(peers.length).toBe(2);
	const byId = new Map(peers.map((p) => [p.sessionId, p]));
	expect(byId.get("session-aaaa")?.state).toBe("waiting");
	expect(byId.get("session-bbbb")?.git.branch).toBe("feat/mesh");
	expect(byId.get("session-bbbb")?.git.worktree).toBe("linked");
});

test("heartbeat marks a peer running", async () => {
	await clientA.request({ id: nextId(), type: "heartbeat", sessionId: "session-aaaa", state: "running" });
	const { peers } = await apiJson<{ peers: PeerView[] }>("/api/peers");
	expect(peers.find((p) => p.sessionId === "session-aaaa")?.state).toBe("running");
});

test("send_message routes from B to A and returns the push disposition", async () => {
	const received: string[] = [];
	clientA.onPush(async (push) => {
		if (push.type === "deliver_message") received.push(`${push.mode}:${push.text}`);
		return { type: "push_response", id: push.id, ok: true, disposition: "started" };
	});
	const res = await clientB.request({
		id: nextId(),
		type: "send_message",
		targetSessionId: "session-aaaa",
		text: "hello from B",
		mode: "steer",
	});
	expect(res.ok).toBe(true);
	expect(received).toEqual(["steer:hello from B"]);
});

test("cancel is forwarded to the target peer", async () => {
	let cancelled = false;
	clientB.onPush(async (push) => {
		if (push.type === "cancel") cancelled = true;
		return { type: "push_response", id: push.id, ok: true };
	});
	const res = await clientA.request({ id: nextId(), type: "cancel", targetSessionId: "session-bbbb" });
	expect(res.ok).toBe(true);
	expect(cancelled).toBe(true);
});

test("messaging an unknown or dead peer fails with peer offline", async () => {
	const res = await clientA.request({
		id: nextId(),
		type: "send_message",
		targetSessionId: "session-zzzz",
		text: "into the void",
		mode: "followUp",
	});
	expect(res.ok).toBe(false);
	expect(String(res.error)).toContain("peer offline");
});

test("file activity is recorded and exposed", async () => {
	const now = Date.now();
	const files: FileActivity[] = [
		{ path: "/proj/a/main.ts", op: "edit", ts: new Date(now - 1000).toISOString() },
		{ path: "/proj/a/new.ts", op: "write", ts: new Date(now).toISOString() },
	];
	const res = await clientA.request({ id: nextId(), type: "file_activity", sessionId: "session-aaaa", files });
	expect(res.ok).toBe(true);
	const { peers } = await apiJson<{ peers: PeerView[] }>("/api/peers");
	const a = peers.find((p) => p.sessionId === "session-aaaa");
	expect(a?.files.map((f) => f.path)).toEqual(["/proj/a/new.ts", "/proj/a/main.ts"]);
});

test("HTTP message and cancel endpoints route to live peers", async () => {
	const got: string[] = [];
	clientA.onPush(async (push) => {
		if (push.type === "deliver_message") got.push(push.text);
		return { type: "push_response", id: push.id, ok: true, disposition: "queued" };
	});
	const body = JSON.stringify({ text: "via http", mode: "followUp" });
	const { ok } = await apiJson<{ ok: boolean }>(`/api/peers/session-aaaa/message`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
	});
	expect(ok).toBe(true);
	expect(got).toEqual(["via http"]);
});

test("a silent peer is swept to offline by heartbeat timeout", async () => {
	const c = new MeshClient({ socketPath: meshPaths(home).socketPath, backoffMinMs: 50, backoffMaxMs: 100 });
	await c.connect();
	await c.request({ id: nextId(), type: "register", peer: peerInfo("session-cccc", "/proj/c"), git: gitA });
	// No further heartbeats: sweep runs every heartbeatIntervalMs.
	await Bun.sleep(OFFLINE_MS + 2 * HEARTBEAT_MS);
	const { peers } = await apiJson<{ peers: PeerView[] }>("/api/peers");
	expect(peers.find((p) => p.sessionId === "session-cccc")?.state).toBe("offline");
	c.close();
}, 15_000);

test("graceful close marks the peer closed", async () => {
	const res = await clientB.request({ id: nextId(), type: "close", sessionId: "session-bbbb", reason: "quit" });
	expect(res.ok).toBe(true);
	const { peers } = await apiJson<{ peers: PeerView[] }>("/api/peers");
	const b = peers.find((p) => p.sessionId === "session-bbbb");
	expect(b?.state).toBe("closed");
	expect(b?.closedAt).toBeTruthy();
});

test("CLI lists peers as JSON by default against the live hub", async () => {
	const env = { ...process.env, HOME: home };

	// Default: JSON, running-only. session-aaaa has aged past the offline window
	// by now, so the default view must not contain it.
	const defaultOut = execFileSync("bun", [join(EXT_DIR, "src/cli.ts"), "peers"], { env, encoding: "utf8" });
	const running = JSON.parse(defaultOut) as PeerView[];
	expect(running.every((p) => p.state === "running")).toBe(true);
	expect(running.some((p) => p.sessionId === "session-aaaa")).toBe(false);

	// --all widens the view to every retained peer (offline/closed included).
	const allOut = execFileSync("bun", [join(EXT_DIR, "src/cli.ts"), "peers", "--all"], { env, encoding: "utf8" });
	const all = JSON.parse(allOut) as PeerView[];
	expect(all.some((p) => p.sessionId === "session-aaaa")).toBe(true);
	expect(all.some((p) => p.sessionId === "session-bbbb" && p.state === "closed")).toBe(true);

	// JSON is machine-shaped: full ISO timestamps survive, ready for jq.
	for (const p of all) {
		expect(Number.isNaN(Date.parse(p.lastHeartbeat))).toBe(false);
		expect(p.lastHeartbeat).toContain("T");
	}

	// --json remains an accepted no-op alias.
	const legacy = execFileSync("bun", [join(EXT_DIR, "src/cli.ts"), "peers", "--all", "--json"], { env, encoding: "utf8" });
	expect(JSON.parse(legacy)).toEqual(all);

	// --table is the opt-in human view.
	const tableOut = execFileSync("bun", [join(EXT_DIR, "src/cli.ts"), "peers", "--all", "--table"], { env, encoding: "utf8" });
	expect(tableOut).toContain("SESSION");
	expect(tableOut).toContain("STATE");
	expect(() => JSON.parse(tableOut)).toThrow();
});

test("CLI files and history emit JSON by default and rows with --table", async () => {
	const env = { ...process.env, HOME: home };
	const run = (args: string[]) => execFileSync("bun", [join(EXT_DIR, "src/cli.ts"), ...args], { env, encoding: "utf8" });

	const filesJson = JSON.parse(run(["files", "session-aaaa"])) as FileActivity[];
	expect(Array.isArray(filesJson)).toBe(true);
	expect(filesJson.map((f) => f.path)).toEqual(["/proj/a/new.ts", "/proj/a/main.ts"]);
	// Full ISO timestamps must survive into JSON.
	for (const f of filesJson) expect(f.ts).toContain("T");

	const filesTable = run(["files", "session-aaaa", "--table"]);
	expect(filesTable).toContain("/proj/a/main.ts");
	expect(() => JSON.parse(filesTable)).toThrow();

	// query_transcript reads the peer's session file, so give it one.
	writeFileSync(
		join(home, "session-aaaa.jsonl"),
		[
			JSON.stringify({ type: "session", id: "s", timestamp: new Date().toISOString(), cwd: "/proj/a" }),
			JSON.stringify({
				type: "message",
				id: "m1",
				parentId: null,
				timestamp: new Date().toISOString(),
				message: { role: "user", content: [{ type: "text", text: "hello transcript" }] },
			}),
		].join("\n") + "\n",
	);

	const historyJson = JSON.parse(run(["history", "session-aaaa"])) as Array<{ role: string; timestamp: string; text: string }>;
	expect(Array.isArray(historyJson)).toBe(true);
	expect(historyJson.map((e) => e.text)).toEqual(["hello transcript"]);
	for (const e of historyJson) expect(e.timestamp).toContain("T");

	const historyTable = run(["history", "session-aaaa", "--table"]);
	expect(historyTable).toContain("hello transcript");
	expect(() => JSON.parse(historyTable)).toThrow();
});

test("HTTP resume endpoint refuses live peers without touching herdr", async () => {
	// Re-register with real artifacts (file + cwd) so preflight passes, and a
	// live state so the hub CAS refuses: nothing may touch herdr here.
	writeFileSync(join(home, "session-aaaa.jsonl"), "{}\n");
	await clientA.request({
		id: nextId(),
		type: "register",
		peer: { ...peerInfo("session-aaaa", home), sessionFile: join(home, "session-aaaa.jsonl") },
		git: gitA,
	});
	const live = await fetch(`${base}/api/peers/session-aaaa/resume`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{}",
	});
	const liveBody = (await live.json()) as { ok: boolean; message: string };
	expect(liveBody.ok).toBe(false);
	expect(liveBody.message).toContain("仍在运行");
	const missing = await fetch(`${base}/api/peers/session-zzzz/resume`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{}",
	});
	expect(missing.status).toBe(404);
});

test("CLI follow/unfollow moves the follow graph", async () => {
	const env = { ...process.env, HOME: home };
	execFileSync("bun", [join(EXT_DIR, "src/cli.ts"), "follow", "session-cccc", "--from", "session-aaaa"], {
		env,
		encoding: "utf8",
	});
	let peers = await apiJson<{ peers: PeerView[] }>("/api/peers");
	expect(peers.peers.find((p) => p.sessionId === "session-aaaa")?.following).toEqual(["session-cccc"]);

	execFileSync("bun", [join(EXT_DIR, "src/cli.ts"), "unfollow", "session-cccc", "--from", "session-aaaa"], {
		env,
		encoding: "utf8",
	});
	peers = await apiJson<{ peers: PeerView[] }>("/api/peers");
	expect(peers.peers.find((p) => p.sessionId === "session-aaaa")?.following).toEqual([]);
});

test("CLI send auto-follows the sender -> target", async () => {
	// The earlier silence test swept session-aaaa offline; revive it first.
	await clientA.request({ id: nextId(), type: "heartbeat", sessionId: "session-aaaa", state: "waiting" });
	const got: string[] = [];
	clientA.onPush(async (push) => {
		if (push.type === "deliver_message") got.push(push.text);
		return { type: "push_response", id: push.id, ok: true, disposition: "queued" };
	});
	const env = { ...process.env, HOME: home };
	// Async spawn: execFileSync would block the event loop and deadlock the
	// in-process clientA that must answer the routed push.
	const { stdout: out } = await execFileP(
		"bun",
		[join(EXT_DIR, "src/cli.ts"), "send", "session-aaaa", "--mode", "followUp", "--from", "session-cccc", "auto-follow-check"],
		{ env },
	);
	expect(got).toEqual(["auto-follow-check"]);
	// send now reports a JSON object; disposition carries the routing outcome.
	const sent = JSON.parse(out) as { ok: boolean; targetSessionId: string; mode: string; disposition: string };
	expect(sent).toEqual({
		ok: true,
		targetSessionId: "session-aaaa",
		mode: "followUp",
		disposition: "queued",
	});
	const { peers } = await apiJson<{ peers: PeerView[] }>("/api/peers");
	expect(peers.find((p) => p.sessionId === "session-cccc")?.following).toEqual(["session-aaaa"]);
});
