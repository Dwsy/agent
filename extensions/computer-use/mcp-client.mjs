import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BRIDGE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "bin",
  "computer-use-mcp-bridge.mjs",
);
const PROTOCOL_VERSION = "2025-11-25";
const MAX_STDERR_CHARS = 16_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const KILL_GRACE_MS = 750;

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
  #bridgePath;
  #env;
  #child;
  #buffer = "";
  #stderr = "";
  #nextId = 1;
  #pending = new Map();
  #startPromise;
  #requestTimeoutMs;
  #closing = false;

  constructor(options = {}) {
    this.#bridgePath = options.bridgePath ?? DEFAULT_BRIDGE_PATH;
    this.#env = { ...process.env, ...options.env };
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  async start() {
    this.#startPromise ??= this.#start();
    try {
      return await this.#startPromise;
    } catch (error) {
      this.#startPromise = undefined;
      this.#killProcessTree();
      throw error;
    }
  }

  async #start() {
    this.#closing = false;
    this.#buffer = "";
    this.#stderr = "";

    const child = spawn(process.execPath, [this.#bridgePath], {
      env: this.#env,
      stdio: ["pipe", "pipe", "pipe"],
      // 独立进程组：close() 时可整组击杀 bridge 及其拉起的 sandbox/client 孙进程。
      detached: true,
    });
    this.#child = child;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.#handleStdout(chunk));

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      this.#stderr = `${this.#stderr}${chunk}`.slice(-MAX_STDERR_CHARS);
    });

    child.on("error", (error) => this.#failAll(error));
    child.on("close", (code, signal) => {
      const suffix = this.#stderr.trim() ? `: ${this.#stderr.trim()}` : "";
      const error = new Error(
        `Computer Use bridge closed (code=${String(code)}, signal=${String(signal)})${suffix}`,
      );
      this.#child = undefined;
      if (!this.#closing) this.#failAll(error);
    });

    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") this.#failAll(error);
    });

    const initialized = await this.#request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "pi-computer-use", version: "0.1.0" },
    });
    this.#notify("notifications/initialized", {});
    return initialized;
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

    // 🎯 上游运行时重启/认证失效（-100xx）：整树换新传输。
    // 只读动作安全重放一次；有副作用的动作不重放（可能已执行），仅保证后续调用恢复。
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
    this.#killProcessTree();
    this.#startPromise = undefined;
    await this.start();
  }

  close() {
    this.#closing = true;
    this.#failAll(new Error("Computer Use client closed"));
    this.#killProcessTree();
    this.#startPromise = undefined;
  }

  #killProcessTree() {
    const child = this.#child;
    this.#child = undefined;
    if (!child) return;
    if (child.stdin?.writable) child.stdin.end();
    // bridge 会拉起 codex sandbox + Sky client 孙进程，SIGTERM 给整个进程组。
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        // 进程已退出。
      }
    }
    const escalate = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // 进程已退出。
      }
    }, KILL_GRACE_MS);
    escalate.unref();
  }

  #request(method, params, signal) {
    if (!this.#child?.stdin.writable) {
      return Promise.reject(new Error("Computer Use bridge is not writable"));
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
    if (this.#child?.stdin.writable) {
      this.#write({ jsonrpc: "2.0", method, params });
    }
  }

  #write(message) {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleStdout(chunk) {
    this.#buffer += chunk;
    for (;;) {
      const newlineIndex = this.#buffer.indexOf("\n");
      if (newlineIndex < 0) return;

      const line = this.#buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.#buffer = this.#buffer.slice(newlineIndex + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.#failAll(new Error(`Invalid JSON from Computer Use bridge: ${line}`));
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
  }

  #failAll(error) {
    for (const pending of this.#pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
