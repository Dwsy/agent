/**
 * pi hook wiring for pi-mesh: lifecycle state, file activity, hub control plane.
 *
 * WHY this shape: zero tools are registered — the entire capability surface is
 * the pi-mesh skill (see index.ts). Everything here is silent telemetry plus
 * hub-routed control (deliver_message / cancel), and every handler is wrapped
 * so hub problems can never break the pi session (stderr logging only).
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import os from "node:os";
import type { FileActivity, HubPush, HubRequest, PeerInfo, PushResponse } from "./protocol.ts";
import { DEFAULT_CONFIG, loadConfig, type MeshConfig } from "./config.ts";
import { meshPaths } from "./protocol.ts";
import { MeshClient, nextId } from "./client.ts";
import { resolveGitInfo } from "./git-info.ts";
import { ensureHubRunning } from "./ensure-hub.ts";

// ── module state (created lazily in session_start; no sockets/timers at load) ──

let api: ExtensionAPI | null = null;
let latestCtx: ExtensionContext | null = null;
let client: MeshClient | null = null;
let peer: PeerInfo | null = null;
let runState: "running" | "waiting" = "waiting";
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

const fileBatch: FileActivity[] = [];
let fileTimer: ReturnType<typeof setTimeout> | null = null;
/** tool_execution_end has no args: capture them at start, keyed by toolCallId. */
const argsByToolCall = new Map<string, unknown>();

function logErr(what: string, err: unknown): void {
	console.error(`[pi-mesh] ${what}:`, err instanceof Error ? err.message : err);
}

function safe<T>(fn: () => T): T | undefined {
	try {
		return fn();
	} catch {
		return undefined;
	}
}

// ── registration & heartbeats ────────────────────────────────────────────

/**
 * Session-mode detection — a truthful self-report of pi's REAL persistence
 * mechanism, not argv guessing.
 *
 * Ground truth (pi 1.4.0, `dist/core/session-manager.js` / `main.js`):
 *   - `pi --no-session` (also `--help`, `--list-models`, SDK in-memory hosts)
 *     builds the session via `SessionManager.inMemory()`, whose private
 *     `persist` flag is false; `isPersisted()` returns that flag.
 *   - In-memory sessions never get a session-file path (`getSessionFile()`
 *     returns `undefined`); file-backed sessions get their path at newSession()
 *     time (the JSONL is only written once a user/assistant message lands, but
 *     the path exists from the start — so a defined path means file mode).
 */
export type SessionPersistenceMode = "file" | "memory";

export interface SessionModeReport {
	persistence: SessionPersistenceMode;
	/** Derived: persistence === "memory". Wire-level flag for the hub. */
	ephemeral: boolean;
	/** Which signal decided — for diagnostics/tests. */
	source: "session-manager" | "session-file" | "argv";
}

/**
 * Minimal sessionManager surface the detector reads. `isPersisted` is omitted
 * from the published `ReadonlySessionManager` type but exists at runtime on the
 * live SessionManager handed to `ctx.sessionManager` (verified by probe).
 */
export interface SessionModeSource {
	isPersisted?: () => boolean;
	getSessionFile?: () => string | undefined;
}

export function detectSessionMode(
	sessionManager: SessionModeSource | null | undefined,
	argv: readonly string[],
): SessionModeReport {
	// 1. PRIMARY: pi's own persistence flag (the internal `persist` boolean).
	try {
		const isPersisted = sessionManager?.isPersisted;
		if (typeof isPersisted === "function") {
			const persisted = isPersisted.call(sessionManager);
			return {
				persistence: persisted ? "file" : "memory",
				ephemeral: !persisted,
				source: "session-manager",
			};
		}
	} catch {
		// fall through to the typed contract
	}
	// 2. Typed contract: `getSessionFile(): string | undefined` — undefined/empty
	//    means the session is in-memory and no JSONL will ever be written.
	try {
		const getSessionFile = sessionManager?.getSessionFile;
		if (typeof getSessionFile === "function") {
			const file = getSessionFile.call(sessionManager);
			const ephemeral = !file;
			return {
				persistence: ephemeral ? "memory" : "file",
				ephemeral,
				source: "session-file",
			};
		}
	} catch {
		// fall through to argv
	}
	// 3. FALLBACK ONLY (sessionManager surface unavailable/throwing): sniff argv.
	//    NOTE: `-n` is pi's --name short flag, NOT --no-session.
	const ephemeral = argv.includes("--no-session");
	return {
		persistence: ephemeral ? "memory" : "file",
		ephemeral,
		source: "argv",
	};
}

