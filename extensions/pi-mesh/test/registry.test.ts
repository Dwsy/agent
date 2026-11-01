import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, type MeshConfig } from "../src/config.ts";
import { isEphemeralPeer, meshPaths, type FileActivity, type GitInfo, type PeerInfo } from "../src/protocol.ts";
import { Registry, isExpired, nextStateAfterSilence } from "../src/hub/registry.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

const GIT: GitInfo = { repoRoot: null, branch: null, worktree: null, commonRoot: null };

function makePeer(sessionId: string, extra: Partial<PeerInfo> = {}): PeerInfo {
	// Distinct startedAt per registration: realistic and order-stable.
	const seq = ++makePeerSeq;
	return {
		sessionId,
		sessionFile: `/tmp/${sessionId}.jsonl`,
		pid: 1,
		cwd: "/tmp",
		machineId: "m1",
		startedAt: new Date(Date.parse("2026-09-30T05:00:00.000Z") + seq * 1000).toISOString(),
		...extra,
	};
}
let makePeerSeq = 0;

function makeRegistry(config: Partial<MeshConfig> = {}): { registry: Registry; home: string } {
	const home = mkdtempSync(join(tmpdir(), "pi-mesh-registry-"));
	return { registry: new Registry({ ...DEFAULT_CONFIG, ...config }, home), home };
}

function fileAt(tsMs: number): FileActivity {
	return { path: `/tmp/f${tsMs}.ts`, op: "edit", ts: new Date(tsMs).toISOString() };
}

