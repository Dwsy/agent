import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { meshPaths, type GitInfo, type HubRequest, type PeerInfo } from "../src/protocol.ts";
import { Registry } from "../src/hub/registry.ts";
import { createHubServer, type HubServer } from "../src/hub/server.ts";

const GIT: GitInfo = { repoRoot: null, branch: null, worktree: null, commonRoot: null };

function makePeer(sessionId: string, extra: Partial<PeerInfo> = {}): PeerInfo {
	return {
		sessionId,
		sessionFile: `/tmp/${sessionId}.jsonl`,
		pid: 1,
		cwd: "/tmp",
		machineId: "m1",
		startedAt: "2026-09-30T05:00:00.000Z",
		...extra,
	};
}

async function startHub(): Promise<{ hub: HubServer; registry: Registry; home: string }> {
	const home = mkdtempSync(join(tmpdir(), "pi-mesh-server-"));
	const registry = new Registry(DEFAULT_CONFIG, home);
	const hub = await createHubServer(registry, DEFAULT_CONFIG, home);
	return { hub, registry, home };
}

/** Minimal JSONL test client: one response per id, pushes queued in order. */
class TestClient {
	conn!: net.Socket;
	#buf = "";
	#responses = new Map<string, (r: Record<string, unknown>) => void>();
	#pushes: Record<string, unknown>[] = [];
	#pushWaiters: Array<(p: Record<string, unknown>) => void> = [];
	#seq = 0;
	raw: Record<string, unknown>[] = [];

