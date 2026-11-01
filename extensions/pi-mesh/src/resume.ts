/**
 * mesh resume — resurrect an offline/closed pi session inside its own herdr
 * workspace. The mesh CLI is the orchestrator: it is shell-reachable and can
 * exec `herdr` + `pi` without needing a running pi (the extension cannot
 * launch the pi it would live in; the hub stays a passive registry).
 *
 * Safety rails (from design review):
 *  - hub CAS lease (`claim_resume`) is the double-resume mutex; ALREADY_LIVE
 *    sessions are never re-launched concurrently on one session JSONL.
 *  - preflight (herdr on PATH, session file + cwd exist) happens BEFORE the
 *    claim/mutations; `--print` shows the commands without touching anything.
 *  - deterministic workspace label `pi-<tail8>` is reused when it exists.
 *  - transcript content is never echoed anywhere in this flow.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { HubRequest, PeerView } from "./protocol.ts";
import { meshPaths } from "./protocol.ts";
import os from "node:os";
import { MeshClient, nextId } from "./client.ts";

const execFileP = promisify(execFile);

export interface ResumeOptions {
	/** Fork instead of appending to the same session file. */
	fork?: boolean;
	/** Print the plan instead of executing it (no hub claim, no herdr calls). */
	print?: boolean;
	/** Workspace/agent name suffix override (default: session tail8). */
	name?: string;
	/** Force no-focus even for human invocations. */
	noFocus?: boolean;
	/** Lease owner id (the requesting sessionId when known). */
	owner?: string;
}

export interface ResumeOutcome {
	ok: boolean;
	message: string;
	workspaceId?: string;
	paneId?: string;
	/** The shell commands that were (or would be) run, for --print and errors. */
	plan?: string[];
}

/** Thin herdr seam so the orchestration is testable without a herdr server. */
export interface HerdrApi {
	listWorkspaces(): Promise<{ workspaceId: string; label: string }[]>;
	panesOf(workspaceId: string): Promise<string[]>;
	createWorkspace(opts: { cwd: string; label: string; noFocus: boolean }): Promise<{ workspaceId: string; rootPaneId: string }>;
	startAgent(opts: { name: string; paneId: string; args: string[] }): Promise<void>;
	/** Bring the herdr TUI to the workspace (one-click enter from the WebUI). */
	focusWorkspace(workspaceId: string): Promise<void>;
	/** Live herdr agents with their session paths (mesh peer ↔ herdr join key). */
	listAgents(): Promise<{ paneId: string; workspaceId: string; sessionPath: string | null; status: string }[]>;
	/** Focus a specific agent pane (fallback when no resume link exists). */
	focusAgent(paneId: string): Promise<void>;
}

function unwrapResult(json: unknown): Record<string, unknown> {
	const obj = json as { result?: Record<string, unknown> };
	return obj?.result ?? {};
}

async function herdrJson(argv: string[]): Promise<Record<string, unknown>> {
	const { stdout } = await execFileP("herdr", argv, { encoding: "utf8" });
	return unwrapResult(JSON.parse(stdout));
}

export const realHerdr: HerdrApi = {
	async listWorkspaces() {
		const result = await herdrJson(["workspace", "list"]);
		const list = (result.workspaces as { workspace_id: string; label: string }[] | undefined) ?? [];
		return list.map((w) => ({ workspaceId: w.workspace_id, label: w.label }));
	},
	async panesOf(workspaceId) {
		const result = await herdrJson(["pane", "list", "--workspace", workspaceId]);
		const list = (result.panes as { pane_id: string }[] | undefined) ?? [];
		return list.map((p) => p.pane_id);
	},
	async createWorkspace(opts) {
		const result = await herdrJson([
			"workspace",
			"create",
			"--cwd",
			opts.cwd,
			"--label",
			opts.label,
			opts.noFocus ? "--no-focus" : "--focus",
		]);
		const ws = result.workspace as { workspace_id: string } | undefined;
		const pane = result.root_pane as { pane_id: string } | undefined;
		if (!ws?.workspace_id || !pane?.pane_id) throw new Error("herdr: unexpected workspace create response");
		return { workspaceId: ws.workspace_id, rootPaneId: pane.pane_id };
	},
	async startAgent(opts) {
		await herdrJson(["agent", "start", opts.name, "--kind", "pi", "--pane", opts.paneId, "--", ...opts.args]);
	},
	async focusWorkspace(workspaceId) {
		await herdrJson(["workspace", "focus", workspaceId]);
	},
	async listAgents() {
		const result = await herdrJson(["agent", "list"]);
		const list =
			(result.agents as {
				pane_id: string;
				workspace_id: string;
				agent_status: string;
				agent_session?: { value?: string };
			}[] | undefined) ?? [];
		return list.map((a) => ({
			paneId: a.pane_id,
			workspaceId: a.workspace_id,
			sessionPath: a.agent_session?.value ?? null,
			status: a.agent_status,
		}));
	},
	async focusAgent(paneId) {
		await herdrJson(["agent", "focus", paneId]);
	},
};