describe("registry state machine", () => {
	test("register sets waiting state and fresh heartbeat", () => {
		const { registry } = makeRegistry();
		const before = Date.now();
		const view = registry.register(makePeer("s1"), GIT);
		expect(view.state).toBe("waiting");
		expect(Date.parse(view.lastHeartbeat)).toBeGreaterThanOrEqual(before);
		expect(view.files).toEqual([]);
		expect(view.git).toEqual(GIT);
	});

	test("register fails fast on missing sessionId / sessionFile", () => {
		const { registry } = makeRegistry();
		expect(() => registry.register(makePeer(""), GIT)).toThrow("sessionId");
		expect(() => registry.register(makePeer("s1", { sessionFile: "" }), GIT)).toThrow("sessionFile");
	});

	test("register revives a closed session and clears closedAt", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		registry.close("s1", "done");
		expect(registry.get("s1")?.closedAt).toBeDefined();
		const view = registry.register(makePeer("s1"), GIT);
		expect(view.state).toBe("waiting");
		expect(view.closedAt).toBeUndefined();
		expect(view.closeReason).toBeUndefined();
	});

	test("heartbeat updates state/model/title and throws on unknown session", async () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		await Bun.sleep(5);
		const view = registry.heartbeat("s1", "running", "auto/mimo", "my task");
		expect(view.state).toBe("running");
		expect(view.model).toBe("auto/mimo");
		expect(view.title).toBe("my task");
		expect(() => registry.heartbeat("nope", "running")).toThrow("unknown session");
	});

	test("close marks closed with timestamp and reason", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		registry.close("s1", "user done");
		const view = registry.get("s1")!;
		expect(view.state).toBe("closed");
		expect(view.closedAt).toBeDefined();
		expect(view.closeReason).toBe("user done");
		expect(() => registry.close("nope")).toThrow("unknown session");
	});

	test("addFiles merges newest-first and caps at 50 per peer", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		const base = Date.parse("2026-09-30T05:00:00.000Z");
		const first = Array.from({ length: 60 }, (_, i) => fileAt(base + i * 1000));
		registry.addFiles("s1", first);
		let files = registry.get("s1")!.files;
		expect(files.length).toBe(50);
		expect(files[0]!.ts).toBe(new Date(base + 59_000).toISOString()); // newest first
		expect(files[49]!.ts).toBe(new Date(base + 10_000).toISOString()); // oldest 10 dropped

		// merge keeps the newest 50 across batches
		registry.addFiles("s1", [fileAt(base + 100_000)]);
		files = registry.get("s1")!.files;
		expect(files.length).toBe(50);
		expect(files[0]!.ts).toBe(new Date(base + 100_000).toISOString());
		expect(() => registry.addFiles("nope", [])).toThrow("unknown session");
	});

	test("sweepOffline only marks stale live peers", () => {
		const { registry } = makeRegistry();
		const now = Date.now();
		registry.register(makePeer("s1"), GIT);
		registry.register(makePeer("s2"), GIT);
		registry.heartbeat("s2", "running");
		registry.register(makePeer("s3"), GIT);
		registry.close("s3");

		// within the 45s silence window: nothing changes
		expect(registry.sweepOffline(now + DEFAULT_CONFIG.offlineTimeoutMs - 5000)).toBe(0);
		expect(registry.get("s1")!.state).toBe("waiting");
		expect(registry.get("s2")!.state).toBe("running");

		// past the window: both live peers go offline, closed stays closed
		expect(registry.sweepOffline(now + DEFAULT_CONFIG.offlineTimeoutMs + 5000)).toBe(2);
		expect(registry.get("s1")!.state).toBe("offline");
		expect(registry.get("s2")!.state).toBe("offline");
		expect(registry.get("s3")!.state).toBe("closed");
	});

	test("purgeExpired keeps recent, removes expired offline/closed peers", () => {
		const { registry } = makeRegistry();
		const now = Date.now();
		registry.register(makePeer("fresh"), GIT); // stays live
		registry.register(makePeer("closed"), GIT);
		registry.close("closed");
		registry.register(makePeer("stale"), GIT);
		registry.sweepOffline(now + DEFAULT_CONFIG.offlineTimeoutMs + 5000); // stale -> offline
		registry.heartbeat("fresh", "running"); // keep "fresh" live past the sweep

		// within 7-day retention: everything survives
		expect(registry.purgeExpired(now + DAY_MS)).toBe(0);
		expect(registry.list().length).toBe(3);

		// past retention: offline + closed go, live stays
		expect(registry.purgeExpired(now + 8 * DAY_MS)).toBe(2);
		const ids = registry.list().map(p => p.sessionId);
		expect(ids).toEqual(["fresh"]);
	});

	test("list sorts running, waiting, offline, closed and newest session first", async () => {
		const { registry } = makeRegistry();
		// "off" must be measurably older than the rest so the sweep only hits it
		registry.register(makePeer("off"), GIT);
		await Bun.sleep(30);
		registry.register(makePeer("w-old"), GIT);
		await Bun.sleep(5);
		registry.register(makePeer("w-new"), GIT);
		registry.register(makePeer("run"), GIT);
		registry.heartbeat("run", "running");
		registry.register(makePeer("cls"), GIT);
		registry.close("cls");

		const offHeartbeat = Date.parse(registry.get("off")!.lastHeartbeat);
		expect(registry.sweepOffline(offHeartbeat + DEFAULT_CONFIG.offlineTimeoutMs + 5)).toBe(1);
		expect(registry.get("off")!.state).toBe("offline");

		expect(registry.list().map(p => p.sessionId)).toEqual(["run", "w-new", "w-old", "off", "cls"]);
	});

	test("heartbeat does not reshuffle list order", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("a"), GIT);
		registry.register(makePeer("b"), GIT);
		registry.register(makePeer("c"), GIT);
		const before = registry.list().map(p => p.sessionId);
		// The freshest heartbeat must NOT jump the queue.
		registry.heartbeat("a", "waiting");
		registry.heartbeat("a", "waiting");
		expect(registry.list().map(p => p.sessionId)).toEqual(before);
	});

	test("pure helpers: nextStateAfterSilence and isExpired", () => {
		const t0 = Date.parse("2026-09-30T05:00:00.000Z");
		expect(nextStateAfterSilence("waiting", new Date(t0).toISOString(), t0 + 44_999, 45_000)).toBe("waiting");
		expect(nextStateAfterSilence("running", new Date(t0).toISOString(), t0 + 45_001, 45_000)).toBe("offline");
		expect(nextStateAfterSilence("closed", new Date(t0).toISOString(), t0 + 1e9, 45_000)).toBe("closed");
		expect(isExpired("offline", new Date(t0).toISOString(), undefined, t0 + DAY_MS, 7)).toBe(false);
		expect(isExpired("closed", new Date(t0).toISOString(), new Date(t0).toISOString(), t0 + 8 * DAY_MS, 7)).toBe(true);
		expect(isExpired("running", new Date(t0).toISOString(), undefined, t0 + 8 * DAY_MS, 7)).toBe(false);
	});
});

describe("registry persistence", () => {
	test("round-trips through toJSON/loadJSON", () => {
		const home = mkdtempSync(join(tmpdir(), "pi-mesh-persist-"));
		const registry = new Registry(DEFAULT_CONFIG, home);
		registry.register(makePeer("s1"), GIT);
		registry.addFiles("s1", [fileAt(Date.parse("2026-09-30T05:00:00.000Z"))]);
		registry.close("s1", "done");
		registry.flush();

		const restored = new Registry(DEFAULT_CONFIG, home);
		restored.loadJSON();
		const view = restored.get("s1")!;
		expect(view.state).toBe("closed");
		expect(view.closeReason).toBe("done");
		expect(view.files.length).toBe(1);
	});

	test("debounced write lands after mutations without explicit flush", async () => {
		const home = mkdtempSync(join(tmpdir(), "pi-mesh-debounce-"));
		const registry = new Registry(DEFAULT_CONFIG, home);
		registry.register(makePeer("s1"), GIT);
		await Bun.sleep(800); // > 500ms debounce
		const restored = new Registry(DEFAULT_CONFIG, home);
		restored.loadJSON();
		expect(restored.get("s1")?.sessionId).toBe("s1");
	});

	test("corrupt registry file starts empty without crashing", () => {
		const home = mkdtempSync(join(tmpdir(), "pi-mesh-corrupt-"));
		const paths = meshPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.registryFile, "{not json!!");
		const registry = new Registry(DEFAULT_CONFIG, home);
		registry.loadJSON();
		expect(registry.list()).toEqual([]);
	});
});

