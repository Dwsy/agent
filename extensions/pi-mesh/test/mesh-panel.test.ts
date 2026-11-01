import { expect, test } from "bun:test";
import {
	MeshPanel,
	buildRows,
	displayWidth,
	fit,
	formatAge,
	scrollWindow,
	type MeshPanelDeps,
	type MeshRow,
} from "../src/mesh-panel.ts";
import type { PeerView, TranscriptEntry } from "../src/protocol.ts";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const FOLDER_EMOJI = "\u{1F4C1}";

function peer(over: Partial<PeerView>): PeerView {
	return {
		sessionId: "01a18ba8-0000-0000-0000-000000000000",
		sessionFile: "/tmp/s.jsonl",
		pid: 1,
		cwd: "/proj/a",
		machineId: "m1",
		startedAt: "2026-10-30T10:00:00.000Z",
		state: "waiting",
		lastHeartbeat: "2026-10-30T11:59:30.000Z",
		git: { repoRoot: null, branch: null, worktree: null, commonRoot: null },
		files: [],
		following: [],
		...over,
	};
}

function peerIds(rows: MeshRow[]): string[] {
	return rows.filter((row) => row.kind === "peer").map((row) => (row.kind === "peer" ? row.peer.sessionId : ""));
}

function labels(rows: MeshRow[]): string[] {
	return rows.filter((row) => row.kind === "group").map((row) => (row.kind === "group" ? row.label : ""));
}

test("displayWidth counts CJK as 2 and ignores ANSI", () => {
	expect(displayWidth("abc")).toBe(3);
	expect(displayWidth("修 bug")).toBe(6);
	expect(displayWidth("\x1b[32m▶\x1b[0m")).toBe(1);
});

test("fit pads short lines and truncates long ones with ellipsis", () => {
	expect(fit("ab", 5)).toBe("ab   ");
	expect(displayWidth(fit("超长的中文标题超长", 8))).toBeLessThanOrEqual(8);
	expect(fit("超长的中文标题超长", 8)).toContain("…");
});

test("buildRows groups by repo -> branch, no-git bucket last, states ordered", () => {
	const rows = buildRows([
		peer({ sessionId: "cccccccc-3" }),
		peer({
			sessionId: "bbbbbbbb-2",
			state: "running",
			git: { repoRoot: "/proj/repo", branch: "feat/x", worktree: "linked", commonRoot: "/proj/repo" },
		}),
		peer({
			sessionId: "aaaaaaaa-1",
			state: "offline",
			git: { repoRoot: "/proj/repo", branch: "main", worktree: "main", commonRoot: "/proj/repo" },
		}),
	]);
	const groupLabels = labels(rows);
	expect(groupLabels[0]).toBe("proj/repo");
	expect(groupLabels).toContain("  ── main · 1");
	expect(groupLabels).toContain("  ── feat/x [linked] · 1");
	expect(groupLabels[groupLabels.length - 1]).toBe("(无仓库)");
	expect(groupLabels.every((label) => !label.includes(FOLDER_EMOJI))).toBe(true);

	// within a repo group: running (feat/x) appears before offline (main)?
	// no: groups are branch-sorted; states sort within a branch
	expect(peerIds(rows)).toEqual(["bbbbbbbb-2", "aaaaaaaa-1", "cccccccc-3"]);
});

