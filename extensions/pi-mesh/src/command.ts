/**
 * `/mesh` slash command: opens the interactive pi-mesh overlay panel.
 *
 * Pattern follows pi-tui-kit's demo-simple.ts: ctx.ui.custom overlay hosting a
 * hand-rendered Component. The panel is ambient state and never enters the
 * model context (zero-tool constraint stays intact).
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import os from "node:os";
import { meshPaths, type HubRequest, type PeerView, type TranscriptEntry } from "./protocol.ts";
import { MeshClient, nextId } from "./client.ts";
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
			if (args.trim() === "web") {
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
			const selfSessionId =
				(() => {
					try {
						return ctx.sessionManager?.getSessionId?.() ?? null;
					} catch {
						return null;
					}
				})();
			await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
				const panel = new MeshPanel({
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
					requestRender: () => tui.requestRender(),
					onClose: () => done(undefined),
					// The panel renders into the overlay, so its body height must follow the
					// real terminal instead of a hard-coded 32 rows.
					viewport: () => ({ width: tui.terminal.columns, height: tui.terminal.rows }),
				});
				return {
					render: (width: number) => panel.render(width),
					handleInput: (data: string) => panel.handleInput(data),
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
