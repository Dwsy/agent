/**
 * HTTP + SSE front-end for the WebUI.
 *
 * WHY it imports the router from server.ts: POST message/cancel must behave
 * exactly like their socket counterparts (same push routing/correlation).
 */
import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { MeshConfig } from "../config.ts";
import type { HubEvent } from "../protocol.ts";
import type { Registry } from "./registry.ts";
import type { HubRouter } from "./server.ts";
import { readTranscript } from "./transcript.ts";
import { handleReviewRequest } from "./review.ts";
import { renderMarkdown, type MarkdownTheme } from "./markdown.ts";
import { resumePeer, focusPeerWorkspace, realHerdr, newSessionInHerdr } from "../resume.ts";

const PUBLIC_DIR = resolve(fileURLToPath(new URL("./public/", import.meta.url)));
// Vendored npm assets for the browser (wterm terminal ESM + WASM).
const NODE_MODULES_DIR = resolve(fileURLToPath(new URL("../../node_modules/", import.meta.url)));
const PEERS_THROTTLE_MS = 1000;
const MAX_BODY_BYTES = 1_000_000;

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".map": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".txt": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
};

export interface HttpHubServer {
	/** Raw server for WebSocket upgrade attachment (terminal bridge). */
	server: http.Server;
	close(): Promise<void>;
}

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

function json(res: http.ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolvePromise, reject) => {
		let data = "";
		req.on("data", chunk => {
			data += chunk;
			if (data.length > MAX_BODY_BYTES) reject(new Error("body too large"));
		});
		req.on("end", () => resolvePromise(data));
		req.on("error", reject);
	});
}

