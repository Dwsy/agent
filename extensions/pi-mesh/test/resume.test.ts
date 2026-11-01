import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildResumePlan,
	findHerdrHost,
	focusPeerWorkspace,
	newSessionInHerdr,
	resumePeer,
	formatPlan,
	type HerdrApi,
	type ResumeGate,
} from "../src/resume.ts";
import type { PeerView } from "../src/protocol.ts";

function makePeer(sessionFile: string, cwd: string): PeerView {
	return {
		sessionId: "01a18ba8-f20e-756d-9a87-3b6bc49e3b93",
		sessionFile,
		pid: 1,
		cwd,
		machineId: "m1",
		startedAt: "2026-10-30T10:00:00.000Z",
		state: "closed",
		lastHeartbeat: "2026-10-30T11:00:00.000Z",
		git: { repoRoot: null, branch: null, worktree: null, commonRoot: null },
		files: [],
		following: [],
	};
}

function fixture(): { peer: PeerView } {
	const home = mkdtempSync(join(tmpdir(), "pi-mesh-resume-"));
	writeFileSync(join(home, "session.jsonl"), "{}\n");
	return { peer: makePeer(join(home, "session.jsonl"), home) };
}

function fakeHerdr(over: Partial<HerdrApi> = {}): HerdrApi & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		async listWorkspaces() {
			calls.push("listWorkspaces");
			return [];
		},
		async panesOf(id) {
			calls.push(`panesOf:${id}`);
			return [`${id}:p1`];
		},
		async createWorkspace(opts) {
			calls.push(`createWorkspace:${opts.label}:${opts.cwd}:${opts.noFocus}`);
			return { workspaceId: "wNEW", rootPaneId: "wNEW:p1" };
		},
		async startAgent(opts) {
			calls.push(`startAgent:${opts.name}:${opts.paneId}:${opts.args.join(" ")}`);
		},
		async focusWorkspace(id) {
			calls.push(`focusWorkspace:${id}`);
		},
		async listAgents() {
			calls.push("listAgents");
			return [];
		},
		async focusAgent(id) {
			calls.push(`focusAgent:${id}`);
		},
		...over,
	};
}

function fakeGate(over: Partial<ResumeGate> = {}): ResumeGate & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		async claim(_peer, owner) {
			calls.push(`claim:${owner}`);
		},
		async record(_peer, owner, ws, pane) {
			calls.push(`record:${owner}:${ws}:${pane}`);
		},
		...over,
	};
}

test("buildResumePlan names deterministically and defaults to --session", () => {
	const { peer } = fixture();
	// sessionId tail8 of "…3b6bc49e3b93" is "c49e3b93" — deterministic lineage.
	const plan = buildResumePlan(peer);
	expect(plan.label).toBe("pi-c49e3b93");
	expect(plan.agentName).toBe("pi-c49e3b93");
	expect(plan.piArgs).toEqual(["--session", peer.sessionFile]);
	expect(buildResumePlan(peer, { fork: true }).piArgs).toEqual(["--fork", peer.sessionFile]);
	expect(buildResumePlan(peer, { name: "My Work!" }).label).toBe("pi-my-work-");
});

test("resumePeer runs claim -> workspace -> agent -> record in order", async () => {
	const { peer } = fixture();
	const herdr = fakeHerdr();
	const gate = fakeGate();
	const out = await resumePeer(peer, { owner: "self-1", noFocus: true }, herdr, gate);
	expect(out.ok).toBe(true);
	expect(out.workspaceId).toBe("wNEW");
	expect(gate.calls).toEqual(["claim:self-1", "record:self-1:wNEW:wNEW:p1"]);
	expect(herdr.calls[0]).toBe("listWorkspaces");
	expect(herdr.calls.some((c) => c.startsWith("createWorkspace:pi-"))).toBe(true);
	expect(herdr.calls.some((c) => c.startsWith("startAgent:pi-") && c.endsWith(`--session ${peer.sessionFile}`))).toBe(true);
});

test("resumePeer reuses an existing workspace with the same label", async () => {
	const { peer } = fixture();
	const herdr = fakeHerdr({
		async listWorkspaces() {
			return [{ workspaceId: "wOLD", label: buildResumePlan(peer).label }];
		},
	});
	const out = await resumePeer(peer, { owner: "self-1" }, herdr, fakeGate());
	expect(out.ok).toBe(true);
	expect(out.workspaceId).toBe("wOLD");
	expect(herdr.calls.some((c) => c.startsWith("createWorkspace:"))).toBe(false);
	expect(herdr.calls).toContain("panesOf:wOLD");
});

test("claim rejections map to actionable messages and never touch herdr", async () => {
	const { peer } = fixture();
	for (const [err, expectText] of [
		["already live", "仍在运行"],
		["lease held", "另一个 resume"],
		["unknown session", "hub 拒绝"],
	] as const) {
		const herdr = fakeHerdr();
		const gate = fakeGate({
			async claim() {
				throw new Error(err);
			},
		});
		const out = await resumePeer(peer, { owner: "self-1" }, herdr, gate);
		expect(out.ok).toBe(false);
		expect(out.message).toContain(expectText);
		expect(herdr.calls.length).toBe(0);
	}
});