describe("follow graph", () => {
	test("follow/unfollow are idempotent and followersOf reverses edges", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		registry.register(makePeer("s2"), GIT);
		registry.register(makePeer("s3"), GIT);

		registry.follow("s1", "s2");
		registry.follow("s1", "s2"); // idempotent
		registry.follow("s3", "s2");
		expect(registry.get("s1")!.following).toEqual(["s2"]);
		expect(registry.followersOf("s2").sort()).toEqual(["s1", "s3"]);

		registry.unfollow("s1", "s2");
		registry.unfollow("s1", "s2"); // idempotent
		expect(registry.get("s1")!.following).toEqual([]);
		expect(registry.followersOf("s2")).toEqual(["s3"]);
	});

	test("follow fails fast on unknown sessions and self-follow", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		expect(() => registry.follow("s1", "ghost")).toThrow("unknown session ghost");
		expect(() => registry.follow("ghost", "s1")).toThrow("unknown session ghost");
		expect(() => registry.follow("s1", "s1")).toThrow("cannot follow itself");
	});

	test("follow edges survive persistence round-trip", () => {
		const home = mkdtempSync(join(tmpdir(), "pi-mesh-follow-persist-"));
		const registry = new Registry(DEFAULT_CONFIG, home);
		registry.register(makePeer("s1"), GIT);
		registry.register(makePeer("s2"), GIT);
		registry.follow("s1", "s2");
		registry.flush();

		const restored = new Registry(DEFAULT_CONFIG, home);
		restored.loadJSON();
		expect(restored.get("s1")!.following).toEqual(["s2"]);
	});

	test("state_change events fire only on transitions", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		const events: string[] = [];
		registry.onChange((e) => {
			if (e.type === "state_change") events.push(e.notice.state);
		});
		registry.heartbeat("s1", "waiting"); // waiting -> waiting: no event
		registry.heartbeat("s1", "running"); // waiting -> running
		registry.close("s1"); // running -> closed
		registry.close("s1"); // closed -> closed: no event
		expect(events).toEqual(["running", "closed"]);
	});
});

describe("ephemeral peers (--no-session)", () => {
	test("register accepts empty sessionFile only for ephemeral peers", () => {
		const { registry } = makeRegistry();
		expect(() => registry.register({ ...makePeer("e1"), sessionFile: "" }, GIT)).toThrow("sessionFile is required");
		const view = registry.register({ ...makePeer("e1"), sessionFile: "", ephemeral: true }, GIT);
		expect(view.ephemeral).toBe(true);
		expect(view.sessionFile).toBe("");
	});

	test("ephemeral peers cannot be resumed and are purged soon after going quiet", () => {
		const { registry } = makeRegistry();
		registry.register({ ...makePeer("e1"), sessionFile: "", ephemeral: true }, GIT);
		registry.register(makePeer("s1"), GIT);
		expect(() => registry.claimResume({ sessionId: "e1", owner: "o1" })).toThrow("ephemeral session");

		registry.close("e1");
		registry.close("s1");
		const now = Date.now();
		// 11 minutes later: the ephemeral ghost is gone, the real session stays.
		expect(registry.purgeExpired(now + 11 * 60_000)).toBe(1);
		expect(registry.get("e1")).toBeUndefined();
		expect(registry.get("s1")).toBeDefined();
	});

	test("ephemeral peers survive while live", () => {
		const { registry } = makeRegistry();
		registry.register({ ...makePeer("e1"), sessionFile: "", ephemeral: true }, GIT);
		expect(registry.purgeExpired(Date.now() + 60 * 60_000)).toBe(0);
		expect(registry.get("e1")).toBeDefined();
	});
});

