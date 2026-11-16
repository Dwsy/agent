/**
 * In-memory peer registry with debounced persistence.
 *
 * WHY persistence: a hub restart must not forget the mesh's last known state.
 * WHY debounce: every heartbeat would otherwise hit the disk; a 500ms trailing
 * write bounds the loss window while keeping mutations cheap. `flush()` covers
 * shutdown.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
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
	/** Fenced, persisted attempts: TTL is informational, not permission to launch
	 * again when the previous launch result is unknown. */
	#leases = new Map<string, { sessionId: string; owner: string; token: string; expiresAt: number; phase: "claimed" | "started" }>();
	/** Registration can beat the Herdr startAgent acknowledgement. */
	#recentRegisters = new Map<string, { sessionId: string; owner: string; token: string; expiresAt: number; phase: "claimed" | "started" }>();
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
		// Preserve the consumed token for a late lineage record, without
		// allowing it to mutate a different/new launch attempt.
		const consumed = this.#leases.get(peer.sessionFile);
		if (consumed && consumed.sessionId === peer.sessionId) {
			this.#recentRegisters.set(peer.sessionFile, consumed);
			this.#leases.delete(peer.sessionFile);
		}
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
					this.#dropPeer(sessionId, rec);
					purged++;
				}
				continue;
			}
			if (isExpired(rec.state, rec.lastHeartbeat, rec.closedAt, now, this.#config.retentionDays)) {
				this.#dropPeer(sessionId, rec);
				purged++;
			}
		}
		// Lease bookkeeping is fenced past its TTL (anti-double-spawn), but it must
		// not outlive its peer: #dropPeer keeps the maps from growing without bound.
		if (purged > 0) {
			this.#notify({ type: "change" });
			this.#schedulePersist();
		}
		return purged;
	}

	/** Removing a peer must take its resume bookkeeping with it, or it orphans. */
	#dropPeer(sessionId: string, rec: PeerRecord): void {
		this.#peers.delete(sessionId);
		this.#leases.delete(rec.sessionFile);
		this.#recentRegisters.delete(rec.sessionFile);
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
	 * Same owner is NOT an idempotency key: independent clicks must not both
	 * spawn. A previous attempt requires explicit reconciliation or register.
	 */
	claimResume(
		opts: { sessionId?: string; sessionFile?: string; owner: string; ttlMs?: number },
		now = Date.now(),
	): { leaseExpiresAt: string; token: string } {
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
		// The fence outlives its TTL on purpose: a spawned resume may still be
		// starting, and a second claim would double-spawn. Only register or
		// releaseResume end it (or peer purge below).
		if (lease) throw new Error(lease.phase === "started" ? "resume outcome unknown" : "lease held");
		if (!opts.owner.trim()) throw new Error("owner is required");
		const expiresAt = now + (opts.ttlMs ?? RESUME_LEASE_TTL_MS);
		const token = randomUUID();
		this.#recentRegisters.delete(key);
		this.#leases.set(key, { sessionId: rec.sessionId, owner: opts.owner, token, expiresAt, phase: "claimed" });
		try { this.#persistFence(); }
		catch (error) { this.#leases.delete(key); throw error; }
		return { leaseExpiresAt: new Date(expiresAt).toISOString(), token };
	}

	/** Append lineage without releasing: a Pi register consumes the lease. */
	recordResume(
		opts: { sessionId: string; owner: string; token: string; herdrWorkspaceId?: string; herdrPaneId?: string },
	): PeerView {
		const rec = this.#peers.get(opts.sessionId);
		if (!rec) throw new Error(`pi-mesh: unknown session ${opts.sessionId}`);
		const lease = this.#leases.get(rec.sessionFile) ?? this.#recentRegisters.get(rec.sessionFile);
		if (!lease || lease.sessionId !== opts.sessionId || lease.owner !== opts.owner || lease.token !== opts.token) throw new Error("stale resume token");
		if (lease.phase !== "claimed") throw new Error("resume already recorded");
		const entry: ResumeRecord = {
			at: new Date().toISOString(),
			via: "mesh-cli",
			owner: opts.owner,
			herdrWorkspaceId: opts.herdrWorkspaceId,
			herdrPaneId: opts.herdrPaneId,
		};
		rec.resumptions = [...(rec.resumptions ?? []), entry].slice(-MAX_RESUMPTIONS_PER_PEER);
		lease.phase = "started";
		if (this.#recentRegisters.get(rec.sessionFile) === lease) this.#recentRegisters.delete(rec.sessionFile);
		this.#notify({ type: "change" });
		this.#persistFence();
		return { ...rec };
	}

	/** Only exact, not-yet-started attempts may be abandoned. */
	releaseResume(opts: { sessionId: string; owner: string; token: string }): void {
		const rec = this.#peers.get(opts.sessionId);
		if (!rec) throw new Error("unknown session");
		const lease = this.#leases.get(rec.sessionFile);
		if (!lease || lease.sessionId !== opts.sessionId || lease.owner !== opts.owner || lease.token !== opts.token) throw new Error("stale resume token");
		if (lease.phase !== "claimed") throw new Error("resume already launched");
		this.#leases.delete(rec.sessionFile);
		try { this.#persistFence(); }
		catch (error) { this.#leases.set(rec.sessionFile, lease); throw error; }
	}

	get(sessionId: string): PeerView | undefined {
		const rec = this.#peers.get(sessionId);
		return rec ? { ...rec } : undefined;
	}

	onChange(listener: (event: RegistryEvent) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	toJSON(): { version: number; peers: PeerRecord[]; leases: Array<{ sessionFile: string; sessionId: string; owner: string; token: string; expiresAt: number; phase: "claimed" | "started" }> } {
		return {
			version: MESH_VERSION,
			peers: [...this.#peers.values()],
			leases: [...this.#leases].map(([sessionFile, lease]) => ({ sessionFile, ...lease })),
		};
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
			const parsed = JSON.parse(raw) as { peers?: unknown; leases?: unknown };
			if (!Array.isArray(parsed?.peers)) return;
			for (const rec of parsed.peers as PeerRecord[]) {
				if (rec && typeof rec.sessionId === "string" && typeof rec.sessionFile === "string") {
					if (!Array.isArray(rec.following)) rec.following = [];
					if (!Array.isArray(rec.files)) rec.files = [];
					if (rec.resumptions !== undefined && !Array.isArray(rec.resumptions)) rec.resumptions = [];
					this.#peers.set(rec.sessionId, rec);
				}
			}
			if (Array.isArray(parsed.leases)) {
				for (const lease of parsed.leases) {
					if (!lease || typeof lease.sessionFile !== "string" || typeof lease.sessionId !== "string"
						|| typeof lease.owner !== "string" || typeof lease.token !== "string"
						|| typeof lease.expiresAt !== "number" || !["claimed", "started"].includes(lease.phase)) continue;
					if (this.#peers.get(lease.sessionId)?.sessionFile !== lease.sessionFile) continue;
					this.#leases.set(lease.sessionFile, {
						sessionId: lease.sessionId, owner: lease.owner, token: lease.token,
						expiresAt: lease.expiresAt, phase: lease.phase,
					});
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
			this.#persistFence();
		} catch {
			// Heartbeat persistence remains best-effort. Lease claims fail
			// closed in their own strict write path.
		}
	}

	/** Fencing cannot be best-effort; a rejected disk write forbids launching. */
	#persistFence(): void {
		mkdirSync(dirname(this.#persistFile), { recursive: true });
		// Atomic same-directory rename avoids a truncated registry snapshot
		// after a crash halfway through a lease write.
		const temp = `${this.#persistFile}.${process.pid}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temp, JSON.stringify(this.toJSON()), { mode: 0o600, flag: "wx" });
			renameSync(temp, this.#persistFile);
		} catch (error) {
			try { unlinkSync(temp); } catch {}
			throw error;
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
