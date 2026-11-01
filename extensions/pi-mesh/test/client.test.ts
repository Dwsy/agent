import { afterEach, describe, expect, test } from "bun:test";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MeshClient, nextId } from "../src/client.ts";
import type { HubMessage, HubPush, HubRequest, HubResponse, PushResponse } from "../src/protocol.ts";

// ── fake hub speaking the JSONL protocol over a real unix socket ──────────

interface Hub {
	socketPath: string;
	received: HubMessage[];
	sockets: net.Socket[];
	/** Send a push to the most recent connection. */
	push(msg: unknown): void;
	/** Wait until `pred` matches some received message (2s timeout). */
	waitFor(pred: (msg: HubMessage) => boolean): Promise<HubMessage>;
	close(): Promise<void>;
}

interface HubOptions {
	/** Custom request handling; call `reply` whenever you like. */
	onRequest?: (req: HubRequest, reply: (res: HubResponse) => void) => void;
	/** Drop the very first connection on accept (drives the reconnect path). */
	dropFirstConnection?: boolean;
	/** Default: echo every request back as ok:true. */
	autoRespond?: boolean;
}

function startHub(options: HubOptions = {}): Promise<Hub> {
	const dir = mkdtempSync(join(tmpdir(), "pm-"));
	tempDirs.push(dir);
	const socketPath = join(dir, "s.sock");
	const received: HubMessage[] = [];
	const sockets: net.Socket[] = [];

	const server = net.createServer((socket) => {
		sockets.push(socket);
		if (options.dropFirstConnection && sockets.length === 1) {
			socket.destroy();
			return;
		}
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk.toString("utf8");
			let index = buffer.indexOf("\n");
			while (index >= 0) {
				const line = buffer.slice(0, index).trim();
				buffer = buffer.slice(index + 1);
				if (line) {
					const msg = JSON.parse(line) as HubMessage;
					received.push(msg);
					if ((msg as { type?: string }).type === "push_response") {
						// extension/CLI answering a push: recorded only
					} else {
						const req = msg as HubRequest;
						const reply = (res: HubResponse) => socket.write(`${JSON.stringify(res)}\n`);
						if (options.onRequest) options.onRequest(req, reply);
						else if (options.autoRespond !== false) {
							reply({ id: req.id, type: "response", ok: true, data: { echo: req } });
						}
					}
				}
				index = buffer.indexOf("\n");
			}
		});
	});

	return new Promise((resolve) => {
		server.listen(socketPath, () => {
			resolve({
				socketPath,
				received,
				sockets,
				push: (msg) => sockets[sockets.length - 1]?.write(`${JSON.stringify(msg)}\n`),
				waitFor: (pred) =>
					new Promise<HubMessage>((res, rej) => {
						const deadline = Date.now() + 2000;
						const poll = () => {
							const hit = received.find(pred);
							if (hit) return res(hit);
							if (Date.now() > deadline) return rej(new Error("waitFor timed out"));
							setTimeout(poll, 10);
						};
						poll();
					}),
				close: () =>
					new Promise<void>((res) => {
						for (const s of sockets) s.destroy();
						server.close(() => res());
					}),
			});
		});
	});
}

async function until(cond: () => boolean, timeoutMs = 2000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!cond()) {
		if (Date.now() > deadline) throw new Error("until timed out");
		await new Promise((res) => setTimeout(res, 10));
	}
}

const tempDirs: string[] = [];
const hubs: Hub[] = [];
const clients: MeshClient[] = [];

function makeClient(options: ConstructorParameters<typeof MeshClient>[0]): MeshClient {
	const client = new MeshClient(options);
	clients.push(client);
	return client;
}

