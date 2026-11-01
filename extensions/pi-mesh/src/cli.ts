#!/usr/bin/env bun
/**
 * `mesh` CLI — inspect and drive peer pi sessions through the hub socket.
 *
 *   bun src/cli.ts peers [--all] [--table]
 *   bun src/cli.ts files <sessionIdPrefix> [--table]
 *   bun src/cli.ts history <sessionIdPrefix> [--limit N] [--table]
 *   bun src/cli.ts send <sessionIdPrefix> --mode steer|followUp <text...>
 *   bun src/cli.ts cancel <sessionIdPrefix>
 *   bun src/cli.ts follow <sessionIdPrefix> [--from <sessionId>]
 *   bun src/cli.ts unfollow <sessionIdPrefix> [--from <sessionId>]
 *   bun src/cli.ts resume <sessionIdPrefix> [--fork] [--print] [--name <slug>]
 *   bun src/cli.ts web [--no-open]
 *
 * Output is JSON by default (pipe into jq); pass --table for human-readable rows.
 * --json is still accepted as a no-op alias for backwards compatibility.
 *
 * Session ids may be any unique prefix; ambiguous prefixes list their candidates.
 * Follow edges belong to a session: the acting session is $PI_SESSION_ID
 * (set by pi's bash tool) or --from. Sending a message auto-follows the target.
 */
import os from "node:os";
import type { HubRequest, HubResponse, PeerView, TranscriptEntry } from "./protocol.ts";
import { meshPaths } from "./protocol.ts";
import { MeshClient, nextId } from "./client.ts";
import { resumePeer } from "./resume.ts";
import { openWebUi, type WebUiResult } from "./webui.ts";

/** Usage / lookup failures: printed as-is, unlike transport failures. */
class CliError extends Error {}

interface ParsedArgs {
	positional: string[];
	table: boolean;
	limit: number | undefined;
	mode: string | undefined;
	from: string | undefined;
	all: boolean;
	fork: boolean;
	print: boolean;
	name: string | undefined;
	repo: string | undefined;
	noOpen: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
	const positional: string[] = [];
	const parsed: ParsedArgs = {
		positional,
		table: false,
		limit: undefined,
		mode: undefined,
		from: undefined,
		all: false,
		fork: false,
		print: false,
		name: undefined,
		repo: undefined,
		noOpen: false,
	};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		// --table opts into the human-readable view; --json is a legacy no-op (JSON is the default).
		if (arg === "--table") parsed.table = true;
		else if (arg === "--json") continue;
		else if (arg === "--all") parsed.all = true;
		else if (arg === "--fork") parsed.fork = true;
		else if (arg === "--print") parsed.print = true;
		else if (arg === "--no-open") parsed.noOpen = true;
		else if (arg === "--name") parsed.name = args[++i];
		else if (arg === "--repo") parsed.repo = args[++i];
		else if (arg === "--limit") parsed.limit = Number(args[++i]);
		else if (arg === "--mode") parsed.mode = args[++i];
		else if (arg === "--from") parsed.from = args[++i];
		else positional.push(arg);
	}
	return parsed;
}

function usage(): void {
	console.error(`usage: mesh <command>

  peers [--all] [--table]                   list peer pi sessions (default: running only)
  files <sessionIdPrefix> [--table]         recent file activity of a peer
  history <sessionIdPrefix> [--limit N] [--table]
  web [--no-open]                           打开 WebUI（必要时先拉起 hub）

  Output is JSON by default; --table renders aligned columns for humans.

  send <sessionIdPrefix> --mode steer|followUp <text...>
  cancel <sessionIdPrefix>                  abort a peer's current run
  resume <sessionIdPrefix> [--fork] [--print] [--name <slug>]
  resume --repo <repoRoot> [--fork] [--print]
                                            reopen in a dedicated herdr workspace;
                                            --repo batch-resumes stale peers of a repo
  follow <sessionIdPrefix> [--from <sessionId>]
  unfollow <sessionIdPrefix> [--from <sessionId>]
                                            detach state-change notifications`);
}

async function call(client: MeshClient, req: HubRequest): Promise<HubResponse> {
	const res = await client.request(req);
	if (!res.ok) throw new CliError(res.error ?? "hub error");
	return res;
}

/**
 * Contract gap: protocol.ts does not pin query response shapes inside
 * HubResponse.data; accept both a bare array and `{ <key>: [...] }`.
 */
function extractList<T>(data: unknown, key: string): T[] {
	if (Array.isArray(data)) return data as T[];
	if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)[key])) {
		return (data as Record<string, T[]>)[key];
	}
	return [];
}

async function queryPeers(client: MeshClient): Promise<PeerView[]> {
	const res = await call(client, { id: nextId(), type: "query_peers" });
	return extractList<PeerView>(res.data, "peers");
}

