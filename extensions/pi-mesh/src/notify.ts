/**
 * Hub-side herdr notifications for followed peers ("needs-you" queue).
 *
 * WHY hub-side: the follow graph and all state transitions live in the hub's
 * global view; a follower pi that is itself offline could never notify.
 * Scope is deliberately tiny: fire-and-forget `herdr notification show`,
 * skipped silently when herdr is absent. Red-team rule: NO transcript text is
 * ever included — only identity, state, branch and cwd.
 */
import { execFile } from "node:child_process";
import type { PeerStateNotice } from "./protocol.ts";
import type { Registry } from "./hub/registry.ts";

export type NotifyRunner = (argv: string[]) => void;

/** Fire-and-forget herdr CLI call; failures are invisible by design. */
export const realRunner: NotifyRunner = (argv) => {
	try {
		execFile("herdr", argv, { timeout: 5_000 }, () => {
			// herdr absent or busy: notifications are best-effort
		});
	} catch {
		// execFile sync throw (e.g. EAGAIN): drop the notification
	}
};

const STATE_LABEL: Record<string, string> = {
	running: "运行中",
	waiting: "等待",
	offline: "离线",
	closed: "已关闭",
};

/** One line of context for the notification body; identity only. */
export function buildNotification(notice: PeerStateNotice, gitBranch: string | null): { title: string; body: string } {
	const id = notice.sessionId.slice(0, 8);
	const title = `pi-mesh · ${notice.title ?? id} → ${STATE_LABEL[notice.state] ?? notice.state}`;
	const body = [`${id}`, gitBranch ? `分支 ${gitBranch}` : null].filter(Boolean).join(" · ");
	return { title, body };
}

/**
 * Subscribe to registry state changes and notify followers.
 * Returns the unsubscribe function.
 */
export function attachNotifier(registry: Registry, runner: NotifyRunner = realRunner): () => void {
	return registry.onChange((event) => {
		if (event.type !== "state_change") return;
		const notice = event.notice;
		if (registry.followersOf(notice.sessionId).length === 0) return;
		const { title, body } = buildNotification(notice, registry.get(notice.sessionId)?.git?.branch ?? null);
		runner(["notification", "show", title, "--body", body, "--sound", "none"]);
	});
}