/** Pure plan description — unit-tested; the runner turns it into herdr calls. */
export function buildResumePlan(peer: PeerView, opts: ResumeOptions = {}) {
	const tail = peer.sessionId.slice(-8).toLowerCase().replace(/[^a-z0-9_-]/g, "0");
	const slug = (opts.name ?? tail).toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 24);
	const label = `pi-${slug}`;
	// herdr agent names: [a-z][a-z0-9_-]{0,31}
	const agentName = `pi-${slug}`.replace(/[^a-z0-9_-]/g, "-").slice(0, 32);
	const piArgs = opts.fork ? ["--fork", peer.sessionFile] : ["--session", peer.sessionFile];
	return { label, agentName, piArgs };
}

export function formatPlan(peer: PeerView, plan: { label: string; agentName: string; piArgs: string[] }): string[] {
	return [
		`herdr workspace create --cwd ${peer.cwd} --label ${plan.label} --no-focus   # reuse if label exists`,
		`herdr agent start ${plan.agentName} --kind pi --pane <root_pane> -- pi ${plan.piArgs.join(" ")}`,
	];
}

/** The hub gate, injected for tests: claim -> (launch) -> record. */
export interface ResumeGate {
	claim(peer: PeerView, owner: string): Promise<void>;
	record(peer: PeerView, owner: string, workspaceId?: string, paneId?: string): Promise<void>;
}

export function realGate(): ResumeGate {
	const withHub = async <T>(fn: (client: MeshClient) => Promise<T>): Promise<T> => {
		const client = new MeshClient({ socketPath: meshPaths(os.homedir()).socketPath });
		try {
			await client.connect();
			return await fn(client);
		} finally {
			client.close();
		}
	};
	return {
		async claim(peer, owner) {
			await withHub(async (client) => {
				const req: HubRequest = { id: nextId(), type: "claim_resume", sessionId: peer.sessionId, owner };
				const res = await client.request(req);
				if (!res.ok) throw new Error(res.error ?? "hub error");
			});
		},
		async record(peer, owner, workspaceId, paneId) {
			await withHub(async (client) => {
				const req: HubRequest = {
					id: nextId(),
					type: "record_resume",
					sessionId: peer.sessionId,
					owner,
					herdrWorkspaceId: workspaceId,
					herdrPaneId: paneId,
				};
				const res = await client.request(req);
				if (!res.ok) throw new Error(res.error ?? "hub error");
			});
		},
	};
}

/** How a mesh peer maps onto a herdr surface, if at all. */
export interface HerdrHost {
	workspaceId: string;
	paneId?: string;
	via: "resume-link" | "agent-match";
	/** The shell command that focuses this host (for one-click copy). */
	command: string;
}

/**
 * Resolution order: newest resume link (deterministic), then live agent whose
 * session path equals the peer's session file (directly-started herdr pis).
 */
export async function findHerdrHost(peer: PeerView, herdr: HerdrApi = realHerdr): Promise<HerdrHost | null> {
	const link = [...(peer.resumptions ?? [])].reverse().find((r) => r.herdrWorkspaceId);
	if (link?.herdrWorkspaceId) {
		return {
			workspaceId: link.herdrWorkspaceId,
			paneId: link.herdrPaneId,
			via: "resume-link",
			command: `herdr workspace focus ${link.herdrWorkspaceId}`,
		};
	}
	try {
		const agents = await herdr.listAgents();
		const hit = agents.find((a) => a.sessionPath && a.sessionPath === peer.sessionFile);
		if (hit) {
			return {
				workspaceId: hit.workspaceId,
				paneId: hit.paneId,
				via: "agent-match",
				command: `herdr agent focus ${hit.paneId}`,
			};
		}
	} catch {
		// herdr unreachable: treated as "not in herdr"
	}
	return null;
}

/** One-click "enter the herdr window" for a herdr-hosted peer (WebUI action). */
export async function focusPeerWorkspace(
	peer: PeerView,
	herdr: HerdrApi = realHerdr,
): Promise<ResumeOutcome> {
	const host = await findHerdrHost(peer, herdr);
	if (!host) {
		return { ok: false, message: "该会话不在 herdr 中（无 resume 关联，也未匹配到 herdr agent）" };
	}
	try {
		if (host.via === "resume-link") await herdr.focusWorkspace(host.workspaceId);
		else await herdr.focusAgent(host.paneId!);
		return { ok: true, message: `已聚焦 herdr ${host.via === "resume-link" ? "工作区" : "agent"} ${host.workspaceId}`, workspaceId: host.workspaceId };
	} catch (err) {
		return { ok: false, message: `聚焦失败: ${err instanceof Error ? err.message : String(err)}` };
	}
}

export interface NewSessionOptions {
	cwd?: string;
	label?: string;
	/** Default false: an explicit human launch may take focus. */
	noFocus?: boolean;
}

/**
 * Launch a FRESH pi conversation in its own herdr workspace (the WebUI
 * right-click action). No session file yet — the launched pi registers with
 * the mesh by itself through the extension heartbeat.
 */
