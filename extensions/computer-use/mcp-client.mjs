import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DAEMON_PATH = path.join(EXTENSION_DIR, "bin", "computer-use-daemon.mjs");
const DEFAULT_SOCK =
	process.env.COMPUTER_USE_DAEMON_SOCK?.trim() ||
	path.join(os.tmpdir(), "pi-computer-use-daemon.sock");
const PROTOCOL_VERSION = "2025-11-25";
const CONNECT_TIMEOUT_MS = 5_000;
const CONNECT_RETRY_MS = 150;
const MAX_STDERR_CHARS = 16_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

// 只读动作可安全重放；有副作用的动作（click/type/...）重放会翻倍执行。
const READ_ONLY_ACTIONS = new Set(["list_apps", "get_app_state"]);
// 上游运行时重启或认证失效时返回的临时服务错误（-100xx）。
const TRANSIENT_SERVER_ERROR_RE = /Computer Use server error -1\d{4}/;

function isTransientServerError(result) {
	if (!result?.isError) return false;
	const text = (Array.isArray(result.content) ? result.content : [])
		.filter((item) => item?.type === "text" && typeof item.text === "string")
		.map((item) => item.text)
		.join("\n");
	return TRANSIENT_SERVER_ERROR_RE.test(text);
}

function abortError() {
	const error = new Error("Computer Use request aborted");
	error.name = "AbortError";
	return error;
}

function timeoutError(method, timeoutMs) {
	const error = new Error(`Computer Use request timed out after ${timeoutMs}ms: ${method}`);
	error.name = "TimeoutError";
	return error;
}

export class ComputerUseMcpClient {
	#daemonPath;
	#sockPath;
	#env;
	#socket;
	#buffer = "";
	#nextId = 1;
	#pending = new Map();
	#startPromise;
	#requestTimeoutMs;
	#closing = false;
	#daemonSpawned = false;

	constructor(options = {}) {
		this.#daemonPath = options.daemonPath ?? DEFAULT_DAEMON_PATH;
		this.#env = { ...process.env, ...options.env };
		this.#sockPath =
			options.daemonSock ?? this.#env.COMPUTER_USE_DAEMON_SOCK?.trim() ?? DEFAULT_SOCK;
		this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
	}

	async start() {
		this.#startPromise ??= this.#start();
		try {
			return await this.#startPromise;
		} catch (error) {
			this.#startPromise = undefined;
			this.#disconnect();
			throw error;
		}
	}

	async #start() {
		this.#closing = false;
		this.#buffer = "";