function resolvePeer(peers: PeerView[], prefix: string | undefined): PeerView {
	if (!prefix) throw new CliError("missing <sessionIdPrefix>");
	const matches = peers.filter((p) => p.sessionId.startsWith(prefix));
	if (matches.length === 0) throw new CliError(`no peer matches "${prefix}"`);
	if (matches.length > 1) {
		throw new CliError(`ambiguous prefix "${prefix}":\n${matches.map((m) => `  ${m.sessionId}`).join("\n")}`);
	}
	return matches[0];
}

function shortTs(iso: string): string {
	if (!iso) return "-";
	const t = iso.indexOf("T");
	if (t < 0) return iso.length > 16 ? iso.slice(0, 16) : iso;
	const datePart = iso.slice(0, t); // YYYY-MM-DD
	const timePart = iso.slice(t + 1, t + 9); // HH:MM:SS
	// Check if same day as today (local date)
	try {
		const today = new Date();
		const y = today.getFullYear();
		const m = String(today.getMonth() + 1).padStart(2, "0");
		const d = String(today.getDate()).padStart(2, "0");
		const todayStr = `${y}-${m}-${d}`;
		if (datePart === todayStr) {
			return timePart;
		}
		// Different day: show MM-DD HH:MM or YYYY-MM-DD HH:MM
		// Use short form MM-DD HH:MM to save tokens
		return `${datePart.slice(5)} ${timePart.slice(0, 5)}`;
	} catch {
		return iso.length > 16 ? iso.slice(0, 16) : iso;
	}
}