test("preflight: missing session file or cwd fails before any claim", async () => {
	const home = mkdtempSync(join(tmpdir(), "pi-mesh-resume-missing-"));
	const peer = makePeer(join(home, "gone.jsonl"), home);
	const gate = fakeGate();
	const out = await resumePeer(peer, { owner: "self-1" }, fakeHerdr(), gate);
	expect(out.ok).toBe(false);
	expect(out.message).toContain("会话文件不存在");
	expect(gate.calls.length).toBe(0);

	const peer2 = makePeer(join(home, "gone.jsonl"), join(home, "no-such-dir"));
	writeFileSync(peer2.sessionFile, "{}"); // file exists, cwd does not
	const out2 = await resumePeer(peer2, { owner: "self-1" }, fakeHerdr(), gate);
	expect(out2.ok).toBe(false);
	expect(out2.message).toContain("会话目录已不存在");
	expect(gate.calls.length).toBe(0);
});

test("--print shows the plan and mutates nothing", async () => {
	const { peer } = fixture();
	const herdr = fakeHerdr();
	const gate = fakeGate();
	const out = await resumePeer(peer, { print: true }, herdr, gate);
	expect(out.ok).toBe(true);
	expect(out.message).toContain("herdr workspace create");
	expect(out.message).toContain(`pi --session ${peer.sessionFile}`);
	expect(herdr.calls.length).toBe(0);
	expect(gate.calls.length).toBe(0);
});

test("formatPlan is stable shell", () => {
	const { peer } = fixture();
	const lines = formatPlan(peer, buildResumePlan(peer));
	expect(lines[0]).toContain("--no-focus");
	expect(lines[1]).toContain("--kind pi");
});

test("newSessionInHerdr launches a fresh pi in its own workspace", async () => {
	const home = mkdtempSync(join(tmpdir(), "pi-mesh-new-session-"));
	const herdr = fakeHerdr();
	const out = await newSessionInHerdr({ cwd: home, label: "我的新对话" }, herdr);
	expect(out.ok).toBe(true);
	expect(out.workspaceId).toBe("wNEW");
	// workspace label keeps the user's words
	expect(herdr.calls.some((c) => c.startsWith("createWorkspace:pi-我的新对话:") && c.includes(home))).toBe(true);
	// fresh conversation: `pi --name <label>`, never a --session resume
	const start = herdr.calls.find((c) => c.startsWith("startAgent:"));
	expect(start).toContain("--name pi-我的新对话");
	expect(start).not.toContain("--session");

	const missing = await newSessionInHerdr({ cwd: join(home, "no-such-dir") }, herdr);
	expect(missing.ok).toBe(false);
	expect(missing.message).toContain("目录不存在");

	const reuse = fakeHerdr({
		async listWorkspaces() {
			return [{ workspaceId: "wOLD", label: "pi-fixed" }];
		},
	});
	const out2 = await newSessionInHerdr({ cwd: home, label: "fixed" }, reuse);
	expect(out2.ok).toBe(true);
	expect(out2.workspaceId).toBe("wOLD");
	expect(reuse.calls.some((c) => c.startsWith("createWorkspace:"))).toBe(false);
});

test("focusPeerWorkspace focuses the newest linked workspace", async () => {
	const { peer } = fixture();
	const herdr = fakeHerdr();

	const noLink = await focusPeerWorkspace(peer, herdr);
	expect(noLink.ok).toBe(false);
	expect(noLink.message).toContain("不在 herdr");
	expect(herdr.calls.filter((c) => c.startsWith("focus"))).toEqual([]);

	const linked: typeof peer = {
		...peer,
		resumptions: [
			{ at: "2026-10-30T08:00:00.000Z", via: "mesh-cli", herdrWorkspaceId: "wOLD" },
			{ at: "2026-10-30T09:00:00.000Z", via: "mesh-cli", herdrWorkspaceId: "wNEW" },
		],
	};
	const ok = await focusPeerWorkspace(linked, herdr);
	expect(ok.ok).toBe(true);
	expect(ok.workspaceId).toBe("wNEW");
	expect(herdr.calls).toContain("focusWorkspace:wNEW");
});

test("findHerdrHost falls back to live agent matching by session path", async () => {
	const { peer } = fixture();
	const herdr = fakeHerdr({
		async listAgents() {
			return [
				{ paneId: "wX:p2", workspaceId: "wX", sessionPath: "/other/session.jsonl", status: "idle" },
				{ paneId: "wY:p9", workspaceId: "wY", sessionPath: peer.sessionFile, status: "working" },
			];
		},
	});

	const host = await findHerdrHost(peer, herdr);
	expect(host?.via).toBe("agent-match");
	expect(host?.paneId).toBe("wY:p9");
	expect(host?.command).toBe("herdr agent focus wY:p9");

	const focused = await focusPeerWorkspace(peer, herdr);
	expect(focused.ok).toBe(true);
	expect(herdr.calls).toContain("focusAgent:wY:p9");
});