	static connect(socketPath: string): Promise<TestClient> {
		return new Promise((resolve, reject) => {
			const client = new TestClient();
			client.conn = net.connect(socketPath, () => resolve(client));
			client.conn.setEncoding("utf8");
			client.conn.on("error", reject);
			client.conn.on("data", (chunk: string) => {
				client.#buf += chunk;
				let nl: number;
				while ((nl = client.#buf.indexOf("\n")) >= 0) {
					const line = client.#buf.slice(0, nl);
					client.#buf = client.#buf.slice(nl + 1);
					if (!line) continue;
					const msg = JSON.parse(line) as Record<string, unknown>;
					client.raw.push(msg);
					if (msg.type === "response") {
						const resolve = client.#responses.get(msg.id as string);
						if (resolve) {
							client.#responses.delete(msg.id as string);
							resolve(msg);
						}
					} else {
						const waiter = client.#pushWaiters.shift();
						if (waiter) waiter(msg);
						else client.#pushes.push(msg);
					}
				}
			});
		});
	}

	request(req: Omit<HubRequest, "id"> & { id?: string }): Promise<Record<string, unknown>> {
		const id = req.id ?? `t${++this.#seq}`;
		return new Promise(resolve => {
			this.#responses.set(id, resolve);
			this.conn.write(`${JSON.stringify({ ...req, id })}\n`);
		});
	}

	sendRaw(line: string): void {
		this.conn.write(line);
	}

	nextPush(): Promise<Record<string, unknown>> {
		const queued = this.#pushes.shift();
		if (queued) return Promise.resolve(queued);
		return new Promise(resolve => this.#pushWaiters.push(resolve));
	}

	respondPush(id: string, ok: boolean, disposition?: string, error?: string): void {
		this.conn.write(`${JSON.stringify({ type: "push_response", id, ok, disposition, error })}\n`);
	}

	waitRaw(count: number): Promise<void> {
		return (async () => {
			while (this.raw.length < count) await Bun.sleep(5);
		})();
	}

	close(): void {
		this.conn.destroy();
	}
}

describe("hub socket server", () => {
	test("register, query_peers, heartbeat, file_activity, close", async () => {
		const { hub, registry, home } = await startHub();
		const client = await TestClient.connect(meshPaths(home).socketPath);

		const bad = await client.request({ type: "register", peer: makePeer("s0", { sessionFile: "" }), git: GIT });
		expect(bad.ok).toBe(false);

		const reg = await client.request({ type: "register", peer: makePeer("s1"), git: GIT });
		expect(reg.ok).toBe(true);

		const hb = await client.request({ type: "heartbeat", sessionId: "s1", state: "running", title: "task" });
		expect(hb.ok).toBe(true);

		const files = [{ path: "/tmp/a.ts", op: "edit" as const, ts: "2026-09-30T05:00:00.000Z" }];
		const fa = await client.request({ type: "file_activity", sessionId: "s1", files });
		expect(fa.ok).toBe(true);

		const peers = await client.request({ type: "query_peers" });
		const list = (peers.data as { peers: Record<string, unknown>[] }).peers;
		expect(list.length).toBe(1);
		expect(list[0]!.sessionId).toBe("s1");
		expect(list[0]!.state).toBe("running");
		expect((list[0]!.files as unknown[]).length).toBe(1);

		const cl = await client.request({ type: "close", sessionId: "s1", reason: "done" });
		expect(cl.ok).toBe(true);
		expect(registry.get("s1")!.state).toBe("closed");

		const badHb = await client.request({ type: "heartbeat", sessionId: "nope", state: "running" });
		expect(badHb.ok).toBe(false);

		client.close();
		await hub.close();
	});

	test("query_transcript delegates to the peer session file; unknown session fails", async () => {
		const { hub, home } = await startHub();
		const sessionFile = join(home, "session.jsonl");
		writeFileSync(
			sessionFile,
			[
				JSON.stringify({ type: "session", id: "s", timestamp: "2026-09-30T05:35:36.633Z", cwd: "/tmp" }),
				JSON.stringify({
					type: "message",
					id: "m1",
					parentId: null,
					timestamp: "2026-09-30T05:36:00.000Z",
					message: { role: "user", content: [{ type: "text", text: "hi" }] },
				}),
			].join("\n") + "\n",
		);
		const client = await TestClient.connect(meshPaths(home).socketPath);
		await client.request({ type: "register", peer: makePeer("s1", { sessionFile }), git: GIT });

		const res = await client.request({ type: "query_transcript", sessionId: "s1", limit: 10 });
		expect(res.ok).toBe(true);
		const entries = (res.data as { entries: Record<string, unknown>[] }).entries;
		expect(entries.length).toBe(1);
		expect(entries[0]!.text).toBe("hi");

		const unknown = await client.request({ type: "query_transcript", sessionId: "nope" });
		expect(unknown.ok).toBe(false);

		client.close();
		await hub.close();
	});

	test("send_message routes to the target connection and awaits its push response", async () => {
		const { hub, home } = await startHub();
		const a = await TestClient.connect(meshPaths(home).socketPath);
		const b = await TestClient.connect(meshPaths(home).socketPath);
		await a.request({ type: "register", peer: makePeer("sA"), git: GIT });
		await b.request({ type: "register", peer: makePeer("sB"), git: GIT });

		const sendPromise = a.request({
			type: "send_message",
			targetSessionId: "sB",
			text: "ping",
			mode: "steer",
		});
		const push = await b.nextPush();
		expect(push.type).toBe("deliver_message");
		expect(push.text).toBe("ping");
		expect(push.mode).toBe("steer");
		b.respondPush(push.id as string, true, "started");

		const res = await sendPromise;
		expect(res.ok).toBe(true);
		expect((res.data as { disposition: string }).disposition).toBe("started");

		a.close();
		b.close();
		await hub.close();
	});

	test("cancel is forwarded as a hub push", async () => {
		const { hub, home } = await startHub();
		const a = await TestClient.connect(meshPaths(home).socketPath);
		const b = await TestClient.connect(meshPaths(home).socketPath);
		await a.request({ type: "register", peer: makePeer("sA"), git: GIT });
		await b.request({ type: "register", peer: makePeer("sB"), git: GIT });

		const cancelPromise = a.request({ type: "cancel", targetSessionId: "sB" });
		const push = await b.nextPush();
		expect(push.type).toBe("cancel");
		b.respondPush(push.id as string, true);

		const res = await cancelPromise;
		expect(res.ok).toBe(true);

		a.close();
		b.close();
		await hub.close();
	});

	test("unresponsive target yields 'peer did not respond' after the 10s push timeout", async () => {
		const { hub, home } = await startHub();
		const a = await TestClient.connect(meshPaths(home).socketPath);
		const b = await TestClient.connect(meshPaths(home).socketPath);
		await a.request({ type: "register", peer: makePeer("sA"), git: GIT });
		await b.request({ type: "register", peer: makePeer("sB"), git: GIT });

		const started = Date.now();
		const res = await a.request({
			type: "send_message",
			targetSessionId: "sB",
			text: "ping",
			mode: "followUp",
		});
		expect(res.ok).toBe(false);
		expect(res.error).toBe("peer did not respond");
		expect(Date.now() - started).toBeGreaterThanOrEqual(9_500);

		a.close();
		b.close();
		await hub.close();
	}, 20_000);

	test("routing to unknown, closed, or disconnected peers yields 'peer offline'", async () => {
		const { hub, home } = await startHub();
		const a = await TestClient.connect(meshPaths(home).socketPath);
		await a.request({ type: "register", peer: makePeer("sA"), git: GIT });

		const unknown = await a.request({ type: "send_message", targetSessionId: "nope", text: "x", mode: "steer" });
		expect(unknown.ok).toBe(false);
		expect(unknown.error).toBe("peer offline");

		// registered but no live connection (B registers then drops)
		const b = await TestClient.connect(meshPaths(home).socketPath);
		await b.request({ type: "register", peer: makePeer("sB"), git: GIT });
		b.close();
		await Bun.sleep(50);
		const dropped = await a.request({ type: "send_message", targetSessionId: "sB", text: "x", mode: "steer" });
		expect(dropped.ok).toBe(false);
		expect(dropped.error).toBe("peer offline");

		// closed peer
		const c = await TestClient.connect(meshPaths(home).socketPath);
		await c.request({ type: "register", peer: makePeer("sC"), git: GIT });
		await c.request({ type: "close", sessionId: "sC", reason: "done" });
		const closed = await a.request({ type: "send_message", targetSessionId: "sC", text: "x", mode: "steer" });
		expect(closed.ok).toBe(false);
		expect(closed.error).toBe("peer offline");

		a.close();
		c.close();
		await hub.close();
	});

	test("connection drop leaves registry state for the sweep to decide", async () => {
		const { hub, registry, home } = await startHub();
		const b = await TestClient.connect(meshPaths(home).socketPath);
		await b.request({ type: "register", peer: makePeer("sB"), git: GIT });
		b.close();
		await Bun.sleep(50);
		expect(registry.get("sB")!.state).toBe("waiting");
		await hub.close();
	});

	test("malformed JSON line gets an 'unknown' error response; connection survives", async () => {
		const { hub, home } = await startHub();
		const client = await TestClient.connect(meshPaths(home).socketPath);

		client.sendRaw("this is not json\n");
		await client.waitRaw(1);
		const err = client.raw[0]!;
		expect(err.id).toBe("unknown");
		expect(err.ok).toBe(false);

		// the same connection still serves well-formed requests
		const res = await client.request({ type: "query_peers" });
		expect(res.ok).toBe(true);

		client.close();
		await hub.close();
	});

	test("stale socket file is reclaimed", async () => {
		const home = mkdtempSync(join(tmpdir(), "pi-mesh-stale-"));
		const { socketPath, dir } = meshPaths(home);
		mkdirSync(dir, { recursive: true });
		writeFileSync(socketPath, "stale garbage"); // leftover file, nothing listening

		const registry = new Registry(DEFAULT_CONFIG, home);
		const hub = await createHubServer(registry, DEFAULT_CONFIG, home);
		const client = await TestClient.connect(socketPath);
		const res = await client.request({ type: "query_peers" });
		expect(res.ok).toBe(true);
		client.close();
		await hub.close();
	});

	test("second hub on the same socket is rejected while one is live", async () => {
		const { hub, home } = await startHub();
		const registry2 = new Registry(DEFAULT_CONFIG, home);
		await expect(createHubServer(registry2, DEFAULT_CONFIG, home)).rejects.toThrow("already listening");
		await hub.close();
	});

	test("follow/unfollow requests update the follow graph", async () => {
		const { hub, home } = await startHub();
		const a = await TestClient.connect(meshPaths(home).socketPath);
		const b = await TestClient.connect(meshPaths(home).socketPath);
		await a.request({ type: "register", peer: makePeer("sA"), git: GIT });
		await b.request({ type: "register", peer: makePeer("sB"), git: GIT });

		const ok = await a.request({ type: "follow", sessionId: "sA", targetSessionId: "sB" });
		expect(ok.ok).toBe(true);
		const peers = await a.request({ type: "query_peers" });
		const list = (peers.data as { peers: { sessionId: string; following: string[] }[] }).peers;
		expect(list.find((p) => p.sessionId === "sA")!.following).toEqual(["sB"]);

		const bad = await a.request({ type: "follow", sessionId: "sA", targetSessionId: "ghost" });
		expect(bad.ok).toBe(false);

		const unf = await a.request({ type: "unfollow", sessionId: "sA", targetSessionId: "sB" });
		expect(unf.ok).toBe(true);
		const peers2 = await a.request({ type: "query_peers" });
		const list2 = (peers2.data as { peers: { sessionId: string; following: string[] }[] }).peers;
		expect(list2.find((p) => p.sessionId === "sA")!.following).toEqual([]);

		a.close();
		b.close();
		await hub.close();
	});

	test("send_message auto-follows the sender connection's session", async () => {
		const { hub, registry, home } = await startHub();
		const a = await TestClient.connect(meshPaths(home).socketPath);
		const b = await TestClient.connect(meshPaths(home).socketPath);
		await a.request({ type: "register", peer: makePeer("sA"), git: GIT });
		await b.request({ type: "register", peer: makePeer("sB"), git: GIT });

		const sendPromise = a.request({ type: "send_message", targetSessionId: "sB", text: "hi", mode: "steer" });
		const push = await b.nextPush();
		b.respondPush(push.id as string, true, "started");
		expect((await sendPromise).ok).toBe(true);
		expect(registry.get("sA")!.following).toEqual(["sB"]);

		a.close();
		b.close();
		await hub.close();
	});

	test("followers get peer_state_changed pushes; non-followers do not", async () => {
		const { hub, home } = await startHub();
		const a = await TestClient.connect(meshPaths(home).socketPath); // follower
		const c = await TestClient.connect(meshPaths(home).socketPath); // bystander
		const b = await TestClient.connect(meshPaths(home).socketPath); // watched
		await a.request({ type: "register", peer: makePeer("sA"), git: GIT });
		await c.request({ type: "register", peer: makePeer("sC"), git: GIT });
		await b.request({ type: "register", peer: makePeer("sB"), git: GIT });
		await a.request({ type: "follow", sessionId: "sA", targetSessionId: "sB" });

		await b.request({ type: "heartbeat", sessionId: "sB", state: "running" }); // waiting -> running
		const push = await a.nextPush();
		expect(push.type).toBe("peer_state_changed");
		const peer = push.peer as { sessionId: string; state: string };
		expect(peer.sessionId).toBe("sB");
		expect(peer.state).toBe("running");

		// Bystander c must stay silent; a second same-state heartbeat must not push.
		await b.request({ type: "heartbeat", sessionId: "sB", state: "running" });
		await Bun.sleep(50);
		expect(c.raw.some((m) => m.type === "peer_state_changed")).toBe(false);
		expect(a.raw.filter((m) => m.type === "peer_state_changed").length).toBe(1);

		a.close();
		b.close();
		c.close();
		await hub.close();
	});
});
