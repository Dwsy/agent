/**
 * Unix socket / named pipe JSONL hub server, plus the shared request router.
 *
 * WHY the router is exported separately: the HTTP layer (http.ts) routes
 * POST message/cancel through the exact same code path as the socket server,
 * so push delivery/correlation lives in one place.
 */
import net from "node:net";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import type { MeshConfig } from "../config.ts";
import type { HubPush, HubRequest, HubResponse, PushResponse } from "../protocol.ts";
import type { PeerStateNotice } from "../protocol.ts";
import { meshPaths } from "../protocol.ts";
import type { Registry } from "./registry.ts";
import { readTranscript } from "./transcript.ts";

const PUSH_TIMEOUT_MS = 10_000;

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export type HubResult = { ok: boolean; data?: unknown; error?: string };

/** Shared router surface: one entry point for both transports. */
export interface HubRouter {
	/** senderSessionId: the requesting agent (socket connection or HTTP caller). */
	handle(req: HubRequest, opts?: { senderSessionId?: string }): Promise<HubResult>;
}

export interface HubServer extends HubRouter {
	readonly socketPath: string;
	close(): Promise<void>;
}

interface PendingPush {
	conn: net.Socket;
	resolve: (resp: PushResponse) => void;
}

type ConnectionTable = Map<string, net.Socket>;
type PendingTable = Map<string, PendingPush>;

/**
 * Forward a push to the target's live connection and await its PushResponse.
 * Route errors use the contract strings: "peer offline" / "peer did not respond".
 */
function routePush(
	connections: ConnectionTable,
	pending: PendingTable,
	registry: Registry,
	targetSessionId: string,
	push: HubPush,
): Promise<HubResult> {
	const target = registry.get(targetSessionId);
	const conn = connections.get(targetSessionId);
	if (!conn || conn.destroyed || !target || target.state === "offline" || target.state === "closed") {
		return Promise.resolve({ ok: false, error: "peer offline" });
	}
	return new Promise<HubResult>(resolve => {
		const timer = setTimeout(() => {
			pending.delete(push.id);
			resolve({ ok: false, error: "peer did not respond" });
		}, PUSH_TIMEOUT_MS);
		timer.unref?.();
		pending.set(push.id, {
			conn,
			resolve: resp => {
				clearTimeout(timer);
				if (resp.ok) {
					const data = resp.disposition !== undefined ? { disposition: resp.disposition } : undefined;
					resolve({ ok: true, data });
				} else {
					resolve({ ok: false, error: resp.error ?? "push failed" });
				}
			},
		});
		try {
			conn.write(`${JSON.stringify(push)}\n`);
		} catch {
			clearTimeout(timer);
			pending.delete(push.id);
			resolve({ ok: false, error: "peer offline" });
		}
	});
}