		this.#socket = await this.#connect();
		this.#socket.setEncoding("utf8");
		this.#socket.on("data", (chunk) => this.#handleData(chunk));
		this.#socket.on("error", (error) => this.#failAll(error));
		this.#socket.on("close", () => {
			this.#socket = undefined;
			if (!this.#closing) this.#failAll(new Error("Computer Use daemon connection closed"));
		});

		const initialized = await this.#request("initialize", {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "pi-computer-use", version: "0.1.0" },
		});
		this.#notify("notifications/initialized", {});
		return initialized;
	}

	// 连接共享守护进程；socket 不存在时按需拉起一个（detached，独立生命周期）。
	#connect(attempt = 0) {
		return new Promise((resolve, reject) => {
			const socket = createConnection(this.#sockPath);
			const cleanup = () => {
				socket.removeAllListeners("connect");
				socket.removeAllListeners("error");
			};
			socket.once("connect", () => {
				cleanup();
				resolve(socket);
			});
			socket.once("error", (error) => {
				cleanup();
				socket.destroy();
				if (error.code !== "ENOENT" && error.code !== "ECONNREFUSED") {
					reject(error);
					return;
				}
				if (attempt * CONNECT_RETRY_MS >= CONNECT_TIMEOUT_MS) {
					reject(new Error(`Computer Use daemon did not come up at ${this.#sockPath}`));
					return;
				}
				this.#ensureDaemon();
				setTimeout(() => {
					this.#connect(attempt + 1).then(resolve, reject);
				}, CONNECT_RETRY_MS);
			});
		});
	}

	#ensureDaemon() {
		if (this.#daemonSpawned) return;
		this.#daemonSpawned = true;
		// 🎯 守护进程必须监听本客户端要连的 socket，否则它默认到 tmpdir；
		// 同时存在就把 socket 环境变量显式传下去。
		const child = spawn(process.execPath, [this.#daemonPath], {
			env: { ...this.#env, COMPUTER_USE_DAEMON_SOCK: this.#sockPath },
			stdio: "ignore",
			detached: true,
		});
		child.unref();
		child.on("error", (error) => {
			process.stderr.write(`[computer-use] daemon spawn failed: ${error.message}\n`);
		});
	}

	async listTools(signal) {
		await this.start();
		const result = await this.#request("tools/list", {}, signal);
		return Array.isArray(result?.tools) ? result.tools : [];
	}

	async callTool(name, args = {}, signal) {
		await this.start();
		const result = await this.#request("tools/call", { name, arguments: args }, signal);
		if (!isTransientServerError(result)) return result;

		// 🎯 上游运行时重启/认证失效（-100xx）：守护进程已换新整链；
		// 客户端重连一次。只读动作安全重放一次；有副作用的动作不重放
		// （可能已执行），仅保证后续调用恢复。
		try {
			await this.#recycle();
		} catch {
			return result;
		}
		if (!READ_ONLY_ACTIONS.has(name)) return result;
		return this.#request("tools/call", { name, arguments: args }, signal);
	}

	async #recycle() {
		this.#failAll(new Error("Computer Use client recycled"));
		this.#disconnect();
		this.#startPromise = undefined;
		await this.start();
	}

	close() {
		this.#closing = true;
		this.#failAll(new Error("Computer Use client closed"));
		this.#disconnect();
		this.#startPromise = undefined;
	}

	#disconnect() {
		const socket = this.#socket;
		this.#socket = undefined;
		socket?.destroy();
	}

	#request(method, params, signal) {
		if (!this.#socket?.writable) {
			return Promise.reject(new Error("Computer Use daemon connection is not writable"));
		}
		if (signal?.aborted) return Promise.reject(abortError());

		const id = this.#nextId++;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.#pending.delete(id);
				cleanup();
				this.#notify("notifications/cancelled", { requestId: id, reason: "timeout" });
				reject(timeoutError(method, this.#requestTimeoutMs));
			}, this.#requestTimeoutMs);
			const cleanup = () => {
				clearTimeout(timeout);
				signal?.removeEventListener("abort", onAbort);
			};
			const onAbort = () => {
				this.#pending.delete(id);
				cleanup();
				this.#notify("notifications/cancelled", { requestId: id, reason: "aborted" });
				reject(abortError());
			};

			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			this.#pending.set(id, { resolve, reject, cleanup });
			this.#write({ jsonrpc: "2.0", id, method, params });
		});
	}

	#notify(method, params) {
		if (this.#socket?.writable) {
			this.#write({ jsonrpc: "2.0", method, params });
		}
	}

	#write(message) {
		this.#socket.write(`${JSON.stringify(message)}\n`);
	}

	#handleData(chunk) {
		let buffer = this.#buffer + chunk;
		for (;;) {
			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex < 0) break;

			const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
			buffer = buffer.slice(newlineIndex + 1);
			if (!line) continue;

			let message;
			try {
				message = JSON.parse(line);
			} catch {
				this.#failAll(new Error(`Invalid JSON from Computer Use daemon: ${line}`));
				continue;
			}

			if (!Object.hasOwn(message, "id")) continue;
			const pending = this.#pending.get(message.id);
			if (!pending) continue;

			this.#pending.delete(message.id);
			pending.cleanup();
			if (message.error) {
				pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
			} else {
				pending.resolve(message.result);
			}
		}
		this.#buffer = buffer;
	}

	#failAll(error) {
		for (const pending of this.#pending.values()) {
			pending.cleanup();
			pending.reject(error);
		}
		this.#pending.clear();
	}
}