describe("persistence self-report (runtime truth, not argv)", () => {
	test("persistence:memory alone is accepted and normalized with ephemeral", () => {
		const { registry } = makeRegistry();
		// New clients self-report from SessionManager.isPersisted() and may omit
		// the legacy `ephemeral` flag entirely.
		const view = registry.register(
			{ ...makePeer("m1"), sessionFile: "", persistence: "memory" },
			GIT,
		);
		expect(view.persistence).toBe("memory");
		expect(view.ephemeral).toBe(true);
		expect(view.sessionFile).toBe("");
	});

	test("persistence:file requires a sessionFile; legacy ephemeral:true maps to memory", () => {
		const { registry } = makeRegistry();
		expect(() =>
			registry.register({ ...makePeer("f1"), sessionFile: "", persistence: "file" }, GIT),
		).toThrow("sessionFile is required");
		const legacy = registry.register({ ...makePeer("l1"), sessionFile: "", ephemeral: true }, GIT);
		expect(legacy.persistence).toBe("memory");
		const filePeer = registry.register(makePeer("f2"), GIT);
		expect(filePeer.persistence).toBe("file");
		expect(filePeer.ephemeral).toBe(false);
	});

	test("persistence:memory peers cannot be resumed and purge early", () => {
		const { registry } = makeRegistry();
		registry.register({ ...makePeer("m1"), sessionFile: "", persistence: "memory" }, GIT);
		registry.register(makePeer("s1"), GIT);
		expect(() => registry.claimResume({ sessionId: "m1", owner: "o1" })).toThrow("ephemeral session");

		registry.close("m1");
		registry.close("s1");
		// 11 minutes later: the memory-mode ghost is gone, the file session stays.
		expect(registry.purgeExpired(Date.now() + 11 * 60_000)).toBe(1);
		expect(registry.get("m1")).toBeUndefined();
		expect(registry.get("s1")).toBeDefined();
	});

	test("isEphemeralPeer prefers the persistence self-report over ephemeral", () => {
		expect(isEphemeralPeer({ persistence: "memory" })).toBe(true);
		expect(isEphemeralPeer({ persistence: "file" })).toBe(false);
		// conflicting pair: the runtime truth wins
		expect(isEphemeralPeer({ persistence: "file", ephemeral: true })).toBe(false);
		// legacy client: ephemeral only
		expect(isEphemeralPeer({ ephemeral: true })).toBe(true);
		expect(isEphemeralPeer({})).toBe(false);
	});
});

describe("resume lease (CAS)", () => {
	test("claim rejects unknown sessions and live peers", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		expect(() => registry.claimResume({ sessionId: "ghost", owner: "o1" })).toThrow("unknown session");
		// registered peers start waiting = live: no resume on a live session
		expect(() => registry.claimResume({ sessionId: "s1", owner: "o1" })).toThrow("already live");
		registry.close("s1");
		expect(registry.claimResume({ sessionId: "s1", owner: "o1" }).leaseExpiresAt).toBeTruthy();
	});

	test("second owner is lease-held; same owner renews", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		registry.close("s1");
		registry.claimResume({ sessionId: "s1", owner: "o1" });
		expect(() => registry.claimResume({ sessionId: "s1", owner: "o2" })).toThrow("lease held");
		expect(registry.claimResume({ sessionId: "s1", owner: "o1" }).leaseExpiresAt).toBeTruthy();
	});

	test("lease expires after ttl and record/register consume it", () => {
		const { registry } = makeRegistry();
		registry.register(makePeer("s1"), GIT);
		registry.close("s1");
		const now = Date.now();
		registry.claimResume({ sessionId: "s1", owner: "o1", ttlMs: 1000 }, now);
		expect(() => registry.claimResume({ sessionId: "s1", owner: "o2" }, now + 500)).toThrow("lease held");
		// past TTL another owner may claim
		expect(registry.claimResume({ sessionId: "s1", owner: "o2" }, now + 1500).leaseExpiresAt).toBeTruthy();
		// record_resume releases + appends lineage
		const view = registry.recordResume({ sessionId: "s1", owner: "o2", herdrWorkspaceId: "w1", herdrPaneId: "w1:p1" });
		expect(view.resumptions?.length).toBe(1);
		expect(view.resumptions?.[0]?.herdrWorkspaceId).toBe("w1");
		expect(registry.claimResume({ sessionId: "s1", owner: "o3" }).leaseExpiresAt).toBeTruthy();
	});

	test("re-register (revive) consumes the lease and resumptions persist", () => {
		const home = mkdtempSync(join(tmpdir(), "pi-mesh-lease-"));
		const registry = new Registry(DEFAULT_CONFIG, home);
		registry.register(makePeer("s1"), GIT);
		registry.close("s1");
		registry.claimResume({ sessionId: "s1", owner: "o1" });
		registry.recordResume({ sessionId: "s1", owner: "o1", herdrWorkspaceId: "w9" });
		registry.register(makePeer("s1"), GIT); // revived pi registers
		expect(() => registry.claimResume({ sessionId: "s1", owner: "o2" })).toThrow("already live");
		registry.flush();
		const restored = new Registry(DEFAULT_CONFIG, home);
		restored.loadJSON();
		expect(restored.get("s1")?.resumptions?.length).toBe(1);
	});
});
