/**
 * pi-mesh wire contract — single source of truth for hub, extension client,
 * CLI, and the WebUI HTTP API. Every module speaks exactly these shapes.
 *
 * Transport:
 *   - Extension/CLI  <-> Hub : newline-delimited JSON over a Unix domain socket
 *     (macOS/Linux) or a named pipe (Windows). One request -> one response,
 *     matched by `id`. Hub may push messages over the same connection.
 *   - WebUI          <-> Hub : HTTP on 127.0.0.1 + SSE for live updates.
 */

export const MESH_VERSION = 1;

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

/**
 * Peer lifecycle. `offline` is derived (heartbeat lost), the rest are explicit.
 * `offline` and `closed` peers are retained for `retentionDays` then purged.
 */
export type PeerState = "running" | "waiting" | "offline" | "closed";

export type FileOp = "edit" | "write";

/**
 * True session persistence mode, self-reported from pi's runtime:
 *   - "file"  : JSONL-backed session (SessionManager with persist=true)
 *   - "memory": in-memory session — `pi --no-session` maps to
 *               SessionManager.inMemory(); no JSONL is ever written.
 */
export type SessionPersistence = "file" | "memory";

export interface FileActivity {
	path: string;
	op: FileOp;
	ts: string; // ISO timestamp
}

export interface GitInfo {
	repoRoot: string | null;
	branch: string | null;
	/** "main" = primary worktree, "linked" = `git worktree add` checkout. */
	worktree: "main" | "linked" | null;
	/** Shared .git dir root; equal to repoRoot for the main worktree. */
	commonRoot: string | null;
}

export interface PeerInfo {
	sessionId: string;
	sessionFile: string;
	pid: number;
	cwd: string;
	machineId: string;
	startedAt: string; // ISO
	model?: string;
	title?: string;
	/**
	 * `pi --no-session` (or otherwise headless-ephemeral): no JSONL on disk.
	 * sessionFile is "" and must stay that way — no history/review/resume.
	 * Derived from `persistence === "memory"`; kept for older consumers.
	 */
	ephemeral?: boolean;
	/**
	 * Truthful self-report from pi's runtime (SessionManager.isPersisted()),
	 * NOT argv sniffing. Prefer this over `ephemeral` when both are present.
	 */
	persistence?: SessionPersistence;
}

/**
 * Truthful mode predicate: the runtime self-report (`persistence`) wins;
 * `ephemeral` remains the fallback for older clients that never set it.
 */
export function isEphemeralPeer(peer: { ephemeral?: boolean; persistence?: SessionPersistence }): boolean {
	return peer.persistence ? peer.persistence === "memory" : peer.ephemeral === true;
}

/** Registry view served to clients/WebUI. */
export interface PeerView extends PeerInfo {
	state: PeerState;
	lastHeartbeat: string; // ISO
	closedAt?: string;
	closeReason?: string;
	git: GitInfo;
	files: FileActivity[]; // capped, newest first
	/**
	 * Directed follow graph: sessions this peer follows. A session receives
	 * `peer_state_changed` pushes only for followed peers. `send_message`
	 * auto-adds the target to the sender's following (unfollow is explicit).
	 */
	following: string[];
	/** Resume lineage (mesh resume -> herdr workspace), newest last. */
	resumptions?: ResumeRecord[];
}

export interface TranscriptEntry {
	id: string;
	timestamp: string;
	role: string; // user | assistant | toolResult | ...
	text: string; // flattened, truncated
	toolName?: string;
	isError?: boolean;
	/** Server-rendered Markdown HTML (HTTP transcript only, ?theme=light|dark). */
	html?: string;
}

/** One resume event appended when a session is resurrected via mesh resume. */
export interface ResumeRecord {
	at: string; // ISO
	via: "mesh-cli" | "manual";
	owner?: string; // requesting sessionId
	herdrWorkspaceId?: string;
	herdrPaneId?: string;
}

// ---------------------------------------------------------------------------
// Socket protocol: extension/CLI -> hub
// ---------------------------------------------------------------------------

export type DeliveryMode = "steer" | "followUp";

