import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachNotifier, buildNotification, type NotifyRunner } from "../src/notify.ts";
import { Registry } from "../src/hub/registry.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import type { GitInfo, PeerInfo, PeerStateNotice } from "../src/protocol.ts";

const GIT: GitInfo = { repoRoot: null, branch: null, worktree: null, commonRoot: null };

function makePeer(sessionId: string): PeerInfo {
	return {
		sessionId,
		sessionFile: `/tmp/${sessionId}.jsonl`,
		pid: 1,
		cwd: "/proj/a",
		machineId: "m1",
		startedAt: "2026-09-30T05:00:00.000Z",
		title: "修 bug",
	};
}

function makeRegistry(): Registry {
	return new Registry(DEFAULT_CONFIG, mkdtempSync(join(tmpdir(), "pi-mesh-notify-")));
}

test("buildNotification carries identity only — never transcript text", () => {
	const notice: PeerStateNotice = {
		sessionId: "01a18ba8-0000-0000-0000-000000000000",
		state: "waiting",
		title: "修 bug",
		lastHeartbeat: "2026-10-30T11:00:00.000Z",
	};
	const { title, body } = buildNotification(notice, "feat/x");
	expect(title).toContain("修 bug");
	expect(title).toContain("等待");
	expect(body).toContain("01a18ba8");
	expect(body).toContain("分支 feat/x");
	expect(body).not.toContain("secret");
});

test("notifier fires only for peers that have followers", () => {
	const registry = makeRegistry();
	const calls: string[][] = [];
	const runner: NotifyRunner = (argv) => calls.push(argv);
	const off = attachNotifier(registry, runner);

	registry.register(makePeer("s-watched"), GIT);
	registry.register(makePeer("s-fan"), GIT);
	registry.close("s-watched"); // nobody follows yet: silent
	expect(calls.length).toBe(0);

	registry.follow("s-fan", "s-watched");
	registry.register(makePeer("s-watched"), GIT); // revive -> live
	registry.close("s-watched"); // now a transition with a follower
	expect(calls.length).toBe(1);
	expect(calls[0]![0]).toBe("notification");
	expect(calls[0]![1]).toBe("show");
	expect(calls[0]!.join(" ")).toContain("已关闭");

	off();
	registry.register(makePeer("s-watched"), GIT);
	registry.close("s-watched");
	expect(calls.length).toBe(1); // unsubscribed: no more calls
});

test("same-state heartbeats never notify", () => {
	const registry = makeRegistry();
	const calls: string[][] = [];
	registry.register(makePeer("s-watched"), GIT);
	registry.register(makePeer("s-fan"), GIT);
	registry.follow("s-fan", "s-watched");
	const off = attachNotifier(registry, (argv) => calls.push(argv));
	registry.heartbeat("s-watched", "waiting"); // waiting -> waiting
	registry.heartbeat("s-watched", "running"); // waiting -> running: one call
	registry.heartbeat("s-watched", "running"); // steady
	expect(calls.length).toBe(1);
	off();
});