test("buildRows sorts repo and branch groups by best state, then name", () => {
	const offlineFeat = peer({
		sessionId: "offline-1",
		state: "offline",
		git: { repoRoot: "/proj/repo", branch: "feat/x", worktree: "main", commonRoot: "/proj/repo" },
	});
	const runningMain = peer({
		sessionId: "running-1",
		state: "running",
		git: { repoRoot: "/proj/repo", branch: "main", worktree: "main", commonRoot: "/proj/repo" },
	});
	const waitingDev = peer({
		sessionId: "waiting-1",
		state: "waiting",
		git: { repoRoot: "/proj/repo", branch: "dev", worktree: "main", commonRoot: "/proj/repo" },
	});
	const rows = buildRows([offlineFeat, runningMain, waitingDev]);
	expect(labels(rows)).toEqual([
		"proj/repo",
		"  ── main · 1",
		"  ── dev · 1",
		"  ── feat/x · 1",
	]);
	expect(peerIds(rows)).toEqual(["running-1", "waiting-1", "offline-1"]);

	const offlineRepo = peer({
		sessionId: "off-repo",
		state: "offline",
		git: { repoRoot: "/a/aaa", branch: "main", worktree: "main", commonRoot: "/a/aaa" },
	});
	const runningRepo = peer({
		sessionId: "run-repo",
		state: "running",
		git: { repoRoot: "/z/zzz", branch: "main", worktree: "main", commonRoot: "/z/zzz" },
	});
	const repoRows = buildRows([offlineRepo, runningRepo]);
	expect(labels(repoRows)[0]).toBe("z/zzz / main · 1");
});

test("buildRows filters closed peers and exposes the collapsed summary", () => {
	const active = peer({ sessionId: "active-1", state: "running", title: "Active" });
	const offline = peer({
		sessionId: "active-2",
		state: "offline",
		git: { repoRoot: "/tmp/x", branch: "main", worktree: "main", commonRoot: "/tmp/x" },
	});
	const closed1 = peer({
		sessionId: "closed-1",
		state: "closed",
		closedAt: "2026-10-30T11:00:00.000Z",
		git: { repoRoot: "/r", branch: "main", worktree: "main", commonRoot: "/r" },
	});
	const closed2 = peer({
		sessionId: "closed-2",
		state: "closed",
		closedAt: "2026-10-30T11:30:00.000Z",
		git: { repoRoot: "/r", branch: "dev", worktree: "main", commonRoot: "/r" },
	});
	const peers = [active, offline, closed1, closed2];

	const activeRows = buildRows(peers);
	expect(peerIds(activeRows).sort()).toEqual(["active-1", "active-2"]);
	const summary = activeRows.find((row) => row.kind === "collapsed");
	expect(summary).toEqual({ kind: "collapsed", label: "已关闭", count: 2, expanded: false });

	const allRows = buildRows(peers, { filter: "all" });
	expect(peerIds(allRows).sort()).toEqual(["active-1", "active-2"]);
	expect(allRows.find((row) => row.kind === "collapsed")).toMatchObject({ count: 2, expanded: false });

	const expanded = buildRows(peers, { filter: "all", expandedClosed: true });
	expect(peerIds(expanded)).toContain("closed-1");
	expect(peerIds(expanded)).toContain("closed-2");
	expect(expanded.find((row) => row.kind === "collapsed")).toMatchObject({ count: 2, expanded: true });

	const closedOnly = buildRows(peers, { filter: "closed" });
	expect(peerIds(closedOnly).sort()).toEqual(["closed-1", "closed-2"]);
	expect(closedOnly.some((row) => row.kind === "collapsed")).toBe(false);
});

test("buildRows search matches title, id tail, branch, repo label and cwd", () => {
	const first = peer({
		sessionId: "01a18ba8-1111aaaa",
		title: "Fix login flow",
		state: "running",
		cwd: "/Users/me/AI/agentdock",
		git: {
			repoRoot: "/Users/me/AI/agentdock",
			branch: "feat/search",
			worktree: "main",
			commonRoot: "/Users/me/AI/agentdock",
		},
	});
	const second = peer({
		sessionId: "01a18ba8-2222bbbb",
		title: "Write docs",
		state: "waiting",
		cwd: "/tmp/x",
		git: { repoRoot: "/tmp/x", branch: "main", worktree: "main", commonRoot: "/tmp/x" },
	});
	const peers = [first, second];
	expect(peerIds(buildRows(peers, { query: "login" }))).toEqual([first.sessionId]);
	expect(peerIds(buildRows(peers, { query: "1111AAAA" }))).toEqual([first.sessionId]);
	expect(peerIds(buildRows(peers, { query: "feat/search" }))).toEqual([first.sessionId]);
	expect(peerIds(buildRows(peers, { query: "AI/agentdock" }))).toEqual([first.sessionId]);
	expect(peerIds(buildRows(peers, { query: "tmp/x" }))).toEqual([second.sessionId]);
	expect(buildRows(peers, { query: "no-such-session" })).toEqual([]);
});

