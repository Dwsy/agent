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
import { WebSocketServer, type WebSocket } from "ws";

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
	return { target, mode, cols, rows };
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
	// Orphan guard: a hard-killed browser can leave its ws half-open so the child
	// is never reaped and herdr keeps the pane attach ("already has an attached
	// client"). A new attach for the same mode+target reaps the stale one.
	const attachByTarget = new Map<string, ChildProcess>();

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
		const stale = attachByTarget.get(attachKey);
		if (stale) {
			try {
				stale.kill();
			} catch {}
			children.delete(stale);
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
		attachByTarget.set(attachKey, child);

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

		const finish = (reason: string) => {
			children.delete(child);
			if (attachByTarget.get(attachKey) === child) attachByTarget.delete(attachKey);
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
			children.delete(child);
			if (attachByTarget.get(attachKey) === child) attachByTarget.delete(attachKey);
			try {
				child.stdin?.end();
			} catch {}
			// herdr detaches on stdin EOF; kill only if it lingers.
			const t = setTimeout(() => child.kill(), 2_000);
			t.unref?.();
		});
	};

	server.on("upgrade", onUpgrade);
	return () => {
		server.off("upgrade", onUpgrade);
		for (const child of children) child.kill();
		children.clear();
		wss.close();
	};
}