export type HubRequest =
	| { id: string; type: "register"; peer: PeerInfo; git: GitInfo }
	| {
			id: string;
			type: "heartbeat";
			sessionId: string;
			state: "running" | "waiting";
			model?: string;
			title?: string;
	  }
	| { id: string; type: "file_activity"; sessionId: string; files: FileActivity[] }
	| { id: string; type: "close"; sessionId: string; reason?: string }
	| { id: string; type: "follow"; sessionId: string; targetSessionId: string }
	| { id: string; type: "unfollow"; sessionId: string; targetSessionId: string }
	/**
	 * CAS lease before launching a resume (idempotency / double-resume mutex).
	 * Errors: "unknown session" | "already live" | "lease held".
	 */
	| {
			id: string;
			type: "claim_resume";
			sessionId?: string;
			sessionFile?: string;
			owner: string;
			ttlMs?: number;
	  }
	/** Append a ResumeRecord + release the lease once the herdr launch landed. */
	| {
			id: string;
			type: "record_resume";
			sessionId: string;
			owner: string;
			herdrWorkspaceId?: string;
			herdrPaneId?: string;
	  }
	| { id: string; type: "query_peers" }
	| {
			id: string;
			type: "query_transcript";
			sessionId: string;
			limit?: number;
			beforeEntryId?: string;
	  }
	| {
			id: string;
			type: "send_message";
			targetSessionId: string;
			text: string;
			mode: DeliveryMode;
			/** Sender for auto-follow when the connection is not a registered agent. */
			fromSessionId?: string;
	  }
	| { id: string; type: "cancel"; targetSessionId: string };

/** Hub -> extension push (routed control plane). */
export type HubPush =
	| { type: "deliver_message"; id: string; text: string; mode: DeliveryMode }
	| { type: "cancel"; id: string }
	| { type: "peer_state_changed"; id: string; peer: PeerStateNotice };

/** Fire-and-forget state notification sent to followers of a peer. */
export interface PeerStateNotice {
	sessionId: string;
	state: PeerState;
	title?: string;
	model?: string;
	lastHeartbeat: string;
	closedAt?: string;
}

/** Extension -> hub reply to a push. */
export interface PushResponse {
	type: "push_response";
	id: string;
	ok: boolean;
	/** For deliver_message: "handled" | "queued" | "started". */
	disposition?: string;
	error?: string;
}

export interface HubResponse {
	id: string;
	type: "response";
	ok: boolean;
	data?: unknown;
	error?: string;
}

export type HubMessage = HubRequest | HubPush | PushResponse | HubResponse;

// ---------------------------------------------------------------------------
// HTTP API (WebUI), all on 127.0.0.1
// ---------------------------------------------------------------------------

/**
 * GET  /api/peers                              -> { peers: PeerView[] }
 * GET  /api/peers/:sessionId/transcript?limit  -> { entries: TranscriptEntry[] }
 * POST /api/peers/:sessionId/message {text,mode,fromSessionId?} -> { ok, disposition? }
 *      fromSessionId: sender for auto-follow; omitted = no follow edge.
 * POST /api/peers/:sessionId/cancel            -> { ok }
 * POST /api/peers/:sessionId/follow   {targetSessionId} -> { ok }
 * POST /api/peers/:sessionId/unfollow {targetSessionId} -> { ok }
 * POST /api/peers/:sessionId/resume   {fork?} -> { ok, message, workspaceId?, paneId? }
 * POST /api/peers/:sessionId/focus                  -> { ok, message }  (herdr workspace focus)
 * POST /api/herdr/new-session   {cwd?, label?}      -> { ok, message, workspaceId?, paneId? }
 * GET  /api/herdr                                  -> { agents: [{paneId, workspaceId, sessionPath, status}] }
 *
 * WS   /api/terminal?target=<pane|agent>&mode=control|observe&cols&rows
 *      JSONL envelope verbatim to/from `herdr terminal session`:
 *        -> {"type":"terminal.input","bytes":"<base64>"} | terminal.resize | ...
 *        <- {"bytes":"<base64>"} ... {"type":"terminal.closed","reason":...}
 *      observe mode drops all client input (read-only mirror).
 * GET  /api/events                             -> SSE stream of HubEvent
 * GET  /                                       -> static WebUI
 */
export type HubEvent =
	| { type: "peers"; peers: PeerView[] }
	| { type: "file_activity"; sessionId: string; files: FileActivity[] };

// ---------------------------------------------------------------------------
// Runtime locations
// ---------------------------------------------------------------------------

export const MESH_DIR_NAME = "pi-mesh";

export function meshPaths(home: string) {
	const dir = `${home}/.pi/${MESH_DIR_NAME}`;
	const isWindows = process.platform === "win32";
	return {
		dir,
		configFile: `${dir}/config.json`,
		registryFile: `${dir}/registry.json`,
		logFile: `${dir}/hub.log`,
		// Named pipes on Windows are namespace paths, not filesystem paths.
		socketPath: isWindows ? "\\\\.\\pipe\\pi-mesh" : `${dir}/mesh.sock`,
	};
}
