#!/usr/bin/env node

// Shared Computer Use daemon: holds ONE bridge chain (bridge → codex sandbox →
// Sky client) and multiplexes MCP JSON-RPC for every Pi session over a unix
// socket, so N sessions cost one process tree instead of N.
//
// Protocol: newline-delimited JSON-RPC 2.0, same as MCP stdio.
// Lifecycle: spawned on demand by mcp-client.mjs; exits after
// COMPUTER_USE_DAEMON_IDLE_MS (default 10 min) with zero connected clients.

import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEBUG = process.env.COMPUTER_USE_DAEMON_DEBUG === "1";
const SOCK =
	process.env.COMPUTER_USE_DAEMON_SOCK?.trim() ||
	path.join(os.tmpdir(), "pi-computer-use-daemon.sock");
const IDLE_MS = Number(process.env.COMPUTER_USE_DAEMON_IDLE_MS) || 10 * 60_000;
const INIT_TIMEOUT_MS = Number(process.env.COMPUTER_USE_DAEMON_INIT_TIMEOUT_MS) || 15_000;
const KILL_GRACE_MS = 750;
const BRIDGE_PATH = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"computer-use-mcp-bridge.mjs",
);
// 上游运行时重启或认证失效时返回的临时服务错误（-100xx）：换新整链即可恢复。
const TRANSIENT_RE = /Computer Use server error -1\d{4}/;

function debug(message) {
	if (DEBUG) process.stderr.write(`[cu-daemon] ${message}\n`);
}

function pump(stream, onLine) {
	let buffer = "";
	stream.setEncoding("utf8");
	stream.on("data", (chunk) => {
		buffer += chunk;
		for (;;) {
			const index = buffer.indexOf("\n");
			if (index < 0) return;
			const line = buffer.slice(0, index).replace(/\r$/, "");
			buffer = buffer.slice(index + 1);
			if (line) onLine(line);
		}
	});
}

// ---- upstream: single bridge chain -----------------------------------------

let bridge = null;
let initPromise = null;
let initResult = null;
let toolsList = null;
let nextUpstreamId = 1;
let shuttingDown = false;
// upstreamId -> { client, clientId, method, timeout, cacheToolsList, resolveInit, rejectInit }
const upstreamPending = new Map();
// GUI 是单一资源：tools/call 串行执行，避免多会话动作互相踩踏。
let callChain = Promise.resolve();
const clients = new Set();
let server = null;
let idleTimer = null;

function writeJson(socket, value) {
	if (socket && !socket.destroyed && socket.writable) socket.write(`${JSON.stringify(value)}\n`);
}

function startBridge() {
	if (bridge || shuttingDown) return;
	debug(`starting bridge ${BRIDGE_PATH}`);
	bridge = spawn(process.execPath, [BRIDGE_PATH], {
		env: process.env,
		stdio: ["pipe", "pipe", "pipe"],
		// 独立进程组：退出时可整组击杀 bridge 拉起的 sandbox/Sky 孙进程。
		detached: true,
	});
	bridge.stderr.setEncoding("utf8");
	bridge.stderr.on("data", (chunk) => process.stderr.write(chunk));
	bridge.stdin.on("error", (error) => {
		if (error.code !== "EPIPE") debug(`bridge stdin failed: ${error.message}`);
	});
	bridge.on("close", (code, signal) => {
		debug(`bridge closed (code=${String(code)} signal=${String(signal)})`);
		bridge = null;
		initPromise = null;
		initResult = null;
		toolsList = null;
		for (const pending of upstreamPending.values()) {
			clearTimeout(pending.timeout);
			if (pending.rejectInit) {
				pending.rejectInit(new Error(`Computer Use bridge closed (code=${String(code)})`));
				continue;
			}
			writeJson(pending.client, {
				jsonrpc: "2.0",
				id: pending.clientId,
				error: { code: -32000, message: `Computer Use bridge closed (code=${String(code)})` },
			});
		}
		upstreamPending.clear();
	});
	pump(bridge.stdout, handleUpstreamLine);
}