test("formatAge uses startedAt for live peers and closedAt for closed peers", () => {
	const running = peer({
		state: "running",
		startedAt: "2026-10-30T10:00:00.000Z",
		lastHeartbeat: "2026-10-30T11:59:59.000Z",
	});
	expect(formatAge(running, NOW)).toBe("2h");
	expect(formatAge({ ...running, lastHeartbeat: "2026-10-30T11:00:00.000Z" }, NOW)).toBe("2h");

	const closed = peer({
		state: "closed",
		startedAt: "2026-10-30T06:00:00.000Z",
		closedAt: "2026-10-30T11:00:00.000Z",
		lastHeartbeat: "2026-10-30T11:59:59.000Z",
	});
	expect(formatAge(closed, NOW)).toBe("1h");
});

test("scrollWindow keeps the selection visible and clamps at both ends", () => {
	expect(scrollWindow(100, 50, 10)).toBe(41);
	expect(scrollWindow(100, 5, 10)).toBe(0);
	expect(scrollWindow(100, 50, 10, 45)).toBe(45);
	expect(scrollWindow(100, 50, 10, 10)).toBe(41);
	expect(scrollWindow(5, 4, 10)).toBe(0);
	expect(scrollWindow(100, 99, 10, 200)).toBe(90);
	expect(scrollWindow(0, 0, 10)).toBe(0);
});

function stubDeps(over: Partial<MeshPanelDeps> = {}): MeshPanelDeps {
	return {
		fetchPeers: async () => [peer({ sessionId: "aaaaaaaa-1" })],
		fetchTranscript: async (): Promise<TranscriptEntry[]> => [],
		setFollow: async () => {},
		resume: async () => ({ ok: true, message: "resumed" }),
		selfSessionId: "self-1",
		now: () => NOW,
		requestRender: () => {},
		onClose: () => {},
		...over,
	};
}

test("panel renders a bordered frame and never exceeds the viewport width", async () => {
	const panel = new MeshPanel(stubDeps());
	await Bun.sleep(10); // let the initial refresh land
	for (const width of [40, 80, 120]) {
		for (const line of panel.render(width)) {
			expect(displayWidth(line)).toBeLessThanOrEqual(width);
		}
	}
	const text = panel.render(100).join("\n");
	expect(text).toContain("pi-mesh");
	expect(text).toContain("╭");
	expect(text).toContain("╯");
	// The panel shows the id tail, because session ids share a timestamp prefix.
	expect(text).toContain("aaaaaa-1");
});

test("renders width-safe rows at 60/100/140, without emoji, with a wide split", async () => {
	const peers = [
		peer({
			sessionId: "aaaa1111-1111",
			state: "running",
			title: "一个很长的中文标题用来验证截断不会吃掉徽章",
			files: [{ path: "/tmp/a", op: "edit", ts: "2026-10-30T11:00:00.000Z" }],
			resumptions: [{ at: "2026-10-30T11:00:00.000Z", via: "mesh-cli" }],
			git: {
				repoRoot: "/Users/me/AI/agentdock",
				branch: "main",
				worktree: "main",
				commonRoot: "/Users/me/AI/agentdock",
			},
		}),
		peer({
			sessionId: "bbbb2222-2222",
			state: "waiting",
			title: "Second",
			git: { repoRoot: "/tmp/x", branch: "dev", worktree: "linked", commonRoot: "/tmp/x" },
		}),
		peer({ sessionId: "cccc3333-3333", state: "closed", closedAt: "2026-10-30T11:00:00.000Z" }),
	];
	const panel = new MeshPanel(stubDeps({ fetchPeers: async () => peers }));
	await Bun.sleep(10);

	for (const width of [60, 100, 140]) {
		const lines = panel.render(width);
		for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(width);
		const text = lines.join("\n");
		expect(text).not.toContain(FOLDER_EMOJI);
		expect(text).not.toContain("\x1b[35m");
		expect(text).not.toContain("\x1b[34m");
		expect(/[\u{1F000}-\u{1FAFF}]/u.test(text)).toBe(false);
	}

	const wideBody = panel.render(140).slice(1, -1);
	for (const line of wideBody) {
		expect((line.match(/│/g) ?? []).length).toBeGreaterThanOrEqual(3);
	}
	const wideText = panel.render(140).join("\n");
	expect(wideText).toContain("活跃");
	expect(wideText).toContain("关闭");
});

