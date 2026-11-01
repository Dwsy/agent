/**
 * In-memory peer registry with debounced persistence.
 *
 * WHY persistence: a hub restart must not forget the mesh's last known state.
 * WHY debounce: every heartbeat would otherwise hit the disk; a 500ms trailing
 * write bounds the loss window while keeping mutations cheap. `flush()` covers
 * shutdown.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { MeshConfig } from "../config.ts";
import type { FileActivity, GitInfo, PeerInfo, PeerState, PeerStateNotice, PeerView, ResumeRecord, SessionPersistence } from "../protocol.ts";
import { MESH_VERSION, isEphemeralPeer, meshPaths } from "../protocol.ts";

const MAX_FILES_PER_PEER = 50;
const MAX_RESUMPTIONS_PER_PEER = 20;
const PERSIST_DEBOUNCE_MS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Default CAS lease for a pending resume launch. */
export const RESUME_LEASE_TTL_MS = 60_000;

/** Ephemeral (--no-session) peers are purged this long after going quiet. */
export const EPHEMERAL_PURGE_MS = 10 * 60_000;

/** PeerView plus room for future internal fields; the registry owns lifecycle. */
export type PeerRecord = PeerView;

export type RegistryEvent =
	| { type: "change" }
	| { type: "file_activity"; sessionId: string; files: FileActivity[] }
	| { type: "state_change"; notice: PeerStateNotice };

/** Pure transition: live peers past the silence window become offline. */
export function nextStateAfterSilence(
	state: PeerState,
	lastHeartbeat: string,
	now: number,
	offlineTimeoutMs: number,
): PeerState {
	if (state !== "running" && state !== "waiting") return state;
	return now - Date.parse(lastHeartbeat) > offlineTimeoutMs ? "offline" : state;
}

/** Pure predicate: offline/closed peers past retention are purged. */
export function isExpired(
	state: PeerState,
	lastHeartbeat: string,
	closedAt: string | undefined,
	now: number,
	retentionDays: number,
): boolean {
	if (state !== "offline" && state !== "closed") return false;
	const anchor = Date.parse(closedAt ?? lastHeartbeat);
	return now - anchor > retentionDays * DAY_MS;
}

export class Registry {
	#peers = new Map<string, PeerRecord>();
	/** Pending resume leases keyed by sessionFile (in-memory: TTLs are short). */
	#leases = new Map<string, { owner: string; expiresAt: number }>();
	#config: MeshConfig;
	#persistFile: string;
	#persistTimer: ReturnType<typeof setTimeout> | null = null;
	#listeners = new Set<(event: RegistryEvent) => void>();

	constructor(config: MeshConfig, home: string) {
		this.#config = config;
		this.#persistFile = meshPaths(home).registryFile;
	}

	register(peer: PeerInfo, git: GitInfo): PeerView {
		if (!peer.sessionId) throw new Error("pi-mesh: peer.sessionId is required");
		// Ephemeral sessions (`pi --no-session`) never write a JSONL. New clients
		// self-report the true mode as `persistence` from pi's runtime
		// (SessionManager.isPersisted()); older clients only set `ephemeral`.
		// Normalize both so the stored record is always consistent.
		const ephemeral = isEphemeralPeer(peer);
		const persistence: SessionPersistence = peer.persistence ?? (peer.ephemeral ? "memory" : "file");
		// Accept the empty sessionFile for ephemeral peers only, reject it for
		// everyone else (fail fast).
		if (!peer.sessionFile && !ephemeral) throw new Error("pi-mesh: peer.sessionFile is required");
		const existing = this.#peers.get(peer.sessionId);
		const record: PeerRecord = {
			...(existing ?? { files: [], following: [] }),
			...peer,
			ephemeral,
			persistence,
			state: "waiting",
			lastHeartbeat: new Date().toISOString(),
			git,
			files: existing?.files ?? [],
			following: existing?.following ?? [],
		};
		// A fresh register revives the session; stale close bookkeeping misleads.
		delete record.closedAt;
		delete record.closeReason;
		this.#peers.set(peer.sessionId, record);
		// The resumed pi is live now: its launch lease is consumed.
		this.#leases.delete(peer.sessionFile);
		this.#notify({ type: "change" });
		this.#schedulePersist();
		return { ...record };
	}

	heartbeat(sessionId: string, state: "running" | "waiting", model?: string, title?: string): PeerView {
		const rec = this.#peers.get(sessionId);
		if (!rec) throw new Error(`pi-mesh: unknown session ${sessionId}`);
		const prev = rec.state;
		rec.state = state;
		rec.lastHeartbeat = new Date().toISOString();
		if (model !== undefined) rec.model = model;
		if (title !== undefined) rec.title = title;
		this.#notify({ type: "change" });
		if (prev !== rec.state) this.#notifyStateChange(rec);
		this.#schedulePersist();
		return { ...rec };
	}

