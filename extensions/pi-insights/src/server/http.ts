/**
 * Local HTTP server for the pi-insights Web UI.
 *
 * Bound to 127.0.0.1 only. Routes are frozen in `docs/contract.md`; every JSON
 * response is `application/json; charset=utf-8` with `Cache-Control: no-store`,
 * and every error body is `{ error: string }`.
 */

import { execFile } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { countCachedSessions, getCacheDir, getSessionsRoot, loadSessionDetail } from "../index-api.js";
import { resolveCliLocale, t } from "./i18n.js";
import { getInsightsUiPort, probeInsightsUiOnPort } from "./port.js";
import {
	onScanProgress,
	parseRange,
	RANGE_KEYS,
	requestReport,
	warmRanges,
	type ScanProgress,
} from "./reports.js";
import { readPublicFile, readPublicIndex } from "./static.js";

const execFileAsync = promisify(execFile);

const HEARTBEAT_MS = 15_000;

let server: Server | null = null;
let boundPort: number | null = null;
let unsubscribeProgress: (() => void) | null = null;

const sseClients = new Set<ServerResponse>();

let cachedVersion: string | null = null;

function version(): string {
	if (cachedVersion) return cachedVersion;
	const path = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
	try {
		const pkg = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
		cachedVersion = typeof pkg.version === "string" ? pkg.version : "0.0.0";
	} catch {
		cachedVersion = "0.0.0";
	}
	return cachedVersion;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
	});
	res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, message: string): void {
	sendJson(res, status, { error: message });
}

function broadcastProgress(progress: ScanProgress): void {
	const frame = `event: progress\ndata: ${JSON.stringify(progress)}\n\n`;
	for (const client of sseClients) {
		try {
			client.write(frame);
		} catch {
			sseClients.delete(client);
		}
	}
}

function isInside(root: string, candidate: string): boolean {
	return candidate === root || candidate.startsWith(root + sep);
}

/**
 * Contract: only paths inside the sessions root, prefix-checked after realpath.
 * A path outside the root is 403 whether or not it exists, so the answer never
 * leaks what lives elsewhere on disk.
 */
function resolveSessionPath(raw: string): { path: string } | { status: 403 | 404 } {
	const root = tryRealpath(getSessionsRoot()) ?? resolve(getSessionsRoot());
	const candidate = resolve(raw);

	const real = tryRealpath(candidate);
	if (real) return isInside(root, real) ? { path: real } : { status: 403 };

	// The file is missing, so judge it by its parent: a 404 must never confirm
	// that something exists outside the root.
	const parent = tryRealpath(dirname(candidate));
	if (!parent || !isInside(root, parent)) return { status: 403 };
	return { status: 404 };
}

function tryRealpath(path: string): string | null {
	try {
		return realpathSync(path);
	} catch {
		return null;
	}
}

/** The data layer guards the root too; its rejection must surface as 403, not 500. */
function isEscapeError(err: unknown): boolean {
	return err instanceof Error && /outside|escape|traversal/i.test(err.message);
}

async function handleStatus(res: ServerResponse): Promise<void> {
	sendJson(res, 200, {
		ok: true,
		version: version(),
		sessionsDir: getSessionsRoot(),
		cacheDir: getCacheDir(),
		cachedSessions: await countCachedSessions(),
		ranges: warmRanges(),
	});
}

async function handleReport(res: ServerResponse, url: URL): Promise<void> {
	const raw = url.searchParams.get("range");
	const range = parseRange(raw);
	if (!range) {
		sendError(res, 400, `unknown range "${raw}", expected one of ${RANGE_KEYS.join(" | ")}`);
		return;
	}
	const refresh = url.searchParams.get("refresh");
	sendJson(res, 200, await requestReport(range, refresh === "1" || refresh === "true"));
}

async function handleSession(res: ServerResponse, url: URL): Promise<void> {
	const raw = url.searchParams.get("path");
	if (!raw) {
		sendError(res, 400, "path is required");
		return;
	}

	const resolved = resolveSessionPath(raw);
	if ("status" in resolved) {
		if (resolved.status === 403) {
			sendError(res, 403, "path is outside the sessions root");
			return;
		}
		sendError(res, 404, "session file not found");
		return;
	}

	try {
		sendJson(res, 200, await loadSessionDetail(resolved.path));
	} catch (err) {
		if (isEscapeError(err)) {
			sendError(res, 403, "path is outside the sessions root");
			return;
		}
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			sendError(res, 404, "session file not found");
			return;
		}
		throw err;
	}
}

