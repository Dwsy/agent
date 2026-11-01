/**
 * MeshClient — newline-delimited JSON client for the pi-mesh hub socket.
 *
 * WHY: the extension must never break the pi session when the hub misbehaves,
 * so requests fail fast when the connection is down while a background
 * reconnect loop (exponential backoff 1s -> 30s) keeps trying to re-attach.
 * After every successful (re)connect `onReconnect` fires so the owner can
 * re-send its `register` hello; it fires on first connect too, so a hub that
 * only comes up late still gets registered.
 */
import net from "node:net";
import { randomUUID } from "node:crypto";
import type { HubPush, HubRequest, HubResponse, PushResponse } from "./protocol.ts";

export type PushHandler = (push: HubPush) => PushResponse | Promise<PushResponse>;

export interface MeshClientOptions {
	socketPath: string;
	/** Fired (not awaited) after every successful connection; re-register here. */
	onReconnect?: () => void | Promise<void>;
	/** Test seams so reconnect timing can be shrunk. */
	backoffMinMs?: number;
	backoffMaxMs?: number;
}

interface Pending {
	resolve: (res: HubResponse) => void;
	reject: (err: Error) => void;
}

/** Requests reject with this when the socket is (or just went) down. */
const LOST_ERROR = "pi-mesh: hub connection lost";
const CLOSED_ERROR = "pi-mesh: client closed";

/** Id generator for requests (ids correlate one response to one request). */
export function nextId(): string {
	return randomUUID();
}

export class MeshClient {
	#socketPath: string;
	#onReconnect: (() => void | Promise<void>) | undefined;
	#backoffMinMs: number;
	#backoffMaxMs: number;

	#socket: net.Socket | null = null;
	#connecting: Promise<void> | null = null;
	#retrying = false;
	#attempts = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#closed = false;

	#buffer = "";
	#pending = new Map<string, Pending>();
	#pushHandler: PushHandler | null = null;

	constructor(options: MeshClientOptions) {
		this.#socketPath = options.socketPath;
		this.#onReconnect = options.onReconnect;
		this.#backoffMinMs = options.backoffMinMs ?? 1000;
		this.#backoffMaxMs = options.backoffMaxMs ?? 30_000;
	}

	/** Handle hub pushes (deliver_message / cancel). Replies are sent for you. */
	onPush(handler: PushHandler): void {
		this.#pushHandler = handler;
	}