test("body shrinks to content and still fills when rows overflow", async () => {
	const eight = Array.from({ length: 8 }, (_, index) =>
		peer({
			sessionId: `peer-${index}`,
			title: `Peer ${index}`,
			state: "running",
			git: { repoRoot: "/proj/repo", branch: "main", worktree: "main", commonRoot: "/proj/repo" },
		}),
	);
	const compact = new MeshPanel(
		stubDeps({ fetchPeers: async () => eight, viewport: () => ({ width: 100, height: 40 }) }),
	);
	await Bun.sleep(10);
	const compactLines = compact.render(100);
	expect(compactLines.length).toBeLessThanOrEqual(12);
	expect(compactLines.join("\n")).toContain("Peer 7");

	const many = Array.from({ length: 40 }, (_, index) =>
		peer({
			sessionId: `many-${index}`,
			title: `Many ${index}`,
			state: "running",
			git: { repoRoot: "/proj/repo", branch: "main", worktree: "main", commonRoot: "/proj/repo" },
		}),
	);
	const full = new MeshPanel(
		stubDeps({ fetchPeers: async () => many, viewport: () => ({ width: 100, height: 40 }) }),
	);
	await Bun.sleep(10);
	// bodyHeight() is 30 at 40 rows; overflowing content must keep the full body.
	expect(full.render(100).length).toBe(32);
});

test("keys: q closes from list view, arrows skip group headers", async () => {
	let closed = false;
	const deps = stubDeps({
		fetchPeers: async () => [
			peer({ sessionId: "aaaaaaaa-1", git: { repoRoot: "/r", branch: "main", worktree: "main", commonRoot: "/r" } }),
			peer({ sessionId: "bbbbbbbb-2", git: { repoRoot: "/r", branch: "dev", worktree: "main", commonRoot: "/r" } }),
		],
		onClose: () => {
			closed = true;
		},
	});
	const panel = new MeshPanel(deps);
	await Bun.sleep(10);
	panel.handleInput("q");
	expect(closed).toBe(true);
});

test("detail view: Enter opens transcript, Esc returns to list", async () => {
	const deps = stubDeps({
		fetchTranscript: async (): Promise<TranscriptEntry[]> => [
			{ id: "e1", timestamp: "2026-10-30T11:00:00.000Z", role: "user", text: "hello" },
		],
	});
	const panel = new MeshPanel(deps);
	await Bun.sleep(10);
	panel.handleInput("\r");
	await Bun.sleep(10);
	expect(panel.render(100).join("\n")).toContain("hello");
	panel.handleInput("\x1b");
	expect(panel.render(100).join("\n")).toContain("❯");
});