export function createHttpServer(opts: {
	hub: HubRouter;
	registry: Registry;
	config: MeshConfig;
}): HttpHubServer {
	const { hub, registry, config } = opts;
	const clients = new Set<http.ServerResponse>();
	let lastPeersAt = 0;
	let peersTimer: ReturnType<typeof setTimeout> | null = null;
	let httpSeq = 0;
	const nextHttpId = () => `http-${++httpSeq}-${Date.now()}`;

	const broadcast = (event: HubEvent) => {
		const frame = `data: ${JSON.stringify(event)}\n\n`;
		for (const res of clients) {
			try {
				res.write(frame);
			} catch {
				// dead SSE client; it is removed on close
			}
		}
	};
	const sendPeers = () => {
		lastPeersAt = Date.now();
		broadcast({ type: "peers", peers: registry.list() });
	};
	const schedulePeers = () => {
		const wait = PEERS_THROTTLE_MS - (Date.now() - lastPeersAt);
		if (wait <= 0) {
			sendPeers();
			return;
		}
		if (peersTimer) return; // trailing send already scheduled
		peersTimer = setTimeout(() => {
			peersTimer = null;
			sendPeers();
		}, wait);
		peersTimer.unref?.();
	};

	registry.onChange(event => {
		if (event.type === "file_activity") broadcast(event); // same shape as HubEvent
		schedulePeers();
	});

	const serveStatic = (res: http.ServerResponse, pathname: string) => {
		const rel = pathname === "/" ? "index.html" : pathname.slice(1);
		// /vendor/* maps onto node_modules for browser ESM packages (wterm).
		const isVendor = rel.startsWith("vendor/");
		const base = isVendor ? NODE_MODULES_DIR : PUBLIC_DIR;
		const target = isVendor ? rel.slice("vendor/".length) : rel;
		const file = resolve(join(base, normalize(target)));
		if (!file.startsWith(base + sep)) {
			json(res, 404, { error: "not found" });
			return;
		}
		try {
			if (!statSync(file).isFile()) throw new Error("not a file");
			res.writeHead(200, {
				"Content-Type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
			});
			res.end(readFileSync(file));
		} catch {
			json(res, 404, { error: "not found" });
		}
	};

	const sse = (req: http.IncomingMessage, res: http.ServerResponse) => {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
		res.write(`data: ${JSON.stringify({ type: "peers", peers: registry.list() })}\n\n`);
		clients.add(res);
		lastPeersAt = Date.now();
		req.on("close", () => clients.delete(res));
	};

	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const parts = url.pathname.split("/").filter(Boolean);
		void (async () => {
			try {
				const [api, resource, sessionId, action] = parts;
				if (api === "api") {
					if (req.method === "GET" && resource === "events" && parts.length === 2) {
						sse(req, res);
						return;
					}
					if (req.method === "GET" && resource === "herdr" && parts.length === 2) {
						// Herdr index for the WebUI join (peer.sessionFile == agent sessionPath).
						// Best-effort: herdr absent/unreachable simply yields no hosts.
						try {
							json(res, 200, { agents: await realHerdr.listAgents() });
						} catch {
							json(res, 200, { agents: [] });
						}
						return;
					}
					if (req.method === "POST" && resource === "herdr" && parts.length === 3 && sessionId === "new-session") {
						let body: { cwd?: unknown; label?: unknown } = {};
						try {
							body = JSON.parse(await readBody(req)) as { cwd?: unknown; label?: unknown };
						} catch {
							json(res, 400, { error: "invalid JSON body" });
							return;
						}
						const { cwd, label } = body ?? {};
						if (cwd !== undefined && (typeof cwd !== "string" || cwd.length === 0)) {
							json(res, 400, { error: "cwd must be a non-empty string" });
							return;
						}
						if (label !== undefined && (typeof label !== "string" || label.length === 0)) {
							json(res, 400, { error: "label must be a non-empty string" });
							return;
						}
						const out = await newSessionInHerdr({
							cwd: typeof cwd === "string" ? cwd : undefined,
							label: typeof label === "string" ? label : undefined,
						});
						json(res, 200, { ok: out.ok, message: out.message, workspaceId: out.workspaceId, paneId: out.paneId });
						return;
					}
					if (req.method === "GET" && resource === "peers" && parts.length === 2) {
						json(res, 200, { peers: registry.list() });
						return;
					}
					if (resource === "peers" && parts.length === 4 && req.method === "GET" && action === "transcript") {
						const peer = registry.get(sessionId);
						if (!peer) {
							json(res, 404, { error: "unknown session" });
							return;
						}
						if (peer.ephemeral) {
							json(res, 400, { error: "临时会话（--no-session）无历史记录" });
							return;
						}
						if (!existsSync(peer.sessionFile)) {
							// Ghost record: the JSONL was deleted behind the registry's back.
							json(res, 404, { error: "会话文件已不存在" });
							return;
						}
						const limitParam = url.searchParams.get("limit");
						try {
							const entries = readTranscript(peer.sessionFile, {
								limit: limitParam !== null ? Number(limitParam) : undefined,
								beforeEntryId: url.searchParams.get("beforeEntryId") ?? undefined,
							});
							// Server-side Markdown rendering (satteri + expressive-code + mermaid)
							// for prose entries; tool results stay plain monospace. Theme feeds
							// mermaid's static SVG. The WebUI sanitizes via DOMPurify (htmlSafe).
							const theme: MarkdownTheme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
							const rendered = await Promise.all(
								entries.map(async (e) =>
									e.role === "toolResult" || !e.text
										? e
										: { ...e, html: await renderMarkdown(e.text, theme).catch(() => undefined) },
								),
							);
							json(res, 200, { entries: rendered });
						} catch (err) {
							json(res, 500, { error: errMessage(err) });
						}
						return;
					}
					if (resource === "peers" && parts.length === 4 && req.method === "GET" && action === "review") {
						const peer = registry.get(sessionId);
						if (!peer) {
							json(res, 404, { error: "unknown session" });
							return;
						}
						if (peer.ephemeral) {
							json(res, 200, { ok: false, error: "临时会话（--no-session）无文件改动记录" });
							return;
						}
						if (!existsSync(peer.sessionFile)) {
							json(res, 200, { ok: false, error: "会话文件已不存在" });
							return;
						}
						json(res, 200, await handleReviewRequest(peer.sessionFile));
						return;
					}
					if (resource === "peers" && parts.length === 4 && req.method === "POST" && action === "message") {
						let body: { text?: unknown; mode?: unknown; fromSessionId?: unknown };
						try {
							body = JSON.parse(await readBody(req));
						} catch {
							json(res, 400, { error: "invalid JSON body" });
							return;
						}
						const { text, mode, fromSessionId } = body ?? {};
						if (typeof text !== "string" || text.length === 0) {
							json(res, 400, { error: "text is required" });
							return;
						}
						if (mode !== "steer" && mode !== "followUp") {
							json(res, 400, { error: "mode must be steer or followUp" });
							return;
						}
						if (fromSessionId !== undefined && typeof fromSessionId !== "string") {
							json(res, 400, { error: "fromSessionId must be a string" });
							return;
						}
						const result = await hub.handle(
							{
								id: nextHttpId(),
								type: "send_message",
								targetSessionId: sessionId,
								text,
								mode,
							},
							// Auto-follow needs a named sender; anonymous callers create no edge.
							{ senderSessionId: fromSessionId },
						);
						if (result.ok) {
							json(res, 200, {
								ok: true,
								disposition: (result.data as { disposition?: string } | undefined)?.disposition,
							});
						} else {
							json(res, 200, { ok: false, error: result.error });
						}
						return;
					}
					if (resource === "peers" && parts.length === 4 && req.method === "POST" && action === "cancel") {
						const result = await hub.handle({
							id: nextHttpId(),
							type: "cancel",
							targetSessionId: sessionId,
						});
						json(res, 200, result.ok ? { ok: true } : { ok: false, error: result.error });
						return;
					}
					if (
						resource === "peers" &&
						parts.length === 4 &&
						req.method === "POST" &&
						(action === "follow" || action === "unfollow")
					) {
						let body: { targetSessionId?: unknown };
						try {
							body = JSON.parse(await readBody(req));
						} catch {
							json(res, 400, { error: "invalid JSON body" });
							return;
						}
						const { targetSessionId } = body ?? {};
						if (typeof targetSessionId !== "string" || targetSessionId.length === 0) {
							json(res, 400, { error: "targetSessionId is required" });
							return;
						}
						const result = await hub.handle({
							id: nextHttpId(),
							type: action === "follow" ? "follow" : "unfollow",
							sessionId,
							targetSessionId,
						});
						json(res, 200, result.ok ? { ok: true } : { ok: false, error: result.error });
						return;
					}
					if (resource === "peers" && parts.length === 4 && req.method === "POST" && action === "resume") {
						const peer = registry.get(sessionId);
						if (!peer) {
							json(res, 404, { error: "unknown session" });
							return;
						}
						if (peer.ephemeral) {
							json(res, 200, { ok: false, message: "临时会话（--no-session）不可恢复" });
							return;
						}
						let body: { fork?: unknown } = {};
						try {
							body = JSON.parse(await readBody(req)) as { fork?: unknown };
						} catch {
							json(res, 400, { error: "invalid JSON body" });
							return;
						}
						if (body.fork !== undefined && typeof body.fork !== "boolean") {
							json(res, 400, { error: "fork must be a boolean" });
							return;
						}
						// Scoped hub exception to the passive-hub rule: resume is always
						// user-initiated and only ever launches `herdr`/`pi` via resumePeer.
						const gate = {
							async claim(p: typeof peer, owner: string) {
								const r = await hub.handle({ id: nextHttpId(), type: "claim_resume", sessionId: p.sessionId, owner });
								if (!r.ok) throw new Error(r.error ?? "hub error");
							},
							async record(p: typeof peer, owner: string, ws?: string, pane?: string) {
								const r = await hub.handle({
									id: nextHttpId(),
									type: "record_resume",
									sessionId: p.sessionId,
									owner,
									herdrWorkspaceId: ws,
									herdrPaneId: pane,
								});
								if (!r.ok) throw new Error(r.error ?? "hub error");
							},
						};
						const out = await resumePeer(peer, { fork: body.fork === true, owner: "webui" }, undefined, gate);
						json(res, 200, { ok: out.ok, message: out.message, workspaceId: out.workspaceId, paneId: out.paneId });
						return;
					}
					if (resource === "peers" && parts.length === 4 && req.method === "POST" && action === "focus") {
						const peer = registry.get(sessionId);
						if (!peer) {
							json(res, 404, { error: "unknown session" });
							return;
						}
						const out = await focusPeerWorkspace(peer);
						json(res, 200, { ok: out.ok, message: out.message, workspaceId: out.workspaceId });
						return;
					}
					json(res, 404, { error: "not found" });
					return;
				}
				if (req.method !== "GET") {
					json(res, 404, { error: "not found" });
					return;
				}
				serveStatic(res, url.pathname);
			} catch (err) {
				json(res, 500, { error: errMessage(err) });
			}
		})();
	});

	server.listen(config.httpPort, "127.0.0.1");

	return {
		server,
		close: () =>
			new Promise<void>(resolvePromise => {
				if (peersTimer) clearTimeout(peersTimer);
				for (const res of clients) {
					try {
						res.end();
					} catch {
						// best effort
					}
				}
				clients.clear();
				server.close(() => resolvePromise());
			}),
	};
}