export async function createHubServer(
	registry: Registry,
	config: MeshConfig,
	home: string,
): Promise<HubServer> {
	const { socketPath } = meshPaths(home);
	const connections: ConnectionTable = new Map();
	const sessionsByConn = new Map<net.Socket, string>();
	const pending: PendingTable = new Map();
	const sockets = new Set<net.Socket>();
	let pushSeq = 0;
	const nextPushId = () => `push-${++pushSeq}-${Date.now()}`;

	mkdirSync(meshPaths(home).dir, { recursive: true });

	/**
	 * Fire-and-forget state notification to followers. No PushResponse await:
	 * notifications must not block registry mutations; an absent/late reply is
	 * acceptable loss, unlike request/response pushes.
	 */
	const notifyFollowers = (notice: PeerStateNotice) => {
		for (const followerId of registry.followersOf(notice.sessionId)) {
			const conn = connections.get(followerId);
			if (!conn || conn.destroyed) continue;
			try {
				conn.write(
					`${JSON.stringify({ type: "peer_state_changed", id: nextPushId(), peer: notice } satisfies HubPush)}\n`,
				);
			} catch {
				// follower vanished mid-write; the sweep will mark it offline
			}
		}
	};
	const offRegistry = registry.onChange(event => {
		if (event.type === "state_change") notifyFollowers(event.notice);
	});

	const handle = async (req: HubRequest, opts?: { senderSessionId?: string }): Promise<HubResult> => {
		try {
			switch (req.type) {
				case "register":
					registry.register(req.peer, req.git);
					return { ok: true };
				case "heartbeat":
					registry.heartbeat(req.sessionId, req.state, req.model, req.title);
					return { ok: true };
				case "file_activity":
					registry.addFiles(req.sessionId, req.files);
					return { ok: true };
				case "close":
					registry.close(req.sessionId, req.reason);
					return { ok: true };
				case "follow":
					registry.follow(req.sessionId, req.targetSessionId);
					return { ok: true };
				case "unfollow":
					registry.unfollow(req.sessionId, req.targetSessionId);
					return { ok: true };
				case "claim_resume":
					return { ok: true, data: registry.claimResume(req) };
				case "record_resume":
					return {
						ok: true,
						data: registry.recordResume({
							sessionId: req.sessionId,
							owner: req.owner,
							herdrWorkspaceId: req.herdrWorkspaceId,
							herdrPaneId: req.herdrPaneId,
						}),
					};
				case "query_peers":
					return { ok: true, data: { peers: registry.list() } };
				case "query_transcript": {
					const peer = registry.get(req.sessionId);
					if (!peer) return { ok: false, error: "unknown session" };
					try {
						const entries = readTranscript(peer.sessionFile, {
							limit: req.limit,
							beforeEntryId: req.beforeEntryId,
						});
						return { ok: true, data: { entries } };
					} catch (err) {
						return { ok: false, error: errMessage(err) };
					}
				}
				case "send_message": {
					const result = await routePush(connections, pending, registry, req.targetSessionId, {
						type: "deliver_message",
						id: nextPushId(),
						text: req.text,
						mode: req.mode,
					});
					// Messaging a peer auto-follows it (explicit unfollow detaches).
					const sender = opts?.senderSessionId ?? req.fromSessionId;
					if (result.ok && sender) {
						try {
							registry.follow(sender, req.targetSessionId);
						} catch {
							// sender not registered (e.g. raw CLI without PI_SESSION_ID): no edge
						}
					}
					return result;
				}
				case "cancel":
					return routePush(connections, pending, registry, req.targetSessionId, {
						type: "cancel",
						id: nextPushId(),
					});
				default:
					return { ok: false, error: `unknown request type: ${String((req as { type?: unknown }).type)}` };
			}
		} catch (err) {
			return { ok: false, error: errMessage(err) };
		}
	};

	const writeMsg = (conn: net.Socket, msg: HubResponse) => {
		try {
			conn.write(`${JSON.stringify(msg)}\n`);
		} catch {
			// peer vanished mid-write; nothing to do
		}
	};

	const onLine = async (conn: net.Socket, line: string) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			// Contract: parse errors still answer, with id "unknown".
			writeMsg(conn, { id: "unknown", type: "response", ok: false, error: "invalid JSON line" });
			return;
		}
		const msg = parsed as { id?: unknown; type?: unknown };
		if (msg.type === "push_response") {
			const resp = parsed as PushResponse;
			const entry = pending.get(resp.id);
			if (entry) {
				pending.delete(resp.id);
				entry.resolve(resp);
			}
			return; // push_response is not a HubRequest; no HubResponse
		}
		const id = typeof msg.id === "string" ? msg.id : "unknown";
		const senderSessionId = sessionsByConn.get(conn);
		const result = await handle(msg as HubRequest, { senderSessionId });
		if (msg.type === "register" && result.ok) {
			const sessionId = (msg as { peer?: { sessionId?: string } }).peer?.sessionId;
			if (sessionId) {
				connections.set(sessionId, conn); // "agent connection"
				sessionsByConn.set(conn, sessionId);
			}
		}
		writeMsg(conn, { id, type: "response", ok: result.ok, data: result.data, error: result.error });
	};

	const server = net.createServer(conn => {
		sockets.add(conn);
		conn.setEncoding("utf8");
		let buf = "";
		conn.on("data", chunk => {
			buf += chunk;
			let nl: number;
			while ((nl = buf.indexOf("\n")) >= 0) {
				const line = buf.slice(0, nl).trim();
				buf = buf.slice(nl + 1);
				if (line) void onLine(conn, line);
			}
		});
		const drop = () => {
			sockets.delete(conn);
			sessionsByConn.delete(conn);
			for (const [sessionId, c] of connections) {
				if (c === conn) connections.delete(sessionId);
			}
			// Registry state stays untouched: the heartbeat sweep marks offline.
			for (const [pushId, entry] of [...pending]) {
				if (entry.conn === conn) {
					pending.delete(pushId);
					entry.resolve({ type: "push_response", id: pushId, ok: false, error: "peer did not respond" });
				}
			}
		};
		conn.on("close", drop);
		conn.on("error", drop); // dead peers surface as errors; must not crash the hub
	});

	await new Promise<void>((resolve, reject) => {
		const listen = () => server.listen(socketPath);
		const onError = (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE" || err.code === "EEXIST") {
				// Stale socket recovery: if nothing answers, reclaim the file.
				const probe = net.connect(socketPath);
				probe.on("connect", () => {
					probe.destroy();
					reject(new Error(`pi-mesh: hub already listening on ${socketPath}`));
				});
				probe.on("error", () => {
					probe.destroy();
					try {
						unlinkSync(socketPath);
					} catch {
						// already gone
					}
					listen();
				});
				return;
			}
			reject(err);
		};
		server.on("error", onError);
		server.once("listening", () => {
			server.removeListener("error", onError);
			resolve();
		});
		listen();
	});

	return {
		socketPath,
		handle,
		close: () =>
			new Promise<void>(resolve => {
				offRegistry();
				for (const conn of sockets) conn.destroy();
				sockets.clear();
				for (const [pushId, entry] of [...pending]) {
					pending.delete(pushId);
					entry.resolve({ type: "push_response", id: pushId, ok: false, error: "peer did not respond" });
				}
				server.close(() => resolve());
				if (process.platform !== "win32" && existsSync(socketPath)) {
					try {
						unlinkSync(socketPath);
					} catch {
						// best effort
					}
				}
			}),
	};
}
