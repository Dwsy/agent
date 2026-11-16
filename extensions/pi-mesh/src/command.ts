/**
 * `/mesh` slash command: opens the interactive pi-mesh overlay panel.
 *
 * Pattern follows pi-tui-kit's demo-simple.ts: ctx.ui.custom overlay hosting a
 * hand-rendered Component. The panel is ambient state and never enters the
 * model context (zero-tool constraint stays intact).
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import os from "node:os";
import { meshPaths, type HubRequest, type PeerView, type TranscriptEntry } from "./protocol.ts";
import { MeshClient, nextId } from "./client.ts";
import { loadConfig } from "./config.ts";
import { copyToClipboard, formatMeshStatus } from "./status.ts";
import { MeshPanel } from "./mesh-panel.ts";
import { resumePeer } from "./resume.ts";
import { openWebUi } from "./webui.ts";

function unwrap<T>(data: unknown, key: string): T[] {
	if (Array.isArray(data)) return data as T[];
	if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)[key])) {
		return (data as Record<string, T[]>)[key];
	}
	return [];
}

async function withHub<T>(fn: (client: MeshClient) => Promise<T>): Promise<T> {
	const client = new MeshClient({ socketPath: meshPaths(os.homedir()).socketPath });
	try {
		await client.connect();
		return await fn(client);
	} finally {
		client.close();
	}
}

async function fetchPeers(): Promise<PeerView[]> {
	return withHub(async (client) => {
		const req: HubRequest = { id: nextId(), type: "query_peers" };
		const res = await client.request(req);
		if (!res.ok) throw new Error(res.error ?? "hub error");
		return unwrap<PeerView>(res.data, "peers");
	});
}

async function fetchTranscript(sessionId: string, limit: number): Promise<TranscriptEntry[]> {
	return withHub(async (client) => {
		const req: HubRequest = { id: nextId(), type: "query_transcript", sessionId, limit };
		const res = await client.request(req);
		if (!res.ok) throw new Error(res.error ?? "hub error");
		return unwrap<TranscriptEntry>(res.data, "entries");
	});
}

function currentSessionId(ctx: ExtensionCommandContext): string | null {
	try {
		return ctx.sessionManager?.getSessionId?.() ?? null;
	} catch {
		return null;
	}
}

function errorText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * `/mesh-status` and `/mesh status`: one report, printed as-is. `copy` hands
 * the same text to the clipboard and keeps the toast to a single line — the
 * report itself is what the user pastes, not what they read in the status bar.
 */
async function runMeshStatus(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const mode = args.trim();
	if (mode && mode !== "copy") {
		ctx.ui.notify(`未知参数 “${mode}”；用法：/mesh-status [copy]`, "warning");
		return;
	}
	const home = os.homedir();
	let httpPort: number;
	try {
		httpPort = loadConfig(home).httpPort;
	} catch (err) {
		ctx.ui.notify(errorText(err), "error");
		return;
	}
	let peers: PeerView[] = [];
	let hubError: string | null = null;
	try {
		peers = await fetchPeers();
	} catch (err) {
		hubError = errorText(err);
	}
	const report = formatMeshStatus({
		peers,
		selfSessionId: currentSessionId(ctx),
		socketPath: meshPaths(home).socketPath,
		httpPort,
		hubError,
		now: Date.now(),
	});
	if (mode === "copy") {
		try {
			copyToClipboard(report);
			ctx.ui.notify(`pi-mesh 状态已复制到剪贴板（${report.split("\n").length} 行）`);
		} catch (err) {
			// The report is still the useful part: show it so the copy failure
			// does not also cost the user the information.
			ctx.ui.notify(`${errorText(err)}\n${report}`, "error");
		}
		return;
	}
	ctx.ui.notify(report, hubError ? "warning" : "info");
}

/** Follow edges run self -> target; the hub request carries the acting session. */
function setFollow(selfSessionId: string) {
	return async (targetSessionId: string, following: boolean): Promise<void> => {
		await withHub(async (client) => {
			const req: HubRequest = {
				id: nextId(),
				type: following ? "follow" : "unfollow",
				sessionId: selfSessionId,
				targetSessionId,
			};
			const res = await client.request(req);
			if (!res.ok) throw new Error(res.error ?? "hub error");
		});
	};
}

export function registerMeshCommand(pi: ExtensionAPI): void {
	pi.registerCommand("mesh", {
		description: "打开 pi-mesh 面板：查看/关注/互发/历史（/mesh web 打开 WebUI）",
		// pi-tui matches on `value`; an item without it crashes the editor autocomplete.
		getArgumentCompletions: (prefix) =>
			["status", "web"].filter((s) => s.startsWith(prefix.trim())).map((s) => ({ value: s, label: s })),
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const trimmed = args.trim();
			if (trimmed === "status" || trimmed.startsWith("status ")) {
				// Same report as `/mesh-status`; the completion below has always advertised it.
				await runMeshStatus(trimmed.slice("status".length).trim(), ctx);
				return;
			}
			if (trimmed === "web") {
				// One open path shared with the CLI; the command must not grow its own.
				const result = await openWebUi({ home: os.homedir() });
				if (result.ok) ctx.ui.notify(result.message);
				else ctx.ui.notify(result.message, "warning");
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify("pi-mesh 面板需要交互式 TUI（请在会话中使用 /mesh）", "warning");
				return;
			}
			// Loaded lazily: standalone unit tests import this module without pi-tui
			// on their resolution path, while a running Pi session resolves it.
			const { Key, matchesKey } = await import("@earendil-works/pi-tui");
			const selfSessionId = currentSessionId(ctx);
			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				const panel = new MeshPanel({
					keys: {
						up: (data) => matchesKey(data, Key.up),
						down: (data) => matchesKey(data, Key.down),
						pageUp: (data) => matchesKey(data, Key.pageUp),
						pageDown: (data) => matchesKey(data, Key.pageDown),
						right: (data) => matchesKey(data, Key.right),
						left: (data) => matchesKey(data, Key.left),
					},
					fetchPeers,
					fetchTranscript,
					setFollow: selfSessionId ? setFollow(selfSessionId) : async () => {
						throw new Error("当前会话 id 未知");
					},
					resume: (peer) =>
						resumePeer(peer, {
							owner: selfSessionId ?? `tui-${process.pid}`,
							noFocus: true,
						}).then((out) => ({ ok: out.ok, message: out.message })),
					selfSessionId,
					now: () => Date.now(),
					theme,
					requestRender: () => tui.requestRender(),
					onClose: () => done(undefined),
					// The panel renders into the overlay, so its body height must follow the
					// real terminal instead of a hard-coded 32 rows.
					viewport: () => ({ width: tui.terminal.columns, height: tui.terminal.rows }),
				});
				return {
					render: (width: number) => panel.render(width),
					handleInput: (data: string) => panel.handleInput(data),
					handleMouse: (event: TuiMouseEvent) => panel.handleMouse(event),
					invalidate: () => panel.invalidate(),
				};
			}, {
				overlay: true,
				overlayOptions: {
					width: "92%",
					maxHeight: "88%",
					anchor: "center",
					margin: 1,
				},
			});
		},
	});
}

export function registerMeshStatusCommand(pi: ExtensionAPI): void {
	pi.registerCommand("mesh-status", {
		description: "查看 pi-mesh 状态汇总（hub、peer 计数、在线会话）；/mesh-status copy 直接复制到剪贴板",
		getArgumentCompletions: (prefix) =>
			["copy"].filter((s) => s.startsWith(prefix.trim())).map((s) => ({ value: s, label: s })),
		handler: runMeshStatus,
	});
}
