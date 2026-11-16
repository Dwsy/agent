/**
 * `/mesh-status` report + clipboard copy.
 *
 * WHY a separate module: the report is pure data -> text, so it can be tested
 * without a hub, and the clipboard is a platform detail the command layer must
 * not grow. Copy is an explicit user action: a failed copy fails loudly with
 * the attempted commands instead of silently dropping the text.
 */
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import type { PeerView } from "./protocol.ts";

export interface MeshStatusInput {
	/** Empty when the hub could not be queried; `hubError` then explains why. */
	peers: readonly PeerView[];
	selfSessionId: string | null;
	socketPath: string;
	httpPort: number;
	hubError: string | null;
	now: number;
}

const STATE_LABEL: Record<PeerView["state"], string> = {
	running: "运行",
	waiting: "等待",
	offline: "离线",
	closed: "已关闭",
};

/** Session ids share a timestamp prefix; the tail is the distinguishing part. */
function tail(sessionId: string): string {
	return sessionId.slice(-8);
}

function ageLabel(now: number, iso: string): string {
	const ts = Date.parse(iso);
	if (!Number.isFinite(ts)) return "未知";
	const seconds = Math.max(0, Math.round((now - ts) / 1000));
	if (seconds < 60) return `${seconds} 秒前`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} 分钟前`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} 小时前`;
	return `${Math.round(hours / 24)} 天前`;
}

function peerLabel(peer: PeerView): string {
	const name = peer.title?.trim() || (peer.cwd ? basename(peer.cwd) : "?");
	const branch = peer.git?.branch;
	return branch ? `${name} (${branch})` : name;
}

/**
 * Landmine #2 from AGENTS.md: never order by `lastHeartbeat` — per-peer
 * heartbeat ticks would reshuffle the list on every call.
 */
function byStart(peers: readonly PeerView[]): PeerView[] {
	return [...peers].sort(
		(a, b) => a.startedAt.localeCompare(b.startedAt) || a.sessionId.localeCompare(b.sessionId),
	);
}

/** One report, shown by the command as-is and copied verbatim by `copy`. */
export function formatMeshStatus(input: MeshStatusInput): string {
	const header = input.hubError
		? `pi-mesh · hub 不可用 · ${input.socketPath}`
		: `pi-mesh · hub 运行中 · 127.0.0.1:${input.httpPort} · ${input.socketPath}`;
	const lines = [header];
	if (input.selfSessionId) lines.push(`本会话 ${tail(input.selfSessionId)}`);
	if (input.hubError) {
		lines.push(`原因：${input.hubError}`);
		lines.push("下一步：/mesh web 拉起 hub，然后重试");
		return lines.join("\n");
	}

	const counts: Record<PeerView["state"], number> = { running: 0, waiting: 0, offline: 0, closed: 0 };
	for (const peer of input.peers) counts[peer.state] += 1;
	const online = byStart(input.peers.filter((peer) => peer.state === "running" || peer.state === "waiting"));

	lines.push(
		`${input.peers.length} 条记录 · 在线 ${online.length}（运行 ${counts.running} / 等待 ${counts.waiting}） · 离线 ${counts.offline} · 已关闭 ${counts.closed}`,
	);
	if (online.length === 0) {
		lines.push("在线会话：无");
		return lines.join("\n");
	}

	const rows = online.map((peer) => ({
		tail: tail(peer.sessionId),
		state: STATE_LABEL[peer.state],
		age: ageLabel(input.now, peer.lastHeartbeat),
		label: peerLabel(peer),
	}));
	const ageWidth = Math.max(...rows.map((row) => row.age.length));
	lines.push(`在线会话 ${online.length}：`);
	for (const row of rows) {
		lines.push(`  ${row.tail}  ${row.state}  ${row.age.padEnd(ageWidth)}  ${row.label}`);
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

export interface ClipboardResult {
	ok: boolean;
	error?: string;
}

/** Injected so tests never touch the real clipboard. */
export type ClipboardRunner = (command: string, args: string[], text: string) => ClipboardResult;

/**
 * Per-platform candidates, tried in order: Wayland first on Linux, then X11.
 * An empty list means this platform has no known clipboard tool.
 */
export function clipboardCandidates(platform: string = process.platform): Array<[string, string[]]> {
	if (platform === "darwin") return [["pbcopy", []]];
	if (platform === "win32") return [["clip", []]];
	if (platform === "linux") {
		return [
			["wl-copy", []],
			["xclip", ["-selection", "clipboard"]],
		];
	}
	return [];
}

function spawnRunner(command: string, args: string[], text: string): ClipboardResult {
	const result = spawnSync(command, args, { input: text });
	if (result.error) return { ok: false, error: result.error.message };
	if (result.status !== 0) return { ok: false, error: `退出码 ${result.status ?? "unknown"}` };
	return { ok: true };
}

/** Copy `text`, or throw naming every command that failed. */
export function copyToClipboard(text: string, run: ClipboardRunner = spawnRunner): void {
	const candidates = clipboardCandidates();
	if (candidates.length === 0) {
		throw new Error(`pi-mesh: 当前平台 ${process.platform} 没有已知的剪贴板命令`);
	}
	const failures: string[] = [];
	for (const [command, args] of candidates) {
		const result = run(command, args, text);
		if (result.ok) return;
		failures.push(`${command}: ${result.error ?? "失败"}`);
	}
	throw new Error(`pi-mesh: 复制到剪贴板失败（${failures.join("；")}）`);
}