export async function newSessionInHerdr(
	opts: NewSessionOptions = {},
	herdr: HerdrApi = realHerdr,
): Promise<ResumeOutcome> {
	if (opts.cwd !== undefined && !existsSync(opts.cwd)) {
		return { ok: false, message: `目录不存在: ${opts.cwd}` };
	}
	const target = opts.cwd ?? os.homedir();
	// Workspace label keeps the user's words (argv-array exec, no shell); the
	// herdr AGENT name must match ^[a-z][a-z0-9_-]{0,31}$ so it gets a short
	// ascii suffix independent of the label.
	const rawLabel = opts.label?.trim().slice(0, 40);
	const label = rawLabel ? `pi-${rawLabel}` : `pi-new-${Date.now().toString(36).slice(-6)}`;
	const agentName = `pi-${Date.now().toString(36).slice(-8)}`;
	const printed = [
		`herdr workspace create --cwd ${target} --label ${label} --no-focus   # reuse if label exists`,
		`herdr agent start ${agentName} --kind pi --pane <root_pane> -- pi --name ${label}`,
	];
	try {
		const noFocus = opts.noFocus ?? false;
		const existing = (await herdr.listWorkspaces()).find((w) => w.label === label);
		let workspaceId: string;
		let paneId: string;
		if (existing) {
			workspaceId = existing.workspaceId;
			const panes = await herdr.panesOf(existing.workspaceId);
			paneId = panes[0];
			if (!paneId) {
				return { ok: false, message: `工作区 ${label} (${workspaceId}) 没有可用 pane`, workspaceId, plan: printed };
			}
		} else {
			const created = await herdr.createWorkspace({ cwd: target, label, noFocus });
			workspaceId = created.workspaceId;
			paneId = created.rootPaneId;
		}
		await herdr.startAgent({ name: agentName, paneId, args: ["--name", label] });
		return {
			ok: true,
			message: `已新建对话 → herdr 工作区 ${label} (${workspaceId})`,
			workspaceId,
			paneId,
			plan: printed,
		};
	} catch (err) {
		return {
			ok: false,
			message: `herdr 启动失败: ${err instanceof Error ? err.message : String(err)}`,
			plan: printed,
		};
	}
}

export async function resumePeer(
	peer: PeerView,
	opts: ResumeOptions = {},
	herdr: HerdrApi = realHerdr,
	gate: ResumeGate = realGate(),
): Promise<ResumeOutcome> {
	const plan = buildResumePlan(peer, opts);
	const printed = formatPlan(peer, plan);

	// Preflight before ANY mutation (including the lease claim).
	if (!peer.sessionFile || !existsSync(peer.sessionFile)) {
		return { ok: false, message: `会话文件不存在: ${peer.sessionFile}`, plan: printed };
	}
	if (!existsSync(peer.cwd)) {
		return { ok: false, message: `会话目录已不存在: ${peer.cwd}（可用 --print 查看命令后手动调整 cwd）`, plan: printed };
	}
	if (opts.print) {
		return { ok: true, message: printed.join("\n"), plan: printed };
	}

	const owner = opts.owner ?? `cli-${process.pid}`;
	try {
		await gate.claim(peer, owner);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("already live")) {
			return { ok: false, message: `${peer.sessionId.slice(0, 8)} 仍在运行，未恢复（如需接管请先关闭原会话）`, plan: printed };
		}
		if (msg.includes("lease held")) {
			return { ok: false, message: `${peer.sessionId.slice(0, 8)} 正在被另一个 resume 持有（60s 内自动过期）`, plan: printed };
		}
		return { ok: false, message: `hub 拒绝恢复: ${msg}`, plan: printed };
	}

	try {
		const noFocus = opts.noFocus ?? Boolean(process.env.PI_SESSION_ID);
		const existing = (await herdr.listWorkspaces()).find((w) => w.label === plan.label);
		let workspaceId: string;
		let paneId: string;
		if (existing) {
			workspaceId = existing.workspaceId;
			const panes = await herdr.panesOf(existing.workspaceId);
			paneId = panes[0];
			if (!paneId) {
				return { ok: false, message: `工作区 ${plan.label} (${workspaceId}) 没有可用 pane`, workspaceId, plan: printed };
			}
		} else {
			const created = await herdr.createWorkspace({ cwd: peer.cwd, label: plan.label, noFocus });
			workspaceId = created.workspaceId;
			paneId = created.rootPaneId;
		}
		await herdr.startAgent({ name: plan.agentName, paneId, args: plan.piArgs });
		await gate.record(peer, owner, workspaceId, paneId).catch(() => {
			// Lineage is best-effort; the resumed pi's register() revives the record anyway.
		});
		const mode = opts.fork ? "fork" : "resume";
		return {
			ok: true,
			message: `已${mode} ${peer.sessionId.slice(0, 8)} → herdr 工作区 ${plan.label} (${workspaceId})`,
			workspaceId,
			paneId,
			plan: printed,
		};
	} catch (err) {
		return {
			ok: false,
			message: `herdr 启动失败: ${err instanceof Error ? err.message : String(err)}`,
			plan: printed,
		};
	}
}
