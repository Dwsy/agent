import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { Registry } from "../src/hub/registry.ts";
import { resumePeer, type HerdrApi, type ResumeGate } from "../src/resume.ts";
import type { PeerView } from "../src/protocol.ts";

function fixture() {
	const home = mkdtempSync(join(tmpdir(), "pi-mesh-cas-regression-"));
	const sessionFile = join(home, "record.jsonl");
	writeFileSync(sessionFile, "{}\n");
	const peer: PeerView = {
		sessionId: "01a18ba8-f20e-756d-9a87-3b6bc49e3b93",
		sessionFile, cwd: home, pid: 999, machineId: "fixture", startedAt: new Date().toISOString(),
		lastHeartbeat: new Date().toISOString(), state: "closed", files: [], following: [],
		git: { repoRoot: null, branch: null, worktree: null, commonRoot: null },
	};
	const registry = new Registry(DEFAULT_CONFIG, home);
	registry.register(peer, peer.git);
	registry.close(peer.sessionId);
	const gate: ResumeGate = {
		async claim(p, owner) { return registry.claimResume({ sessionId: p.sessionId, owner }); },
		async record(p, owner, token, workspaceId, paneId) {
			registry.recordResume({ sessionId: p.sessionId, owner, token, herdrWorkspaceId: workspaceId, herdrPaneId: paneId });
		},
		async release(p, owner, token) { registry.releaseResume({ sessionId: p.sessionId, owner, token }); },
	};
	return { peer, registry, gate };
}

function fakeHerdr(startAgent: () => Promise<void> = async () => {}): HerdrApi {
	return {
		async listWorkspaces() { return []; },
		async panesOf() { return ["p1"]; },
		async createWorkspace() { return { workspaceId: "test-workspace", rootPaneId: "p1" }; },
		async startAgent() { await startAgent(); },
		async focusWorkspace() {},
		async listAgents() { return []; },
		async focusAgent() {},
	};
}

test("CAS HTTP webui owner duplicate starts exactly one fake Herdr agent", async () => {
	const { peer, registry, gate } = fixture();
	let starts = 0;
	const herdr = fakeHerdr(async () => { starts++; await Bun.sleep(40); });
	const [a, b] = await Promise.all([
		resumePeer(peer, { owner: "webui" }, herdr, gate),
		resumePeer(peer, { owner: "webui" }, herdr, gate),
	]);
	expect([a.ok, b.ok].sort()).toEqual([false, true]);
	expect(starts).toBe(1);
	expect(() => registry.claimResume({ sessionId: peer.sessionId, owner: "webui" })).toThrow("resume outcome unknown");
});

test("CAS definitive failure unlocks; ambiguous start preserves fence", async () => {
	const { peer, registry, gate } = fixture();
	const failedBefore = await resumePeer(peer, { owner: "webui" }, {
		...fakeHerdr(), async listWorkspaces() { throw new Error("prelaunch exception"); },
	}, gate);
	expect(failedBefore.ok).toBe(false);
	let starts = 0;
	const failingHerdr = fakeHerdr(async () => { starts++; throw new Error("lost acknowledgement"); });
	const a = await resumePeer(peer, { owner: "webui" }, failingHerdr, gate);
	const b = await resumePeer(peer, { owner: "webui" }, failingHerdr, gate);
	expect(a.message).toContain("不确定");
	expect(b.ok).toBe(false);
	expect(starts).toBe(1);
	expect(() => registry.claimResume({ sessionId: peer.sessionId, owner: "other" })).toThrow("lease held");
});

test("CAS Pi registration during startAgent acknowledgement is safely recognized", async () => {
	const { peer, registry, gate } = fixture();
	const herdr = fakeHerdr(async () => { registry.register(peer, peer.git); });
	const outcome = await resumePeer(peer, { owner: "webui" }, herdr, gate);
	expect(outcome.ok).toBe(true);
	expect(registry.get(peer.sessionId)?.resumptions?.at(-1)?.herdrWorkspaceId).toBe("test-workspace");
	expect(() => registry.claimResume({ sessionId: peer.sessionId, owner: "webui" })).toThrow("already live");
});