	addFiles(sessionId: string, files: FileActivity[]): void {
		const rec = this.#peers.get(sessionId);
		if (!rec) throw new Error(`pi-mesh: unknown session ${sessionId}`);
		rec.files = [...files, ...rec.files]
			.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
			.slice(0, MAX_FILES_PER_PEER);
		this.#notify({ type: "file_activity", sessionId, files });
		this.#schedulePersist();
	}

	close(sessionId: string, reason?: string): void {
		const rec = this.#peers.get(sessionId);
		if (!rec) throw new Error(`pi-mesh: unknown session ${sessionId}`);
		const prev = rec.state;
		rec.state = "closed";
		rec.closedAt = new Date().toISOString();
		if (reason !== undefined) rec.closeReason = reason;
		this.#notify({ type: "change" });
		if (prev !== rec.state) this.#notifyStateChange(rec);
		this.#schedulePersist();
	}

	/** Mark live peers with stale heartbeats offline. Returns how many changed. */
	sweepOffline(now = Date.now()): number {
		let marked = 0;
		const changed: PeerRecord[] = [];
		for (const rec of this.#peers.values()) {
			const next = nextStateAfterSilence(rec.state, rec.lastHeartbeat, now, this.#config.offlineTimeoutMs);
			if (next !== rec.state) {
				rec.state = next;
				marked++;
				changed.push(rec);
			}
		}
		if (marked > 0) {
			this.#notify({ type: "change" });
			for (const rec of changed) this.#notifyStateChange(rec);
			this.#schedulePersist();
		}
		return marked;
	}

	/** Drop offline/closed peers past retention. Returns how many were removed. */
	purgeExpired(now = Date.now()): number {
		let purged = 0;
		for (const [sessionId, rec] of this.#peers) {
			// Ephemeral sessions have no transcript to retain: drop them shortly
			// after they go quiet instead of keeping ghosts for retentionDays.
			if (isEphemeralPeer(rec)) {
				const anchor = Date.parse(rec.closedAt ?? rec.lastHeartbeat);
				if (rec.state !== "running" && rec.state !== "waiting" && now - anchor > EPHEMERAL_PURGE_MS) {
					this.#peers.delete(sessionId);
					purged++;
				}
				continue;
			}
			if (isExpired(rec.state, rec.lastHeartbeat, rec.closedAt, now, this.#config.retentionDays)) {
				this.#peers.delete(sessionId);
				purged++;
			}
		}
		if (purged > 0) {
			this.#notify({ type: "change" });
			this.#schedulePersist();
		}
		return purged;
	}

	/**
	 * running -> waiting -> offline -> closed; newest session first within a
	 * group. The tiebreak is `startedAt`, NOT `lastHeartbeat`: heartbeats tick
	 * per-peer and would make the list reshuffle constantly.
	 */
	list(): PeerView[] {
		const order: Record<PeerState, number> = { running: 0, waiting: 1, offline: 2, closed: 3 };
		return [...this.#peers.values()]
			.sort(
				(a, b) =>
					order[a.state] - order[b.state] ||
					Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
					a.sessionId.localeCompare(b.sessionId),
			)
			.map(rec => ({ ...rec }));
	}

	/** Directed follow edge sessionId -> targetSessionId; both must be known. */
	follow(sessionId: string, targetSessionId: string): void {
		const rec = this.#peers.get(sessionId);
		if (!rec) throw new Error(`pi-mesh: unknown session ${sessionId}`);
		if (!this.#peers.has(targetSessionId)) throw new Error(`pi-mesh: unknown session ${targetSessionId}`);
		if (sessionId === targetSessionId) throw new Error("pi-mesh: a session cannot follow itself");
		if (rec.following.includes(targetSessionId)) return; // idempotent
		rec.following = [...rec.following, targetSessionId];
		this.#notify({ type: "change" });
		this.#schedulePersist();
	}

	unfollow(sessionId: string, targetSessionId: string): void {
		const rec = this.#peers.get(sessionId);
		if (!rec) throw new Error(`pi-mesh: unknown session ${sessionId}`);
		if (!rec.following.includes(targetSessionId)) return; // idempotent
		rec.following = rec.following.filter(id => id !== targetSessionId);
		this.#notify({ type: "change" });
		this.#schedulePersist();
	}

	/** Followers of a peer (reverse of the `following` edges). */
	followersOf(targetSessionId: string): string[] {
		const out: string[] = [];
		for (const rec of this.#peers.values()) {
			if (rec.following.includes(targetSessionId)) out.push(rec.sessionId);
		}
		return out;
	}

	/**
	 * CAS lease before launching a resume. Same owner renews (idempotent).
	 * Throws "unknown session" | "already live" | "lease held".
	 */
	claimResume(
		opts: { sessionId?: string; sessionFile?: string; owner: string; ttlMs?: number },
		now = Date.now(),
	): { leaseExpiresAt: string } {
		const rec = opts.sessionId
			? this.#peers.get(opts.sessionId)
			: [...this.#peers.values()].find((p) => p.sessionFile === opts.sessionFile);
		if (!rec) throw new Error("pi-mesh: unknown session");
		if (isEphemeralPeer(rec)) throw new Error("ephemeral session");
		if (rec.state === "running" || rec.state === "waiting") {
			throw new Error("already live");
		}
		const key = rec.sessionFile;
		const lease = this.#leases.get(key);
		if (lease && lease.expiresAt > now && lease.owner !== opts.owner) {
			throw new Error("lease held");
		}
		const expiresAt = now + (opts.ttlMs ?? RESUME_LEASE_TTL_MS);
		this.#leases.set(key, { owner: opts.owner, expiresAt });
		return { leaseExpiresAt: new Date(expiresAt).toISOString() };
	}

	/** Append resume lineage and release the lease. */
	recordResume(
		opts: { sessionId: string; owner: string; herdrWorkspaceId?: string; herdrPaneId?: string },
	): PeerView {
		const rec = this.#peers.get(opts.sessionId);
		if (!rec) throw new Error(`pi-mesh: unknown session ${opts.sessionId}`);
		const entry: ResumeRecord = {
			at: new Date().toISOString(),
			via: "mesh-cli",
			owner: opts.owner,
			herdrWorkspaceId: opts.herdrWorkspaceId,
			herdrPaneId: opts.herdrPaneId,
		};
		rec.resumptions = [...(rec.resumptions ?? []), entry].slice(-MAX_RESUMPTIONS_PER_PEER);
		this.#leases.delete(rec.sessionFile);
		this.#notify({ type: "change" });
		this.#schedulePersist();
		return { ...rec };
	}

	get(sessionId: string): PeerView | undefined {
		const rec = this.#peers.get(sessionId);
		return rec ? { ...rec } : undefined;
	}

	onChange(listener: (event: RegistryEvent) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	toJSON(): { version: number; peers: PeerRecord[] } {
		return { version: MESH_VERSION, peers: [...this.#peers.values()] };
	}

	/** Corrupt or missing file -> start empty; never crash the hub. */
	loadJSON(): void {
		let raw: string;
		try {
			raw = readFileSync(this.#persistFile, "utf8");
		} catch {
			return;
		}
		try {
			const parsed = JSON.parse(raw) as { peers?: unknown };
			if (!Array.isArray(parsed?.peers)) return;
			for (const rec of parsed.peers as PeerRecord[]) {
				if (rec && typeof rec.sessionId === "string" && typeof rec.sessionFile === "string") {
					if (!Array.isArray(rec.following)) rec.following = [];
					if (!Array.isArray(rec.files)) rec.files = [];
					if (rec.resumptions !== undefined && !Array.isArray(rec.resumptions)) rec.resumptions = [];
					this.#peers.set(rec.sessionId, rec);
				}
			}
		} catch {
			// corrupt JSON: fresh start
		}
	}

	/** Write immediately (also cancels a pending debounced write). */
	flush(): void {
		if (this.#persistTimer) {
			clearTimeout(this.#persistTimer);
			this.#persistTimer = null;
		}
		try {
			mkdirSync(dirname(this.#persistFile), { recursive: true });
			writeFileSync(this.#persistFile, JSON.stringify(this.toJSON()));
		} catch {
			// persistence is best-effort; a disk hiccup must not kill the hub
		}
	}

	/** Flush and stop timers; call on shutdown. */
	stop(): void {
		this.flush();
	}

	#schedulePersist(): void {
		if (this.#persistTimer) return;
		this.#persistTimer = setTimeout(() => {
			this.#persistTimer = null;
			this.flush();
		}, PERSIST_DEBOUNCE_MS);
		this.#persistTimer.unref?.();
	}

	#notify(event: RegistryEvent): void {
		for (const listener of this.#listeners) {
			try {
				listener(event);
			} catch {
				// listeners (SSE fan-out) must not break registry mutations
			}
		}
	}

	#notifyStateChange(rec: PeerRecord): void {
		this.#notify({
			type: "state_change",
			notice: {
				sessionId: rec.sessionId,
				state: rec.state,
				title: rec.title,
				model: rec.model,
				lastHeartbeat: rec.lastHeartbeat,
				closedAt: rec.closedAt,
			},
		});
	}
}