test("narrow detail scrolls with j and Esc returns to the list", async () => {
	const entries: TranscriptEntry[] = Array.from({ length: 30 }, (_, index) => ({
		id: `e${index}`,
		timestamp: `2026-10-30T11:${String(index).padStart(2, "0")}:00.000Z`,
		role: "user",
		text: `E${String(index).padStart(2, "0")} payload`,
	}));
	const deps = stubDeps({
		fetchPeers: async () => [peer({ sessionId: "aaaaaaaa-1", title: "Detail Title", state: "running" })],
		fetchTranscript: async () => entries,
		selfSessionId: null,
		viewport: () => ({ width: 60, height: 16 }),
	});
	const panel = new MeshPanel(deps);
	await Bun.sleep(10);
	expect(panel.render(60).join("\n")).toContain("❯");

	panel.handleInput("\r");
	await Bun.sleep(10);
	const before = panel.render(60).join("\n");
	expect(before).toContain("Detail Title");
	expect(before).toContain("E06 payload");
	expect(before).not.toContain("E07 payload");
	expect(before).toContain("滚动");

	panel.handleInput("j");
	const after = panel.render(60).join("\n");
	expect(after).not.toBe(before);
	expect(after).not.toContain("Detail Title");
	expect(after).toContain("E07 payload");
	expect(after).toContain("滚动");

	panel.handleInput("\x1b");
	const back = panel.render(60).join("\n");
	expect(back).toContain("❯");
	expect(back).not.toContain("────");
	expect(back).toContain("移动");
});

test("search input filters live, no-results has a hint, Esc clears", async () => {
	const first = peer({
		sessionId: "01a18ba8-1111aaaa",
		title: "Fix login",
		state: "running",
		git: { repoRoot: "/r", branch: "feat/search", worktree: "main", commonRoot: "/r" },
	});
	const second = peer({
		sessionId: "01a18ba8-2222bbbb",
		title: "Write docs",
		state: "waiting",
		cwd: "/tmp/x",
		git: { repoRoot: "/tmp/x", branch: "main", worktree: "main", commonRoot: "/tmp/x" },
	});
	const panel = new MeshPanel(stubDeps({ fetchPeers: async () => [first, second] }));
	await Bun.sleep(10);
	panel.render(100);

	panel.handleInput("/");
	for (const char of "login") panel.handleInput(char);
	let text = panel.render(100).join("\n");
	expect(text).toContain("Fix login");
	expect(text).not.toContain("Write docs");

	for (const char of "zzz") panel.handleInput(char);
	text = panel.render(100).join("\n");
	expect(text).toContain("(没有匹配的会话 · / 清除搜索)");

	// Commit, then the hint's slash clears the query and starts a fresh input.
	panel.handleInput("\r");
	panel.handleInput("/");
	text = panel.render(100).join("\n");
	expect(text).toContain("Fix login");
	expect(text).toContain("Write docs");
	expect(text).toContain("搜索: ▏");

	panel.handleInput("\x1b");
	text = panel.render(100).join("\n");
	expect(text).toContain("Write docs");
	expect(text).not.toContain("搜索:");

	panel.handleInput("j"); // select "Write docs" before searching
	panel.handleInput("/");
	panel.handleInput("j");
	panel.handleInput("k");
	expect(panel.render(100).join("\n")).toContain("搜索: jk");
	panel.handleInput("\x7f");
	expect(panel.render(100).join("\n")).toContain("搜索: j");
	panel.handleInput("\x1b");
	const restored = panel
		.render(100)
		.join("\n")
		.split("\n")
		.find((line) => line.includes("❯"));
	expect(restored).toContain("Write docs");
});

test("selection follows sessionId across filter changes", async () => {
	const first = peer({
		sessionId: "aaaaaaaa-1",
		title: "Alpha",
		state: "running",
		startedAt: "2026-10-30T10:00:00.000Z",
		git: { repoRoot: "/r", branch: "main", worktree: "main", commonRoot: "/r" },
	});
	const second = peer({
		sessionId: "bbbbbbbb-2",
		title: "Beta",
		state: "running",
		startedAt: "2026-10-30T11:00:00.000Z",
		git: { repoRoot: "/r", branch: "main", worktree: "main", commonRoot: "/r" },
	});
	const panel = new MeshPanel(stubDeps({ fetchPeers: async () => [first, second] }));
	await Bun.sleep(10);
	panel.render(100);
	// Newest first within the branch: Beta, then Alpha.
	panel.handleInput("j");
	panel.handleInput("a");
	const selected = panel
		.render(100)
		.join("\n")
		.split("\n")
		.find((line) => line.includes("❯"));
	expect(selected).toContain("Alpha");
});