function killBridge() {
	const child = bridge;
	bridge = null;
	initPromise = null;
	initResult = null;
	toolsList = null;
	if (!child) return;
	if (child.stdin?.writable) child.stdin.end();
	try {
		process.kill(-child.pid, "SIGTERM");
	} catch {
		// 进程已退出。
	}
	setTimeout(() => {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch {
			// 进程已退出。
		}
	}, KILL_GRACE_MS).unref();
}

function sendUpstream(entry) {
	if (!bridge?.stdin.writable) throw new Error("Computer Use bridge is not writable");
	const upstreamId = nextUpstreamId++;
	upstreamPending.set(upstreamId, entry);
	entry.timeout = setTimeout(() => {
		upstreamPending.delete(upstreamId);
		if (entry.rejectInit) entry.rejectInit(new Error(`Computer Use upstream timed out: ${entry.method}`));
	}, INIT_TIMEOUT_MS);
	bridge.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: upstreamId, method: entry.method, params: entry.params ?? {} })}\n`);
}

// ensureReady：按需拉起 bridge，并完成一次全守护进程共享的 initialize 握手。
function ensureReady() {
	startBridge();
	initPromise ??= new Promise((resolve, reject) => {
		sendUpstream({
			client: null,
			clientId: null,
			method: "initialize",
			params: {
				protocolVersion: "2025-11-25",
				capabilities: { elicitation: { form: {} } },
				clientInfo: { name: "pi-computer-use-daemon", version: "0.1.0" },
			},
			resolveInit: resolve,
			rejectInit: reject,
		});
	}).catch((error) => {
		initPromise = null;
		throw error;
	});
	return initPromise;
}

function resultText(result) {
	return (Array.isArray(result?.content) ? result.content : [])
		.filter((item) => item?.type === "text" && typeof item.text === "string")
		.map((item) => item.text)
		.join("\n");
}

function handleUpstreamLine(line) {
	let message;
	try {
		message = JSON.parse(line);
	} catch {
		debug(`invalid JSON from bridge: ${line.slice(0, 200)}`);
		return;
	}

	if (Object.hasOwn(message, "id")) {
		const pending = upstreamPending.get(message.id);
		if (!pending) return;
		upstreamPending.delete(message.id);
		clearTimeout(pending.timeout);

		if (pending.method === "initialize") {
			if (message.error) {
				initPromise = null;
				pending.rejectInit?.(new Error(message.error.message ?? "initialize failed"));
			} else {
				initResult = message.result;
				pending.resolveInit?.(initResult);
			}
			return;
		}

		if (pending.cacheToolsList && message.result) toolsList = message.result;
		writeJson(pending.client, { jsonrpc: "2.0", id: pending.clientId, ...message, id: pending.clientId });

		// 临时服务错误：应答送达后换新整链，下一次请求自动恢复。
		if (pending.method === "tools/call" && message.result?.isError && TRANSIENT_RE.test(resultText(message.result))) {
			debug("transient server error detected; recycling bridge chain");
			killBridge();
		}
		return;
	}

	// 服务器主动通知：广播给全部客户端。带 id 的服务器请求（elicitation 等）
	// 由 bridge 自行应答；漏到这里的一律丢弃并记录。
	if (message.method) {
		if (Object.hasOwn(message, "id")) {
			debug(`dropped server-initiated request: ${message.method}`);
			return;
		}
		for (const client of clients) writeJson(client, message);
	}
}

// ---- client-facing socket server -------------------------------------------

function replyError(client, clientId, message) {
	writeJson(client, { jsonrpc: "2.0", id: clientId, error: { code: -32000, message } });
}

async function handleClientMessage(client, line) {
	let message;
	try {
		message = JSON.parse(line);
	} catch {
		writeJson(client, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
		return;
	}

	// 通知：无 id。
	if (!Object.hasOwn(message, "id")) {
		if (message.method === "notifications/initialized") return; // 上游只握手一次
		if (message.method === "notifications/cancelled") {
			const cancelledId = message.params?.requestId;
			for (const [upstreamId, pending] of upstreamPending) {
				if (pending.client === client && pending.clientId === cancelledId) {
					upstreamPending.delete(upstreamId);
					clearTimeout(pending.timeout);
					if (bridge?.stdin.writable) {
						bridge.stdin.write(
							`${JSON.stringify({
								jsonrpc: "2.0",
								method: "notifications/cancelled",
								params: { requestId: upstreamId, reason: "cancelled by client" },
							})}\n`,
						);
					}
					break;
				}
			}
			return;
		}
		if (bridge?.stdin.writable) bridge.stdin.write(`${JSON.stringify(message)}\n`);
		return;
	}

	const clientId = message.id;
	const method = message.method ?? "";

	if (method === "initialize") {
		try {
			await ensureReady();
			writeJson(client, { jsonrpc: "2.0", id: clientId, result: initResult });
		} catch (error) {
			replyError(client, clientId, error.message);
		}
		return;
	}

	if (method === "tools/list") {
		if (toolsList) {
			writeJson(client, { jsonrpc: "2.0", id: clientId, result: toolsList });
			return;
		}
		try {
			await ensureReady();
			sendUpstream({ client, clientId, method, cacheToolsList: true });
		} catch (error) {
			replyError(client, clientId, error.message);
		}
		return;
	}

	if (method === "tools/call") {
		// 串行：等前一个 GUI 动作完成再转发。
		callChain = callChain.then(async () => {
			try {
				await ensureReady();
				sendUpstream({ client, clientId, method, params: message.params });
			} catch (error) {
				replyError(client, clientId, error.message);
			}
		});
		return;
	}

	try {
		await ensureReady();
		sendUpstream({ client, clientId, method, params: message.params });
	} catch (error) {
		replyError(client, clientId, error.message);
	}
}

// ---- lifecycle ---------------------------------------------------------------

function scheduleIdleCheck() {
	clearTimeout(idleTimer);
	if (clients.size > 0 || shuttingDown) return;
	idleTimer = setTimeout(shutdown, IDLE_MS);
	idleTimer.unref();
}

function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	clearTimeout(idleTimer);
	killBridge();
	for (const client of clients) client.destroy();
	server?.close();
	try {
		unlinkSync(SOCK);
	} catch {
		// socket 文件已不存在。
	}
	debug("daemon shut down");
	process.exit(0);
}

function socketAlive(sockPath) {
	return new Promise((resolve) => {
		const probe = createConnection(sockPath);
		probe.once("connect", () => {
			probe.destroy();
			resolve(true);
		});
		probe.once("error", () => resolve(false));
	});
}

async function main() {
	if (existsSync(SOCK) && !(await socketAlive(SOCK))) {
		try {
			unlinkSync(SOCK);
		} catch {
			// 并发清理竞争：bind 失败时安静退出。
		}
	}

	server = createServer((client) => {
		clients.add(client);
		scheduleIdleCheck();
		pump(client, (line) => {
			handleClientMessage(client, line).catch((error) =>
				debug(`client message failed: ${error.message}`),
			);
		});
		client.on("close", () => {
			clients.delete(client);
			scheduleIdleCheck();
		});
	});

	server.on("error", (error) => {
		// 另一个守护进程已持有 socket：安静退出，由它继续服务。
		if (error.code === "EADDRINUSE") {
			debug(`socket already owned, exiting (pid ${process.pid})`);
			process.exit(0);
		}
		process.stderr.write(`[cu-daemon] server error: ${error.message}\n`);
		process.exit(1);
	});

	server.listen(SOCK, () => {
		debug(`listening on ${SOCK} (pid ${process.pid})`);
		scheduleIdleCheck();
	});

	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);
}

await main();