async function registerPeer(): Promise<void> {
	if (!client || !peer) return;
	try {
		await client.request({ id: nextId(), type: "register", peer, git: resolveGitInfo(peer.cwd) });
	} catch (err) {
		logErr("register", err);
	}
}

function sendHeartbeat(): void {
	if (!client || !peer) return;
	const req: HubRequest = {
		id: nextId(),
		type: "heartbeat",
		sessionId: peer.sessionId,
		state: runState,
		model: safe(() => latestCtx?.model?.id) ?? peer.model,
		title: safe(() => api?.getSessionName?.()) ?? peer.title,
	};
	void client.request(req).catch((err) => logErr("heartbeat", err));
}

// ── file activity (edit/write tools only, batched over 500ms) ────────────

function isFileTool(toolName: string): boolean {
	const name = toolName.toLowerCase();
	return name === "edit" || name === "write";
}

function extractPath(input: unknown): string | null {
	if (!input || typeof input !== "object") return null;
	const rec = input as Record<string, unknown>;
	for (const key of ["path", "file_path", "filePath"]) {
		const value = rec[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return null;
}

function noteFileActivity(toolName: string, input: unknown): void {
	const path = extractPath(input);
	if (!path) return;
	fileBatch.push({
		path,
		op: toolName.toLowerCase() === "write" ? "write" : "edit",
		ts: new Date().toISOString(),
	});
	if (fileTimer) return; // one window per burst; the timer flushes everything
	fileTimer = setTimeout(() => {
		fileTimer = null;
		flushFiles();
	}, 500);
	fileTimer.unref?.();
}

function flushFiles(): void {
	if (fileTimer) {
		clearTimeout(fileTimer);
		fileTimer = null;
	}
	if (fileBatch.length === 0 || !client || !peer) return;
	const files = fileBatch.splice(0, fileBatch.length);
	const req: HubRequest = { id: nextId(), type: "file_activity", sessionId: peer.sessionId, files };
	void client.request(req).catch((err) => logErr("file_activity", err));
}

// ── control plane (hub push -> this pi) ──────────────────────────────────

async function handlePush(push: HubPush): Promise<PushResponse> {
	const id = typeof push?.id === "string" ? push.id : "";
	try {
		if (push.type === "deliver_message") {
			if (!api) return { type: "push_response", id, ok: false, error: "pi-mesh: extension API unavailable" };
			api.sendUserMessage(push.text, { deliverAs: push.mode });
			return { type: "push_response", id, ok: true, disposition: "started" };
		}
		if (push.type === "cancel") {
			const ctx = latestCtx;
			if (!ctx) return { type: "push_response", id, ok: false, error: "pi-mesh: no session context to abort" };
			ctx.abort();
			return { type: "push_response", id, ok: true };
		}
		if (push.type === "peer_state_changed") {
			// Followed peer's state moved. Land it as a hidden note for the next
		// turn (no turn is triggered) plus a UI toast — collaboration, not noise.
			const p = push.peer;
			// Session ids share a timestamp prefix; the tail is the unique part.
			const label = p.title ? `${p.sessionId.slice(-8)} (${p.title})` : p.sessionId.slice(-8);
			const note = `[pi-mesh] 关注的会话 ${label} 状态变更 -> ${p.state}`;
			api?.sendMessage?.(
				{ customType: "pi-mesh-peer-state", content: note, display: false },
				{ triggerTurn: false, deliverAs: "nextTurn" },
			);
			safe(() => latestCtx?.ui?.notify?.(note));
			return { type: "push_response", id, ok: true };
		}
		return { type: "push_response", id, ok: false, error: "pi-mesh: unknown push type" };
	} catch (err) {
		return { type: "push_response", id, ok: false, error: String(err) };
	}
}

// ── lifecycle ────────────────────────────────────────────────────────────

/** Idempotent teardown; flushes batched files first (best-effort). */
function teardown(): void {
	flushFiles();
	if (heartbeatTimer) {
		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	}
	if (fileTimer) {
		clearTimeout(fileTimer);
		fileTimer = null;
	}
	argsByToolCall.clear();
	const old = client;
	client = null;
	peer = null;
	try {
		old?.close();
	} catch {}
}

export function registerMeshHooks(pi: ExtensionAPI): void {
	api = pi;

	pi.on("session_start", async (_event, ctx) => {
		try {
			latestCtx = ctx;
			teardown(); // reload / session replacement: rebuild cleanly below
			const home = os.homedir();
			let config: MeshConfig;
			try {
				config = loadConfig(home);
			} catch (err) {
				// Invalid user config degrades to defaults; never kill the session.
				logErr("bad config, using defaults", err);
				config = DEFAULT_CONFIG;
			}
			await ensureHubRunning(home);

			const startedAt = new Date().toISOString();
			// Truthful self-report: read pi's runtime persistence mode (primary:
			// SessionManager.isPersisted(), fallback: getSessionFile() contract,
			// last resort: argv). Never guess from process args when the runtime knows.
			const mode = detectSessionMode(
				safe(() => ctx.sessionManager as unknown as SessionModeSource),
				process.argv,
			);
			const sessionFile = safe(() => ctx.sessionManager?.getSessionFile?.()) ?? "";
			peer = {
				sessionId:
					safe(() => ctx.sessionManager?.getSessionId?.()) || `pid-${process.pid}-${Date.now()}`,
				sessionFile: mode.ephemeral ? "" : sessionFile,
				ephemeral: mode.ephemeral,
				persistence: mode.persistence,
				pid: process.pid,
				cwd: ctx.cwd ?? process.cwd(),
				machineId: os.hostname(),
				startedAt,
				model: safe(() => ctx.model?.id),
				title: safe(() => pi.getSessionName?.()) || undefined,
			};
			runState = "waiting";

			client = new MeshClient({
				socketPath: meshPaths(home).socketPath,
				// Fires on every (re)connect, including first: single hello path.
				onReconnect: () => {
					void registerPeer();
				},
			});
			client.onPush(handlePush);
			void client.connect().catch((err) => logErr("connect", err));

			heartbeatTimer = setInterval(sendHeartbeat, config.heartbeatIntervalMs);
			heartbeatTimer.unref?.();
		} catch (err) {
			logErr("session_start", err);
		}
	});

	pi.on("session_shutdown", async (event) => {
		try {
			flushFiles();
			if (client && peer) {
				try {
					await client.request({
						id: nextId(),
						type: "close",
						sessionId: peer.sessionId,
						reason: event.reason,
					});
				} catch {
					// Hub gone: nothing to close remotely.
				}
			}
		} finally {
			teardown();
		}
	});

	pi.on("session_before_switch", () => {
		// Trivially reset timers; the shutdown/start pair rebuilds everything else.
		try {
			flushFiles();
			if (heartbeatTimer) {
				clearInterval(heartbeatTimer);
				heartbeatTimer = null;
			}
			if (fileTimer) {
				clearTimeout(fileTimer);
				fileTimer = null;
			}
		} catch (err) {
			logErr("session_before_switch", err);
		}
	});

	// ── run state ─────────────────────────────────────────────────────────

	pi.on("agent_start", (_event, ctx) => {
		latestCtx = ctx;
		runState = "running";
	});
	pi.on("agent_settled", (_event, ctx) => {
		latestCtx = ctx;
		runState = "waiting";
	});
	pi.on("agent_end", (_event, ctx) => {
		// Fallback for flows where agent_settled never fires.
		latestCtx = ctx;
		runState = "waiting";
	});

	// ── file activity: edit/write only ────────────────────────────────────

	pi.on("tool_execution_start", (event, ctx) => {
		latestCtx = ctx;
		if (!isFileTool(event.toolName)) return;
		argsByToolCall.set(event.toolCallId, event.args);
	});
	pi.on("tool_execution_end", (event, ctx) => {
		latestCtx = ctx;
		if (!isFileTool(event.toolName)) return;
		const input = argsByToolCall.get(event.toolCallId);
		argsByToolCall.delete(event.toolCallId);
		noteFileActivity(event.toolName, input);
	});
}
