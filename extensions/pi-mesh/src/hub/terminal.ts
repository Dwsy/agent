/**
 * WebSocket terminal bridge: browser (WTerm/ghostty) <-> `herdr terminal
 * session control|observe <target>`.
 *
 * The herdr wire protocol is JSONL both ways (discovered empirically):
 *   -> herdr : {"type":"terminal.input","bytes":"<base64>"}
 *              {"type":"terminal.resize","cols":N,"rows":N}
 *              {"type":"terminal.scroll",...} {"type":"terminal.release",...}
 *   <- herdr : {"bytes":"<base64>"} ...   then {"type":"terminal.closed",...}
 * The bridge forwards JSONL verbatim in both directions — the browser-side
 * adapter speaks the same envelope, so no translation layer is needed.
 *
 * Security note: control mode grants interactive access to a herdr pane. The
 * hub binds to 127.0.0.1 only; same trust model as resume/focus.
 */
import type http from "node:http";
import type net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

export type TerminalMode = "control" | "observe";

export interface TerminalAttachOptions {
	/** Test seam: how to launch the herdr terminal session child. */
	spawnChild?: (argv: string[]) => ChildProcess;
	herdrBin?: string;
}

const INPUT_TYPES = new Set(["terminal.input", "terminal.resize", "terminal.scroll", "terminal.release"]);
const TARGET_RE = /^[A-Za-z0-9:_-]{1,64}$/;

export interface TerminalQuery {
	target: string;
	mode: TerminalMode;
	cols: number;
	rows: number;
	owner?: string;
	attachId?: string;
}

/** Strict query validation — fail fast at the boundary. */
export function parseTerminalQuery(url: URL): TerminalQuery | { error: string } {
	const target = url.searchParams.get("target") ?? "";
	if (!TARGET_RE.test(target)) return { error: "invalid target" };
	const mode = url.searchParams.get("mode") ?? "control";
	if (mode !== "control" && mode !== "observe") return { error: "invalid mode" };
	const cols = Number(url.searchParams.get("cols") ?? 80);
	const rows = Number(url.searchParams.get("rows") ?? 24);
	if (!Number.isInteger(cols) || cols < 20 || cols > 400) return { error: "invalid cols" };
	if (!Number.isInteger(rows) || rows < 5 || rows > 200) return { error: "invalid rows" };
	const owner = url.searchParams.get("owner");
	const attachId = url.searchParams.get("attachId");
	const OWNER_RE = /^[A-Za-z0-9:_-]{1,128}$/;
	if (owner !== null && !OWNER_RE.test(owner)) return { error: "invalid owner" };
	if (attachId !== null && !OWNER_RE.test(attachId)) return { error: "invalid attachId" };
	return { target, mode, cols, rows, ...(owner === null ? {} : { owner }), ...(attachId === null ? {} : { attachId }) };
}

/** Validate one client -> herdr JSONL command; returns the line or null. */
export function sanitizeClientLine(raw: string): string | null {
	let msg: { type?: unknown; bytes?: unknown; cols?: unknown; rows?: unknown };
	try {
		msg = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof msg.type !== "string" || !INPUT_TYPES.has(msg.type)) return null;
	if (msg.type === "terminal.input" && typeof msg.bytes !== "string") return null;
	if (msg.type === "terminal.resize") {
		if (!Number.isInteger(msg.cols) || !Number.isInteger(msg.rows)) return null;
	}
	return raw;
}

export function attachTerminalWs(server: http.Server, opts: TerminalAttachOptions = {}): () => void {
	const herdrBin = opts.herdrBin ?? "herdr";
	const spawnChild =
		opts.spawnChild ??
		((argv: string[]) => spawn(herdrBin, argv, { stdio: ["pipe", "pipe", "ignore"] }));

	const wss = new WebSocketServer({ noServer: true });
	const children = new Set<ChildProcess>();
	// One active owner per Herdr mode:target. A second window is a CONFLICT,
	// not proof the first child is stale. Only a CLOSED socket may be reaped.
	const attachByTarget = new Map<string, { child: ChildProcess; ws: WebSocket; owner: string; attachId: string }>();

	const onUpgrade = (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		if (url.pathname !== "/api/terminal") {
			socket.destroy();
			return;
		}
		const query = parseTerminalQuery(url);
		if ("error" in query) {
			socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => startSession(ws, query));
	};

	const startSession = (ws: WebSocket, query: TerminalQuery) => {
		const attachKey = `${query.mode}:${query.target}`;
		const previous = attachByTarget.get(attachKey);
		if (previous && previous.ws.readyState !== WebSocket.CLOSED) {
			ws.send(JSON.stringify({ type: "terminal.error", reason: "already attached", owner: previous.owner, attachId: previous.attachId }));
			ws.close(4409, "already attached");
			return;
		}
		if (previous) {
			try {
				previous.child.kill();
			} catch {}
			children.delete(previous.child);
			attachByTarget.delete(attachKey);
		}
		const child = spawnChild([
			"terminal",
			"session",
			query.mode,
			query.target,
			"--cols",
			String(query.cols),
			"--rows",
			String(query.rows),
		]);
		children.add(child);
		const binding = { child, ws, owner: query.owner ?? "legacy", attachId: query.attachId ?? randomUUID() };
		attachByTarget.set(attachKey, binding);

		let buf = "";
		child.stdout?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			buf += chunk;
			let nl: number;
			while ((nl = buf.indexOf("\n")) >= 0) {
				const line = buf.slice(0, nl).trim();
				buf = buf.slice(nl + 1);
				if (line) ws.send(line); // verbatim herdr JSONL frame
			}
		});

		ws.on("message", (data) => {
			const line = sanitizeClientLine(data.toString());
			if (line === null || query.mode === "observe") return; // observe is read-only
			child.stdin?.write(`${line}\n`);
		});

		let finished = false;
		const finish = (reason: string) => {
			if (finished) return;
			finished = true;
			children.delete(child);
			if (attachByTarget.get(attachKey) === binding) attachByTarget.delete(attachKey);
			try {
				child.stdin?.end(); // clean herdr detach
			} catch {}
			try {
				ws.send(JSON.stringify({ type: "terminal.closed", reason }));
			} catch {}
			try {
				ws.close();
			} catch {}
		};
		child.on("exit", (code) => finish(`herdr exited (${code ?? "signal"})`));
		child.on("error", (err) => finish(`herdr error: ${err.message}`));
		ws.on("close", () => {
			try {
				child.stdin?.end();
			} catch {}
			// Keep identity until exit or force-reap. A late close from this
			// owner must never clear a newer bridge attached to the same pane.
			const t = setTimeout(() => {
				if (!finished) {
					try { child.kill(); } catch {}
					children.delete(child);
					if (attachByTarget.get(attachKey) === binding) attachByTarget.delete(attachKey);
				}
			}, 2_000);
			t.unref?.();
		});
	};

	server.on("upgrade", onUpgrade);
	return () => {
		server.off("upgrade", onUpgrade);
		for (const child of children) child.kill();
		children.clear();
		attachByTarget.clear();
		wss.close();
	};
}