	/** One connection attempt. Rejects fast when the hub is not reachable. */
	connect(): Promise<void> {
		if (this.#closed) return Promise.reject(new Error(CLOSED_ERROR));
		if (this.#socket) return Promise.resolve();
		return this.#ensureSocket();
	}

	/**
	 * Send one request and await its response. Resolves with the HubResponse
	 * even when `ok` is false (application-level failure); rejects only on
	 * transport failure (connect error, socket drop, closed client).
	 */
	request(req: HubRequest): Promise<HubResponse> {
		return new Promise<HubResponse>((resolve, reject) => {
			if (this.#closed) {
				reject(new Error(CLOSED_ERROR));
				return;
			}
			const send = () => {
				const pending: Pending = { resolve, reject };
				this.#pending.set(req.id, pending);
				try {
					this.#write(req);
				} catch (err) {
					this.#pending.delete(req.id);
					reject(err instanceof Error ? err : new Error(String(err)));
				}
			};
			if (this.#socket) {
				send();
				return;
			}
			if (this.#retrying) {
				// A drop-triggered backoff loop owns reconnection: fail fast.
				reject(new Error(LOST_ERROR));
				return;
			}
			// First use (or never connected): one fail-fast connect attempt.
			this.#ensureSocket().then(send, reject);
		});
	}

	/** Idempotent. Rejects pending requests and stops the reconnect loop. */
	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		if (this.#reconnectTimer) {
			clearTimeout(this.#reconnectTimer);
			this.#reconnectTimer = null;
		}
		this.#rejectAll(new Error(CLOSED_ERROR));
		const socket = this.#socket;
		this.#socket = null;
		socket?.destroy();
	}

	// ── internals ────────────────────────────────────────────────────────

	#ensureSocket(): Promise<void> {
		this.#connecting ??= this.#openSocket().finally(() => {
			this.#connecting = null;
		});
		return this.#connecting;
	}

	#openSocket(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const socket = net.createConnection(this.#socketPath);
			let settled = false;
			const failConnect = (err: Error) => {
				if (settled) return;
				settled = true;
				socket.destroy();
				reject(new Error(`pi-mesh: cannot connect to hub at ${this.#socketPath}: ${err.message}`));
			};
			socket.once("connect", () => {
				if (this.#closed) {
					failConnect(new Error(CLOSED_ERROR));
					return;
				}
				settled = true;
				this.#socket = socket;
				this.#retrying = false;
				this.#attempts = 0;
				socket.on("data", (chunk) => this.#onData(chunk));
				socket.on("error", () => {}); // surfaced through "close"
				socket.on("close", () => this.#onClose(socket));
				this.#fireReconnect();
				resolve();
			});
			socket.once("error", (err) => failConnect(err as Error));
			socket.once("close", () => {
				if (!settled) failConnect(new Error("connection closed before connect"));
			});
		});
	}

	#fireReconnect(): void {
		const cb = this.#onReconnect;
		if (!cb) return;
		try {
			void Promise.resolve(cb()).catch((err) => {
				console.error("[pi-mesh] onReconnect:", err instanceof Error ? err.message : err);
			});
		} catch (err) {
			console.error("[pi-mesh] onReconnect:", err instanceof Error ? err.message : err);
		}
	}

	#onClose(socket: net.Socket): void {
		if (this.#socket !== socket) return;
		this.#socket = null;
		this.#rejectAll(new Error(LOST_ERROR));
		this.#scheduleReconnect();
	}

	#scheduleReconnect(): void {
		if (this.#closed || this.#reconnectTimer) return;
		this.#retrying = true;
		const delay = Math.min(this.#backoffMinMs * 2 ** this.#attempts, this.#backoffMaxMs);
		this.#attempts += 1;
		const timer = setTimeout(() => {
			this.#reconnectTimer = null;
			this.#ensureSocket().catch(() => this.#scheduleReconnect());
		}, delay);
		timer.unref?.(); // never hold the pi process open for mesh retries
		this.#reconnectTimer = timer;
	}

	#onData(chunk: Buffer): void {
		this.#buffer += chunk.toString("utf8");
		let index = this.#buffer.indexOf("\n");
		while (index >= 0) {
			const line = this.#buffer.slice(0, index).trim();
			this.#buffer = this.#buffer.slice(index + 1);
			if (line) this.#dispatch(line);
			index = this.#buffer.indexOf("\n");
		}
	}

	#dispatch(line: string): void {
		let msg: unknown;
		try {
			msg = JSON.parse(line);
		} catch {
			return; // malformed frame: ignore rather than kill the connection
		}
		const m = msg as { type?: unknown; id?: unknown };
		if (typeof m !== "object" || m === null) return;
		if (m.type === "response" && typeof m.id === "string") {
			const pending = this.#pending.get(m.id);
			if (!pending) return;
			this.#pending.delete(m.id);
			pending.resolve(msg as HubResponse);
			return;
		}
		// Anything else from the hub is a routed push; always answer it.
		this.#handlePush(msg as HubPush);
	}

	#handlePush(push: HubPush): void {
		const id = typeof push?.id === "string" ? push.id : "";
		const respond = (res: PushResponse) => {
			try {
				this.#write(res);
			} catch {}
		};
		Promise.resolve()
			.then(() => {
				if (!this.#pushHandler) {
					return {
						type: "push_response",
						id,
						ok: false,
						error: "pi-mesh: no push handler registered",
					} satisfies PushResponse;
				}
				return this.#pushHandler(push);
			})
			.then(respond, (err) => respond({ type: "push_response", id, ok: false, error: String(err) }));
	}

	#write(msg: unknown): void {
		if (!this.#socket) throw new Error(LOST_ERROR);
		this.#socket.write(`${JSON.stringify(msg)}\n`);
	}

	#rejectAll(err: Error): void {
		const pending = [...this.#pending.values()];
		this.#pending.clear();
		for (const p of pending) p.reject(err);
	}
}