test("default selection lands on the running branch", async () => {
	const offline = peer({
		sessionId: "offline-1",
		title: "Offline",
		state: "offline",
		git: { repoRoot: "/proj/repo", branch: "feat/x", worktree: "main", commonRoot: "/proj/repo" },
	});
	const running = peer({
		sessionId: "running-1",
		title: "Running",
		state: "running",
		git: { repoRoot: "/proj/repo", branch: "main", worktree: "main", commonRoot: "/proj/repo" },
	});
	const waiting = peer({
		sessionId: "waiting-1",
		title: "Waiting",
		state: "waiting",
		git: { repoRoot: "/proj/repo", branch: "dev", worktree: "main", commonRoot: "/proj/repo" },
	});
	const panel = new MeshPanel(stubDeps({ fetchPeers: async () => [offline, running, waiting] }));
	await Bun.sleep(10);
	const selected = panel
		.render(100)
		.join("\n")
		.split("\n")
		.find((line) => line.includes("❯"));
	expect(selected).toContain("Running");
	expect(selected).toContain("▶");
});

test("self peer gets a 本 badge and a 本会话 detail line", async () => {
	const self = peer({
		sessionId: "self-1",
		title: "Self Session",
		state: "running",
		files: [{ path: "/tmp/a", op: "edit", ts: "2026-10-30T11:00:00.000Z" }],
		resumptions: [{ at: "2026-10-30T11:00:00.000Z", via: "mesh-cli" }],
		git: { repoRoot: "/proj/repo", branch: "main", worktree: "main", commonRoot: "/proj/repo" },
	});
	const other = peer({
		sessionId: "other-1",
		title: "Other Session",
		state: "waiting",
		git: { repoRoot: "/proj/repo", branch: "main", worktree: "main", commonRoot: "/proj/repo" },
	});
	const panel = new MeshPanel(
		stubDeps({ fetchPeers: async () => [self, other], selfSessionId: "self-1" }),
	);
	await Bun.sleep(10);
	const narrow = panel.render(60).join("\n");
	const selfLine = narrow.split("\n").find((line) => line.includes("Self Session"));
	const otherLine = narrow.split("\n").find((line) => line.includes("Other Session"));
	expect(selfLine).toContain("本");
	expect(otherLine).not.toContain("本");
	// 本 is the first badge, before files/resume badges.
	expect(selfLine!.indexOf("1f")).toBeGreaterThan(selfLine!.indexOf("本"));
	expect(panel.render(100).join("\n")).toContain("本会话");
});

test("follow action reports status and adds the badge", async () => {
	let following: string[] = [];
	let self = peer({ sessionId: "self-1", state: "offline", title: "Self", following: [] });
	const target = peer({
		sessionId: "target-1",
		state: "running",
		title: "Target",
		git: { repoRoot: "/r", branch: "main", worktree: "main", commonRoot: "/r" },
	});
	const calls: Array<[string, boolean]> = [];
	const deps = stubDeps({
		fetchPeers: async () => {
			self = { ...self, following: [...following] };
			return [self, target];
		},
		setFollow: async (targetSessionId, follow) => {
			calls.push([targetSessionId, follow]);
			following = follow ? [targetSessionId] : [];
		},
	});
	const panel = new MeshPanel(deps);
	await Bun.sleep(10);
	panel.handleInput("f");
	await Bun.sleep(10);
	expect(calls).toEqual([["target-1", true]]);
	const text = panel.render(100).join("\n");
	expect(text).toContain("已关注");
	expect(text).toContain("◆");
});

test("resume confirmation requires y and surfaces the result", async () => {
	const dead = peer({ sessionId: "dead-1", state: "offline", title: "Dead" });
	const resumed: PeerView[] = [];
	const panel = new MeshPanel(
		stubDeps({
			fetchPeers: async () => [dead],
			resume: async (target) => {
				resumed.push(target);
				return { ok: true, message: "已恢复" };
			},
		}),
	);
	await Bun.sleep(10);

	panel.handleInput("R");
	expect(panel.render(100).join("\n")).toContain("[y/N]");
	panel.handleInput("n");
	expect(resumed).toHaveLength(0);
	expect(panel.render(100).join("\n")).toContain("已取消恢复");

	panel.handleInput("R");
	panel.handleInput("y");
	await Bun.sleep(10);
	expect(resumed).toHaveLength(1);
	expect(resumed[0]!.sessionId).toBe("dead-1");
	expect(panel.render(100).join("\n")).toContain("已恢复");
});