afterEach(async () => {
	for (const client of clients.splice(0)) client.close();
	for (const hub of hubs.splice(0)) await hub.close();
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// ── tests ────────────────────────────────────────────────────────────────

describe("MeshClient", () => {
	test("correlates concurrent responses by id, even out of order", async () => {
		let count = 0;
		const hub = await startHub({
			onRequest: (req, reply) => {
				// Reverse arrival order: id-0 answers last.
				const delay = 60 - (count++ % 3) * 25;
				setTimeout(() => reply({ id: req.id, type: "response", ok: true, data: { echo: req } }), delay);
			},
		});
		hubs.push(hub);
		const client = makeClient({ socketPath: hub.socketPath });

		const reqs: HubRequest[] = [0, 1, 2].map((i) => ({ id: `id-${i}`, type: "query_peers" }));
		const responses = await Promise.all(reqs.map((req) => client.request(req)));
		for (const [i, res] of responses.entries()) {
			expect(res.id).toBe(`id-${i}`);
			expect(res.ok).toBe(true);
			expect((res.data as { echo: HubRequest }).echo.id).toBe(`id-${i}`);
		}
	});

	test("resolves ok:false responses instead of rejecting", async () => {
		const hub = await startHub({
			onRequest: (req, reply) => reply({ id: req.id, type: "response", ok: false, error: "nope" }),
		});
		hubs.push(hub);
		const client = makeClient({ socketPath: hub.socketPath });

		const res = await client.request({ id: nextId(), type: "query_peers" });
		expect(res.ok).toBe(false);
		expect(res.error).toBe("nope");
	});

	test("push handler runs and its PushResponse goes back to the hub", async () => {
		const hub = await startHub();
		hubs.push(hub);
		const client = makeClient({ socketPath: hub.socketPath });
		const seen: HubPush[] = [];
		client.onPush((push) => {
			seen.push(push);
			return { type: "push_response", id: push.id, ok: true, disposition: "started" };
		});
		await client.connect();

		hub.push({ type: "deliver_message", id: "p1", text: "hello", mode: "steer" });
		const reply = (await hub.waitFor(
			(m) => (m as { type?: string }).type === "push_response" && (m as { id?: string }).id === "p1",
		)) as PushResponse;
		expect(reply.ok).toBe(true);
		expect(reply.disposition).toBe("started");
		expect(seen).toEqual([{ type: "deliver_message", id: "p1", text: "hello", mode: "steer" }]);
	});

	test("a throwing push handler answers ok:false, never breaks the connection", async () => {
		const hub = await startHub();
		hubs.push(hub);
		const client = makeClient({ socketPath: hub.socketPath });
		client.onPush(() => {
			throw new Error("boom");
		});
		await client.connect();

		hub.push({ type: "cancel", id: "p2" });
		const reply = (await hub.waitFor(
			(m) => (m as { type?: string }).type === "push_response" && (m as { id?: string }).id === "p2",
		)) as PushResponse;
		expect(reply.ok).toBe(false);
		expect(reply.error).toContain("boom");
		// connection still usable
		const res = await client.request({ id: nextId(), type: "query_peers" });
		expect(res.ok).toBe(true);
	});

	test("requests fail fast with a clear error when the hub is not running", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pm-"));
		tempDirs.push(dir);
		const client = makeClient({ socketPath: join(dir, "missing.sock") });

		await expect(client.connect()).rejects.toThrow(/cannot connect to hub/);
		await expect(client.request({ id: nextId(), type: "query_peers" })).rejects.toThrow(/cannot connect to hub/);
	});

	test("pending requests reject when the connection drops", async () => {
		const hub = await startHub({ autoRespond: false });
		hubs.push(hub);
		const client = makeClient({ socketPath: hub.socketPath, backoffMinMs: 10, backoffMaxMs: 20 });

		const pending = client.request({ id: nextId(), type: "query_peers" });
		await hub.waitFor((m) => (m as { type?: string }).type !== "push_response");
		hub.sockets[0].destroy();
		await expect(pending).rejects.toThrow(/connection lost/);
	});

	test("reconnects after a drop and fires onReconnect for re-registration", async () => {
		const hub = await startHub({ dropFirstConnection: true });
		hubs.push(hub);
		let connects = 0;
		const client = makeClient({
			socketPath: hub.socketPath,
			backoffMinMs: 10,
			backoffMaxMs: 20,
			onReconnect: () => {
				connects += 1;
			},
		});

		await client.connect().catch(() => {}); // connection 1 is dropped by the hub
		await until(() => hub.sockets.length >= 2); // background retry lands
		expect(connects).toBeGreaterThanOrEqual(2); // first connect + reconnect

		const res = await client.request({ id: nextId(), type: "query_peers" });
		expect(res.ok).toBe(true);
	});

	test("close() is idempotent, rejects pending and later work", async () => {
		const hub = await startHub({ autoRespond: false });
		hubs.push(hub);
		const client = makeClient({ socketPath: hub.socketPath, backoffMinMs: 10, backoffMaxMs: 20 });

		const pending = client.request({ id: nextId(), type: "query_peers" });
		await hub.waitFor((m) => (m as { type?: string }).type !== "push_response");
		client.close();
		client.close();
		await expect(pending).rejects.toThrow(/closed/);
		await expect(client.request({ id: nextId(), type: "query_peers" })).rejects.toThrow(/closed/);
		await expect(client.connect()).rejects.toThrow(/closed/);
	});
});