function truncate(text: string, max: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function age(iso: string): string {
	const ms = Date.now() - Date.parse(iso);
	if (!Number.isFinite(ms)) return "-";
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.round(s / 60)}m`;
	if (s < 86400) return `${Math.round(s / 3600)}h`;
	return `${Math.round(s / 86400)}d`;
}

function printTable(rows: string[][]): void {
	const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => row[col].length)));
	for (const row of rows) {
		console.log(row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd());
	}
}

// ── commands ─────────────────────────────────────────────────────────────

async function cmdPeers(client: MeshClient, args: string[]): Promise<void> {
	const { table, all } = parseArgs(args);
	const peers = await queryPeers(client);
	const visible = all ? peers : peers.filter((p) => p.state === "running");
	if (!table) {
		console.log(JSON.stringify(visible, null, 2));
		return;
	}
	const rows = [
		["SESSION", "STATE", "PID", "BRANCH", "WT", "CWD", "TITLE", "HEARTBEAT", "FILES"],
		...visible.map((p) => [
			p.sessionId.slice(-8),
			p.state,
			String(p.pid),
			p.git?.branch ?? "-",
			p.git?.worktree ?? "-",
			truncate(p.cwd, 40),
			truncate(p.title ?? "-", 24),
			age(p.lastHeartbeat),
			String(p.files?.length ?? 0),
		]),
	];
	printTable(rows);
}

async function cmdFiles(client: MeshClient, args: string[]): Promise<void> {
	const { positional, table } = parseArgs(args);
	const peer = resolvePeer(await queryPeers(client), positional[0]);
	const files = peer.files ?? [];
	if (!table) {
		console.log(JSON.stringify(files, null, 2));
		return;
	}
	for (const f of files) {
		console.log(`${shortTs(f.ts)}  ${f.op.padEnd(5)}  ${f.path}`);
	}
}

async function cmdHistory(client: MeshClient, args: string[]): Promise<void> {
	const { positional, table, limit } = parseArgs(args);
	const peer = resolvePeer(await queryPeers(client), positional[0]);
	const req: HubRequest = {
		id: nextId(),
		type: "query_transcript",
		sessionId: peer.sessionId,
		...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
	};
	const entries = extractList<TranscriptEntry>((await call(client, req)).data, "entries");
	if (!table) {
		console.log(JSON.stringify(entries, null, 2));
		return;
	}
	for (const e of entries) {
		const tool = e.toolName ? ` (${e.toolName})` : "";
		const err = e.isError ? " [error]" : "";
		console.log(`${shortTs(e.timestamp)}  ${e.role}${tool}${err}  ${truncate(e.text, 120)}`);
	}
}

async function cmdSend(client: MeshClient, args: string[]): Promise<void> {
	const { positional, mode, from } = parseArgs(args);
	const text = positional.slice(1).join(" ");
	if (mode !== "steer" && mode !== "followUp") throw new CliError("--mode must be steer or followUp");
	if (!text) throw new CliError("missing message text");
	const target = resolvePeer(await queryPeers(client), positional[0]);
	const res = await call(client, {
		id: nextId(),
		type: "send_message",
		targetSessionId: target.sessionId,
		text,
		mode,
		// Auto-follow rides on the sender identity when known (PI_SESSION_ID / --from).
		...(from ?? process.env.PI_SESSION_ID
			? { fromSessionId: (from ?? process.env.PI_SESSION_ID) as string }
			: {}),
	});
	// Contract gap: disposition may arrive as data.disposition or a bare string.
	const data = res.data as { disposition?: string } | undefined;
	const disposition = typeof res.data === "string" ? res.data : data?.disposition ?? "sent";
	console.log(
		JSON.stringify({ ok: true, targetSessionId: target.sessionId, mode, disposition }, null, 2),
	);
}

async function cmdCancel(client: MeshClient, args: string[]): Promise<void> {
	const target = resolvePeer(await queryPeers(client), parseArgs(args).positional[0]);
	await call(client, { id: nextId(), type: "cancel", targetSessionId: target.sessionId });
	console.log(JSON.stringify({ ok: true, targetSessionId: target.sessionId, cancelled: true }, null, 2));
}

async function cmdResume(client: MeshClient, args: string[]): Promise<void> {
	const { positional, fork, print, name, repo } = parseArgs(args);
	const owner = process.env.PI_SESSION_ID ?? `cli-${process.pid}`;
	if (repo) {
		// Batch mode: every offline/closed peer of the repo, sequential (lease-safe).
		const peers = (await queryPeers(client)).filter(
			(p) => p.git?.repoRoot === repo && (p.state === "offline" || p.state === "closed"),
		);
		if (peers.length === 0) {
			console.log(`没有可恢复的会话: ${repo}`);
			return;
		}
		let failed = 0;
		for (const peer of peers) {
			const out = await resumePeer(peer, { fork, print, name, owner });
			console.log(`${peer.sessionId.slice(0, 8)}  ${out.message}`);
			if (!out.ok) failed++;
		}
		if (failed > 0) process.exitCode = 1;
		return;
	}
	const target = resolvePeer(await queryPeers(client), positional[0]);
	const out = await resumePeer(target, {
		fork,
		print,
		name,
		owner,
	});
	console.log(out.message);
	if (!out.ok && out.plan) console.error(out.plan.join("\n"));
	if (!out.ok) process.exitCode = 1;
}

/** Follow edges live on the acting session: PI_SESSION_ID or --from. */
function actingSessionId(from: string | undefined): string {
	const id = from ?? process.env.PI_SESSION_ID;
	if (!id) throw new CliError("no acting session: run inside a pi bash tool or pass --from <sessionId>");
	return id;
}

async function cmdFollow(client: MeshClient, args: string[], following: boolean): Promise<void> {
	const { positional, from } = parseArgs(args);
	const self = actingSessionId(from);
	const target = resolvePeer(await queryPeers(client), positional[0]);
	if (target.sessionId === self) throw new CliError("a session cannot follow itself");
	await call(client, {
		id: nextId(),
		type: following ? "follow" : "unfollow",
		sessionId: self,
		targetSessionId: target.sessionId,
	});
	console.log(
		JSON.stringify({ ok: true, targetSessionId: target.sessionId, following }, null, 2),
	);
}

async function cmdWeb(args: string[]): Promise<void> {
	const { positional, table, noOpen } = parseArgs(args);
	if (positional.length > 0) throw new CliError(`unexpected argument "${positional[0]}"`);
	let result: WebUiResult;
	try {
		result = await openWebUi({ home: os.homedir(), noOpen });
	} catch (err) {
		// Invalid config must read as a config error, not as the generic hub fallback.
		throw new CliError(err instanceof Error ? err.message : String(err));
	}
	console.log(table ? result.message : JSON.stringify(result, null, 2));
	if (!result.ok) process.exitCode = 1;
}

// ── entry ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const [cmd, ...rest] = process.argv.slice(2);
	// `web` bootstraps the hub itself, so it must run before any hub connection
	// exists — connecting first would fail with "hub not running" on a cold start.
	if (cmd === "web") {
		try {
			await cmdWeb(rest);
		} catch (err) {
			console.error(err instanceof Error ? err.message : String(err));
			process.exitCode = 1;
		}
		return;
	}
	const client = new MeshClient({ socketPath: meshPaths(os.homedir()).socketPath });
	try {
		await client.connect();
	} catch {
		console.error("hub not running");
		process.exitCode = 1;
		return;
	}
	try {
		switch (cmd) {
			case "peers":
				await cmdPeers(client, rest);
				break;
			case "files":
				await cmdFiles(client, rest);
				break;
			case "history":
				await cmdHistory(client, rest);
				break;
			case "send":
				await cmdSend(client, rest);
				break;
			case "cancel":
				await cmdCancel(client, rest);
				break;
			case "resume":
				await cmdResume(client, rest);
				break;
			case "follow":
				await cmdFollow(client, rest, true);
				break;
			case "unfollow":
				await cmdFollow(client, rest, false);
				break;
			default:
				usage();
				process.exitCode = 1;
		}
	} catch (err) {
		if (err instanceof CliError) console.error(err.message);
		else console.error("hub not running"); // transport failure
		process.exitCode = 1;
	} finally {
		client.close();
	}
}

// Only run as a program (`bun src/cli.ts …`); keep import side-effect free.
if (import.meta.main) {
	void main();
}