async function handleRefresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
	req.resume();
	// A rebuild covers every session on disk, so it always scans the widest range.
	const report = await requestReport("all", true);
	sendJson(res, 200, { scan: report.scan });
}

function handleStream(req: IncomingMessage, res: ServerResponse): void {
	res.writeHead(200, {
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-store, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});
	res.write(": connected\n\n");
	sseClients.add(res);

	const heartbeat = setInterval(() => {
		try {
			res.write(": keepalive\n\n");
		} catch {
			clearInterval(heartbeat);
			sseClients.delete(res);
		}
	}, HEARTBEAT_MS);
	heartbeat.unref();

	req.on("close", () => {
		clearInterval(heartbeat);
		sseClients.delete(res);
	});
}

function handleStatic(res: ServerResponse, url: URL): void {
	const file = readPublicFile(url.pathname) ?? readPublicIndex();
	if (!file) {
		sendError(res, 404, "not found");
		return;
	}
	res.writeHead(200, { "Content-Type": file.contentType, "Cache-Control": "no-store" });
	res.end(file.body);
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const url = new URL(req.url ?? "/", "http://127.0.0.1");
	const method = req.method ?? "GET";
	const path = url.pathname;

	if (method === "GET" && path === "/api/status") return handleStatus(res);
	if (method === "GET" && path === "/api/report") return handleReport(res, url);
	if (method === "GET" && path === "/api/session") return handleSession(res, url);
	if (method === "POST" && path === "/api/refresh") return handleRefresh(req, res);
	if (method === "GET" && path === "/api/stream") return handleStream(req, res);

	if (path.startsWith("/api/")) {
		sendError(res, 404, `no route for ${method} ${path}`);
		return;
	}
	if (method !== "GET") {
		sendError(res, 405, `no route for ${method} ${path}`);
		return;
	}
	handleStatic(res, url);
}

function createHandler() {
	return (req: IncomingMessage, res: ServerResponse): void => {
		void route(req, res).catch((err: unknown) => {
			if (res.headersSent) {
				res.end();
				return;
			}
			sendError(res, 500, err instanceof Error ? err.message : String(err));
		});
	};
}

export function isInsightsUiRunning(): boolean {
	return boundPort !== null;
}

export function getInsightsUiUrl(): string | null {
	return boundPort === null ? null : `http://127.0.0.1:${boundPort}/`;
}

/** URL of a live UI: this process's server, else one another Pi session started. */
export async function findLiveUiUrl(): Promise<string | null> {
	const local = getInsightsUiUrl();
	if (local) return local;
	const port = getInsightsUiPort();
	return (await probeInsightsUiOnPort(port)) ? `http://127.0.0.1:${port}/` : null;
}

export async function startInsightsServer(): Promise<string> {
	const port = getInsightsUiPort();

	if (boundPort !== null && boundPort !== port) await stopInsightsServer();
	if (boundPort !== null) return `http://127.0.0.1:${boundPort}/`;

	const pending = createServer(createHandler());
	await new Promise<void>((resolvePromise, reject) => {
		pending.once("error", (err: NodeJS.ErrnoException) => {
			if (err.code !== "EADDRINUSE") {
				reject(err);
				return;
			}
			void probeInsightsUiOnPort(port).then((isOurs) => {
				if (isOurs) {
					// Another Pi session already serves this port; reuse that instance.
					boundPort = port;
					resolvePromise();
					return;
				}
				reject(new Error(t(resolveCliLocale(), "portInUse", { port: String(port) })));
			}, reject);
		});
		pending.listen(port, "127.0.0.1", () => {
			server = pending;
			boundPort = port;
			resolvePromise();
		});
	});

	if (!unsubscribeProgress) unsubscribeProgress = onScanProgress(broadcastProgress);
	return `http://127.0.0.1:${boundPort ?? port}/`;
}

export async function stopInsightsServer(): Promise<void> {
	unsubscribeProgress?.();
	unsubscribeProgress = null;
	for (const client of sseClients) client.end();
	sseClients.clear();

	const current = server;
	server = null;
	boundPort = null;
	if (!current) return;
	const closed = new Promise<void>((resolvePromise) => current.close(() => resolvePromise()));
	// Keep-alive sockets would otherwise hold the close open past session shutdown.
	current.closeAllConnections();
	await closed;
}

export async function openBrowser(url: string): Promise<void> {
	const command = process.platform === "darwin" ? "open" : "xdg-open";
	await execFileAsync(command, [url]);
}