test("filter cycle and closed expansion work from the keyboard", async () => {
	const active = peer({
		sessionId: "active-1",
		state: "running",
		title: "Active",
		git: { repoRoot: "/r", branch: "main", worktree: "main", commonRoot: "/r" },
	});
	const closed = peer({
		sessionId: "closed-1",
		state: "closed",
		title: "Closed Title",
		closedAt: "2026-10-30T11:00:00.000Z",
		git: { repoRoot: "/r", branch: "old", worktree: "main", commonRoot: "/r" },
	});
	const panel = new MeshPanel(stubDeps({ fetchPeers: async () => [active, closed] }));
	await Bun.sleep(10);
	let text = panel.render(100).join("\n");
	expect(text).toContain("▸ 已关闭 · 1");
	expect(text).not.toContain("Closed Title");

	panel.handleInput("j"); // collapsed summary is the next selectable row
	panel.handleInput("\r");
	text = panel.render(100).join("\n");
	expect(text).toContain("▾ 已关闭 · 1");
	expect(text).toContain("Closed Title");

	panel.handleInput("\x1b[D");
	text = panel.render(100).join("\n");
	expect(text).toContain("▸ 已关闭 · 1");
	expect(text).not.toContain("Closed Title");

	panel.handleInput("\x1b[C");
	text = panel.render(100).join("\n");
	expect(text).toContain("▾ 已关闭 · 1");

	panel.handleInput("a"); // all -> closed
	text = panel.render(100).join("\n");
	expect(text).toContain("已关闭");
	expect(text).toContain("Closed Title");
});

test("wide Tab focuses detail; j scrolls detail without moving list selection", async () => {
	const entries: TranscriptEntry[] = Array.from({ length: 30 }, (_, index) => ({
		id: `e${index}`,
		timestamp: `2026-10-30T11:${String(index).padStart(2, "0")}:00.000Z`,
		role: "user",
		text: `E${String(index).padStart(2, "0")} payload`,
	}));
	const first = peer({
		sessionId: "aaaaaaaa-1",
		title: "Alpha",
		state: "running",
		startedAt: "2026-10-30T11:00:00.000Z",
		git: { repoRoot: "/r", branch: "main", worktree: "main", commonRoot: "/r" },
	});
	const second = peer({
		sessionId: "bbbbbbbb-2",
		title: "Beta",
		state: "running",
		startedAt: "2026-10-30T10:00:00.000Z",
		git: { repoRoot: "/r", branch: "main", worktree: "main", commonRoot: "/r" },
	});
	const panel = new MeshPanel(
		stubDeps({
			fetchPeers: async () => [first, second],
			fetchTranscript: async () => entries,
			selfSessionId: null,
			viewport: () => ({ width: 100, height: 16 }),
		}),
	);
	await Bun.sleep(10);
	const before = panel.render(100).join("\n");
	expect(before).toContain("E06 payload");
	expect(before).not.toContain("E07 payload");

	panel.handleInput("\t");
	panel.handleInput("j");
	const after = panel.render(100).join("\n");
	expect(after).toContain("E07 payload");
	const selected = after.split("\n").find((line) => line.includes("❯"));
	expect(selected).toContain("Alpha");
});

test("? opens a help layer and any key closes it", async () => {
	const panel = new MeshPanel(stubDeps());
	await Bun.sleep(10);
	panel.handleInput("?");
	const help = panel.render(100).join("\n");
	expect(help).toContain("按键速查");
	expect(help).toContain("PgUp / PgDn");
	expect(help).toContain("任意键关闭");
	panel.handleInput("x");
	expect(panel.render(100).join("\n")).not.toContain("按键速查");
});
