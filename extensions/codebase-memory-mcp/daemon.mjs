#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";

const SERVER_NAME = "codebase-memory-mcp";
const SERVER_COMMAND = process.env.CODEBASE_MEMORY_MCP_COMMAND ?? "/Users/dengwenyu/.local/bin/codebase-memory-mcp";
const SERVER_ARGS = ["--ui=true", "--port=9749"];
const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = Number(process.env.CODEBASE_MEMORY_MCP_BRIDGE_PORT ?? "9750");
const REQUEST_TIMEOUT_MS = 120_000;
const IDLE_SHUTDOWN_MS = 30 * 60 * 1000;

let lastActivity = Date.now();

function resolveServerCommand() {
	if (existsSync(SERVER_COMMAND)) {
		return { command: SERVER_COMMAND, args: SERVER_ARGS, display: `${SERVER_COMMAND} ${SERVER_ARGS.join(" ")}` };
	}
	return { command: "uvx", args: [SERVER_NAME, ...SERVER_ARGS], display: `uvx ${SERVER_NAME} ${SERVER_ARGS.join(" ")}` };
}

class McpClient {
	child = undefined;
	ready = false;
	startPromise = undefined;
	nextId = 1;
	buffer = "";
	pending = new Map();
	stderrLines = [];

	async ensureStarted() {
		if (this.ready) return;
		if (this.startPromise) return this.startPromise;
		this.startPromise = this.start();
		try {
			await this.startPromise;
		} finally {
			this.startPromise = undefined;
		}
	}

	async start() {
		const resolved = resolveServerCommand();
		this.captureStderr(`[daemon] starting ${resolved.display}`);
		this.child = spawn(resolved.command, resolved.args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env },
		});

		this.child.stdout.setEncoding("utf8");
		this.child.stderr.setEncoding("utf8");
		this.child.stdout.on("data", (chunk) => this.handleStdout(chunk));
		this.child.stderr.on("data", (chunk) => this.captureStderr(chunk));
		this.child.on("error", (error) => this.rejectAll(error));
		this.child.on("exit", (code, signal) => {
			this.ready = false;
			this.child = undefined;
			this.rejectAll(new Error(`${SERVER_NAME} exited with code ${code ?? "null"}, signal ${signal ?? "null"}`));
		});

		await this.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "pi-codebase-memory-daemon", version: "1.0.0" },
		});
		this.notify("notifications/initialized", {});
		this.ready = true;
	}

	async listTools() {
		await this.ensureStarted();
		return this.request("tools/list", {});
	}

	async callTool(name, args) {
		await this.ensureStarted();
		return this.request("tools/call", { name, arguments: args });
	}

	stop() {
		this.ready = false;
		this.rejectAll(new Error(`${SERVER_NAME} stopped`));
		this.child?.stdin.end();
		this.child?.kill();
		this.child = undefined;
	}

	request(method, params) {
		if (!this.child) throw new Error(`${SERVER_NAME} process is not running`);

		const id = this.nextId++;
		const payload = { jsonrpc: "2.0", id, method, params };

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`${method} timed out after ${REQUEST_TIMEOUT_MS}ms${this.stderrSuffix()}`));
			}, REQUEST_TIMEOUT_MS);

			this.pending.set(id, { resolve, reject, timer });
			this.child.stdin.write(`${JSON.stringify(payload)}\n`);
		});
	}

	notify(method, params) {
		this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
	}

	handleStdout(chunk) {
		this.buffer += chunk;
		const lines = this.buffer.split("\n");
		this.buffer = lines.pop() ?? "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			let message;
			try {
				message = JSON.parse(trimmed);
			} catch {
				continue;
			}

			if (typeof message.id !== "number") continue;
			const pending = this.pending.get(message.id);
			if (!pending) continue;

			this.pending.delete(message.id);
			clearTimeout(pending.timer);

			if (message.error) {
				pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
			} else {
				pending.resolve(message.result);
			}
		}
	}

	captureStderr(chunk) {
		for (const line of String(chunk).split("\n")) {
			const trimmed = line.trim();
			if (trimmed) this.stderrLines.push(trimmed);
		}
		if (this.stderrLines.length > 50) this.stderrLines = this.stderrLines.slice(-50);
	}

	rejectAll(error) {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}

	stderrSuffix() {
		const tail = this.stderrLines.slice(-8).join("\n");
		return tail ? `\nRecent stderr:\n${tail}` : "";
	}
}

const mcp = new McpClient();

function sendJson(res, status, payload) {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify(payload));
}

async function readJson(req) {
	let body = "";
	for await (const chunk of req) body += chunk;
	return body ? JSON.parse(body) : {};
}

const server = http.createServer(async (req, res) => {
	lastActivity = Date.now();
	const url = new URL(req.url ?? "/", `http://${BRIDGE_HOST}:${BRIDGE_PORT}`);

	try {
		if (url.pathname === "/health") {
			sendJson(res, 200, {
				status: mcp.ready ? "online" : "starting",
				bridgePort: BRIDGE_PORT,
				uiUrl: "http://127.0.0.1:9749/",
				lastActivity,
			});
			return;
		}

		if (url.pathname === "/tools") {
			const result = await mcp.listTools();
			sendJson(res, 200, result);
			return;
		}

		if (url.pathname === "/call" && req.method === "POST") {
			const body = await readJson(req);
			if (typeof body.name !== "string") throw new Error("Missing tool name");
			const result = await mcp.callTool(body.name, body.arguments ?? {});
			sendJson(res, 200, result);
			return;
		}

		sendJson(res, 404, { error: "not found" });
	} catch (error) {
		sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
	}
});

server.on("error", (error) => {
	if (error && error.code === "EADDRINUSE") process.exit(0);
	throw error;
});

server.listen(BRIDGE_PORT, BRIDGE_HOST, async () => {
	try {
		await mcp.ensureStarted();
	} catch {
		// /tools and /call will report the captured startup error on demand.
	}
});

setInterval(() => {
	if (Date.now() - lastActivity <= IDLE_SHUTDOWN_MS) return;
	mcp.stop();
	server.close(() => process.exit(0));
}, 60_000);

process.on("SIGTERM", () => {
	mcp.stop();
	server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
	mcp.stop();
	server.close(() => process.exit(0));
});
