/**
 * `/mesh-status` report + clipboard contract. The formatter is pure, so it is
 * exercised directly; the command layer is pinned statically where it would
 * otherwise need a live hub.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	clipboardCandidates,
	copyToClipboard,
	formatMeshStatus,
	type MeshStatusInput,
} from "../src/status.ts";
import type { PeerView } from "../src/protocol.ts";

const root = join(import.meta.dir, "..");
const NOW = Date.parse("2026-01-01T01:00:00.000Z");

function peer(overrides: Partial<PeerView> & { sessionId: string }): PeerView {
	return {
		sessionId: overrides.sessionId,
		sessionFile: "",
		pid: 4242,
		cwd: "/tmp/bw-platform",
		machineId: "local",
		startedAt: "2026-01-01T00:00:00.000Z",
		state: "waiting",
		lastHeartbeat: "2026-01-01T00:55:00.000Z",
		git: { repoRoot: "/tmp/bw-platform", branch: "main", worktree: "main", commonRoot: "/tmp/bw-platform" },
		files: [],
		following: [],
		...overrides,
	};
}

function status(overrides: Partial<MeshStatusInput> = {}): MeshStatusInput {
	return {
		peers: [],
		selfSessionId: "01a19b1a-0e08-75c5-b7a8-e1ac0dce28ef",
		socketPath: "/home/u/.pi/pi-mesh/mesh.sock",
		httpPort: 5210,
		hubError: null,
		now: NOW,
		...overrides,
	};
}

test("hub up: reports endpoint, self tail, counts and online rows", () => {
	const report = formatMeshStatus(
		status({
			peers: [
				peer({ sessionId: "aaaa1111-0000-0000-0000-000000000001", state: "running" }),
				peer({ sessionId: "bbbb2222-0000-0000-0000-000000000002", state: "waiting", cwd: "/tmp/other" }),
				peer({ sessionId: "cccc3333-0000-0000-0000-000000000003", state: "offline" }),
				peer({ sessionId: "dddd4444-0000-0000-0000-000000000004", state: "closed" }),
			],
		}),
	);
	const lines = report.split("\n");
	expect(lines[0]).toBe(
		"pi-mesh · hub 运行中 · 127.0.0.1:5210 · /home/u/.pi/pi-mesh/mesh.sock",
	);
	expect(report).toContain("本会话 0dce28ef");
	expect(report).toContain("4 条记录 · 在线 2（运行 1 / 等待 1） · 离线 1 · 已关闭 1");
	expect(report).toContain("在线会话 2：");
	expect(report).toContain("00000001  运行  5 分钟前  bw-platform (main)");
	expect(report).toContain("00000002  等待  5 分钟前  other (main)");
	expect(report).not.toContain("00000003");
});

test("online rows order by startedAt, never by heartbeat", () => {
	const late = peer({
		sessionId: "late0000-0000-0000-0000-0000000000aa",
		startedAt: "2026-01-01T00:30:00.000Z",
		lastHeartbeat: "2026-01-01T00:59:00.000Z",
	});
	const early = peer({
		sessionId: "early000-0000-0000-0000-0000000000bb",
		startedAt: "2026-01-01T00:10:00.000Z",
		lastHeartbeat: "2026-01-01T00:20:00.000Z",
	});
	const report = formatMeshStatus(status({ peers: [late, early] }));
	expect(report.indexOf("000000bb")).toBeLessThan(report.indexOf("000000aa"));
});

test("hub down: states the cause and the next step, and lists no peers", () => {
	const report = formatMeshStatus(
		status({ hubError: "pi-mesh: cannot connect to hub at /home/u/.pi/pi-mesh/mesh.sock", peers: [] }),
	);
	expect(report).toContain("pi-mesh · hub 不可用 · /home/u/.pi/pi-mesh/mesh.sock");
	expect(report).toContain("原因：pi-mesh: cannot connect to hub");
	expect(report).toContain("下一步：/mesh web 拉起 hub");
	expect(report).not.toContain("在线会话");
});

test("no online peers says so instead of printing an empty section", () => {
	const report = formatMeshStatus(status({ peers: [peer({ sessionId: "cccc3333-0000-0000-0000-000000000003", state: "offline" })] }));
	expect(report).toContain("在线会话：无");
	expect(report).not.toContain("在线会话 0：");
});

test("title wins over cwd basename; missing branch drops the suffix", () => {
	const report = formatMeshStatus(
		status({
			peers: [
				peer({
					sessionId: "eeee5555-0000-0000-0000-000000000005",
					title: "审查支付回调",
					git: { repoRoot: null, branch: null, worktree: null, commonRoot: null },
				}),
			],
		}),
	);
	expect(report).toContain("00000005  等待  5 分钟前  审查支付回调");
});

test("unknown self session omits the self line", () => {
	const report = formatMeshStatus(status({ selfSessionId: null }));
	expect(report).not.toContain("本会话");
});

test("clipboard candidates cover darwin/win32/linux and reject unknown platforms", () => {
	expect(clipboardCandidates("darwin")).toEqual([["pbcopy", []]]);
	expect(clipboardCandidates("win32")).toEqual([["clip", []]]);
	expect(clipboardCandidates("linux")).toEqual([
		["wl-copy", []],
		["xclip", ["-selection", "clipboard"]],
	]);
	expect(clipboardCandidates("freebsd")).toEqual([]);
});

test("copyToClipboard stops at the first working command and passes the text", () => {
	const calls: Array<[string, string[], string]> = [];
	copyToClipboard("报告正文", (command, args, text) => {
		calls.push([command, args, text]);
		return { ok: true };
	});
	const [command, args] = clipboardCandidates()[0];
	expect(calls).toEqual([[command, args, "报告正文"]]);
});

test("copyToClipboard throws naming every failed command", () => {
	expect(() => copyToClipboard("x", () => ({ ok: false, error: "boom" }))).toThrow(
		/复制到剪贴板失败（.*boom/,
	);
});

test("/mesh-status is registered and `/mesh status copy` shares the handler", () => {
	const src = readFileSync(join(root, "src/command.ts"), "utf8");
	expect(src).toContain('pi.registerCommand("mesh-status"');
	expect(src).toContain("handler: runMeshStatus");
	expect(src).toContain("copyToClipboard(report)");
	expect(src).toContain('trimmed === "status"');
});
