/**
 * RPC Client — wraps a single `pi --mode rpc` subprocess.
 *
 * Communication: JSON Lines over stdin (commands) / stdout (responses + events).
 * Protocol reference: pi-mono/packages/coding-agent/docs/rpc.md
 */

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RpcCommand, RpcResponse, AgentEvent, AssistantMessageEvent, ImageContent } from "./types.ts";
import { createLogger, type Logger } from "./types.ts";

// ── RPC file logger ────────────────────────────────────────────────────────

const RPC_LOG_DIR = join(process.cwd(), "log");
const RPC_LOG_PATH = join(RPC_LOG_DIR, "rpc.log");
let logDirReady = false;

async function ensureLogDir(): Promise<void> {
  if (logDirReady) return;
  await mkdir(RPC_LOG_DIR, { recursive: true });
  logDirReady = true;
}

async function rpcFileLog(clientId: string, direction: ">>>" | "<<<", line: string): Promise<void> {
  try {
    await ensureLogDir();
    const ts = new Date().toISOString();
    await appendFile(RPC_LOG_PATH, `${ts} [${clientId}] ${direction} ${line}\n`);
  } catch {
    // Non-critical — don't break RPC flow for log failures
  }
}

/** Bun Subprocess with piped stdio — we assert the types since Bun.spawn with "pipe" guarantees them */
interface PipedSubprocess {
  readonly pid: number;
  readonly exitCode: number | null;
  readonly exited: Promise<number>;
  readonly stdin: { write(data: string | Uint8Array): number; flush(): void; end(): void };
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  kill(signal?: string): void;
}

// ============================================================================
// Types
// ============================================================================

export type RpcEventListener = (event: AgentEvent) => void;

export interface RpcClientOptions {
  /** Path to pi CLI binary. Default: "pi" */
  piCliPath?: string;
  /** Working directory for the pi process */
  cwd?: string;
  /** Capability signature used for pool reuse isolation. */
  signature?: string;
  /** Hard constraint signature (role+cwd+tools+env). Must match exactly for reuse. */
  hardSignature?: string;
  /** Soft resources loaded into this process. Superset check for flexible reuse. */
  softResources?: { skills: string[]; extensions: string[]; promptTemplates: string[] };
  /** Environment variables to pass */
  env?: Record<string, string>;
  /** Additional CLI arguments */
  args?: string[];
}

interface PendingRequest {
  resolve: (response: RpcResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// ============================================================================
// RPC Client
// ============================================================================

export class RpcClient {
  readonly id: string;
  private proc: PipedSubprocess | null = null;
  private eventListeners: RpcEventListener[] = [];
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private stderr = "";
  private log: Logger;
  private readLoop: Promise<void> | null = null;

  /** Current bound session key (null = idle) */
  sessionKey: string | null = null;
  lastActivity = Date.now();

  /**
   * Optional external handler for extension UI requests.
   * Return true if handled (forwarded to WS client), false to fall back to auto-cancel.
   * Set by server.ts when ExtensionUIForwarder is available.
   */
  extensionUIHandler: ((data: Record<string, unknown>, writeToRpc: (msg: string) => void) => boolean) | null = null;

  constructor(
    id: string,
    private options: RpcClientOptions = {},
  ) {
    this.id = id;
    this.log = createLogger(`rpc:${id}`);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async start(): Promise<void> {
    if (this.proc) throw new Error("RPC client already started");

    const piPath = this.options.piCliPath ?? "pi";
    // NOTE: We intentionally do NOT pass --no-session here.
    // Session persistence is controlled via --session-dir (set by rpc-pool).
    // This allows pi to write JSONL transcripts for debugging.
    const args = ["--mode", "rpc"];
    if (this.options.args) args.push(...this.options.args);

    this.log.info(`Starting: ${piPath} ${args.join(" ")} (cwd: ${this.options.cwd ?? process.cwd()})`);

    this.proc = Bun.spawn([piPath, ...args], {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }) as PipedSubprocess;

    // Collect stderr
    this.collectStderr();

    // Start reading stdout lines
    this.startReadLoop();

    // Wait for process to stabilize
    await Bun.sleep(200);

    if (this.proc.exitCode !== null) {
      throw new Error(`pi process exited immediately (code ${this.proc.exitCode}). stderr: ${this.stderr}`);
    }

    this.log.info("Started successfully");
  }

  async stop(): Promise<void> {
    if (!this.proc) return;

    this.log.info("Stopping...");

    // Cancel pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("RPC client stopping"));
      this.pendingRequests.delete(id);
    }

    this.proc.kill("SIGTERM");

    // Wait up to 2s, then force kill
    const exitPromise = this.proc.exited;
    const timeout = setTimeout(() => this.proc?.kill("SIGKILL"), 2000);
    await exitPromise;
    clearTimeout(timeout);

    this.proc = null;
    this.readLoop = null;
    this.log.info("Stopped");
  }

  get isAlive(): boolean {
    return this.proc !== null && this.proc.exitCode === null;
  }

  get isIdle(): boolean {
    return this.sessionKey === null;
  }

  get cwd(): string | undefined {
    return this.options.cwd;
  }

  get signature(): string | undefined {
    return this.options.signature;
  }

  get hardSignature(): string | undefined {
    return this.options.hardSignature;
  }

  get softResources(): { skills: string[]; extensions: string[]; promptTemplates: string[] } | undefined {
    return this.options.softResources;
  }

  get pid(): number | null {
    return this.proc?.pid ?? null;
  }

  getStderr(): string {
    return this.stderr;
  }

  // ==========================================================================
  // Event Subscription
  // ==========================================================================

  onEvent(listener: RpcEventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx !== -1) this.eventListeners.splice(idx, 1);
    };
  }

  /** Clear all event listeners. Used when recycling a process to a new session. */
  clearEventListeners(): void {
    this.eventListeners.length = 0;
  }

  // ==========================================================================
  // Commands
  // ==========================================================================

  async prompt(
    message: string,
    images?: ImageContent[],
    streamingBehavior?: "steer" | "followUp",
  ): Promise<void> {
    await this.send({ type: "prompt", message, images, streamingBehavior });
  }

  async steer(message: string): Promise<void> {
    await this.send({ type: "steer", message });
  }

  async abort(): Promise<void> {
    // Urgent: write directly to stdin without waiting for response.
    // This ensures abort is not blocked by pending requests.
    if (!this.proc) throw new Error("RPC client not started");
    const id = `req_${++this.requestCounter}`;
    const cmd = JSON.stringify({ type: "abort", id }) + "\n";
    this.proc.stdin.write(cmd);
    this.lastActivity = Date.now();
  }

  async newSession(): Promise<{ cancelled: boolean }> {
    const res = await this.send({ type: "new_session" });
    return (res.data as { cancelled: boolean }) ?? { cancelled: false };
  }

  async getState(): Promise<unknown> {
    const res = await this.send({ type: "get_state" });
    return res.data;
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    await this.send({ type: "set_model", provider, modelId });
  }

  async setThinkingLevel(level: string): Promise<void> {
    await this.send({ type: "set_thinking_level", level: level as any });
  }

  async compact(customInstructions?: string): Promise<unknown> {
    const res = await this.send({ type: "compact", customInstructions });
    return res.data;
  }

  async getSessionStats(): Promise<unknown> {
    const res = await this.send({ type: "get_session_stats" });
    return res.data;
  }

  async getLastAssistantText(): Promise<string | null> {
    const res = await this.send({ type: "get_last_assistant_text" });
    return (res.data as { text: string | null })?.text ?? null;
  }

  async getMessages(): Promise<unknown[]> {
    const res = await this.send({ type: "get_messages" });
    return (res.data as { messages: unknown[] })?.messages ?? [];
  }

  async setAutoCompaction(enabled: boolean): Promise<void> {
    await this.send({ type: "set_auto_compaction", enabled });
  }

  async setAutoRetry(enabled: boolean): Promise<void> {
    await this.send({ type: "set_auto_retry", enabled });
  }

  async getAvailableModels(): Promise<unknown> {
    const res = await this.send({ type: "get_available_models" });
    return (res.data as { models: unknown[] })?.models ?? [];
  }

  async getCommands(): Promise<{ name: string; description?: string }[]> {
    const res = await this.send({ type: "get_commands" });
    return (res.data as { commands: { name: string; description?: string }[] })?.commands ?? [];
  }

  async cycleModel(): Promise<unknown> {
    const res = await this.send({ type: "cycle_model" });
    return res.data;
  }

  async cycleThinkingLevel(): Promise<unknown> {
    const res = await this.send({ type: "cycle_thinking_level" });
    return res.data;
  }

  async setSteeringMode(mode: "all" | "one-at-a-time"): Promise<void> {
    await this.send({ type: "set_steering_mode", mode });
  }

  async setFollowUpMode(mode: "all" | "one-at-a-time"): Promise<void> {
    await this.send({ type: "set_follow_up_mode", mode });
  }

  async abortRetry(): Promise<void> {
    await this.send({ type: "abort_retry" });
  }

  // ==========================================================================
  // Session Commands (aligned with RpcCommand types)
  // ==========================================================================

  async switchSession(sessionPath: string): Promise<void> {
    await this.send({ type: "switch_session", sessionPath });
  }

  async fork(entryId: string): Promise<void> {
    await this.send({ type: "fork", entryId });
  }

  async getForkMessages(): Promise<unknown[]> {
    const res = await this.send({ type: "get_fork_messages" });
    return (res.data as { messages: unknown[] })?.messages ?? [];
  }

  async setSessionName(name: string): Promise<void> {
    await this.send({ type: "set_session_name", name });
  }

  async exportHtml(outputPath?: string): Promise<string | null> {
    const res = await this.send({ type: "export_html", outputPath });
    return (res.data as { path?: string })?.path ?? null;
  }

  // ==========================================================================
  // Bash Commands
  // ==========================================================================

  async bash(command: string): Promise<unknown> {
    const res = await this.send({ type: "bash", command });
    return res.data;
  }

  async abortBash(): Promise<void> {
    await this.send({ type: "abort_bash" });
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Wait for the agent to become idle (agent_end event).
   */
  waitForIdle(timeoutMs = 120_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`Timeout waiting for agent_end (${timeoutMs}ms)`));
      }, timeoutMs);

      const unsub = this.onEvent((event) => {
        if (event.type === "agent_end") {
          clearTimeout(timer);
          unsub();
          resolve();
        }
      });
    });
  }

  /**
   * Send prompt and collect the full assistant text.
   */
  async promptAndCollect(
    message: string,
    timeoutMs = 120_000,
    streamingBehavior?: "steer" | "followUp",
  ): Promise<string> {
    let text = "";
    const unsub = this.onEvent((event) => {
      if (event.type === "message_update") {
        const ame = (event as any).assistantMessageEvent as AssistantMessageEvent | undefined;
        if (ame?.type === "text_delta" && ame.delta) {
          text += ame.delta;
        }
      }
    });

    await this.prompt(message, undefined, streamingBehavior);
    await this.waitForIdle(timeoutMs);
    unsub();
    return text;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private async send(command: Record<string, unknown>): Promise<RpcResponse> {
    if (!this.proc) throw new Error("RPC client not started");

    const id = `req_${++this.requestCounter}`;
    const fullCommand = { ...command, id };

    this.lastActivity = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout for ${command.type} (30s). stderr: ${this.stderr.slice(-500)}`));
      }, 30_000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const line = JSON.stringify(fullCommand) + "\n";
      // Debug: log command (truncate image data)
      const debugCmd = { ...fullCommand } as Record<string, unknown>;
      if (debugCmd.images && Array.isArray(debugCmd.images)) {
        debugCmd.images = (debugCmd.images as any[]).map((img: any) => ({
          ...img,
          data: img.data ? `[${img.data.length} chars]` : undefined,
        }));
      }
      this.log.info(`RPC send: ${JSON.stringify(debugCmd).slice(0, 500)}`);
      void rpcFileLog(this.id, ">>>", JSON.stringify(debugCmd));
      this.proc!.stdin.write(line);
    });
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    void rpcFileLog(this.id, "<<<", line);

    try {
      const data = JSON.parse(line);

      // Response to a pending request
      if (data.type === "response" && data.id && this.pendingRequests.has(data.id)) {
        const pending = this.pendingRequests.get(data.id)!;
        this.pendingRequests.delete(data.id);
        clearTimeout(pending.timeout);

        if (!data.success) {
          pending.reject(new Error(data.error ?? `RPC error for ${data.command}`));
        } else {
          pending.resolve(data as RpcResponse);
        }
        return;
      }

      // Auto-handle extension UI requests (headless mode)
      // pi extensions may request TUI interactions (select, confirm, input, etc.)
      // In headless/gateway mode we auto-respond to prevent hanging.
      if (data.type === "extension_ui_request") {
        this.handleExtensionUIRequest(data);
        // Still emit as event so listeners can observe
      }

      // Agent event
      for (const listener of this.eventListeners) {
        try {
          listener(data as AgentEvent);
        } catch (err) {
          this.log.error("Event listener error:", err);
        }
      }
    } catch {
      // Non-JSON line (e.g. pi startup output) — ignore
    }
  }

  /**
   * Auto-respond to extension UI requests in headless mode.
   *
   * pi extensions can emit these when they need user interaction:
   *   select   -> pick from options (auto: first option or cancel)
   *   confirm  -> yes/no (auto: confirm)
   *   input    -> text input (auto: cancel)
   *   editor   -> text editor (auto: cancel)
   *   notify   -> notification (no response needed, but we ack anyway)
   *   setStatus/setWidget/setTitle/set_editor_text -> UI updates (no response needed)
   */
  private handleExtensionUIRequest(data: Record<string, unknown>): void {
    const id = data.id as string;
    const method = data.method as string;

    if (!id || !method) return;

    // Try external handler first (WS forwarding to WebChat frontend)
    if (this.extensionUIHandler && this.proc) {
      const writeToRpc = (msg: string) => { this.proc?.stdin.write(msg + "\n"); };
      if (this.extensionUIHandler(data, writeToRpc)) return;
    }

    // Fallback: auto-respond in headless mode
    let response: Record<string, unknown> | null = null;

    switch (method) {
      case "select": {
        // Auto-select first option if available, otherwise cancel
        const options = data.options as string[] | undefined;
        if (options && options.length > 0) {
          response = { type: "extension_ui_response", id, value: options[0] };
          this.log.debug(`Extension UI auto-select: "${options[0]}" (from ${options.length} options)`);
        } else {
          response = { type: "extension_ui_response", id, cancelled: true };
          this.log.debug("Extension UI auto-cancel select (no options)");
        }
        break;
      }
      case "confirm":
        // Auto-confirm
        response = { type: "extension_ui_response", id, confirmed: true };
        this.log.debug(`Extension UI auto-confirm: "${data.title}"`);
        break;
      case "input":
        // Cancel text input (can't type in headless mode)
        response = { type: "extension_ui_response", id, cancelled: true };
        this.log.debug(`Extension UI auto-cancel input: "${data.title}"`);
        break;
      case "editor":
        // Cancel editor (can't edit in headless mode)
        response = { type: "extension_ui_response", id, cancelled: true };
        this.log.debug(`Extension UI auto-cancel editor: "${data.title}"`);
        break;
      case "notify":
      case "setStatus":
      case "setWidget":
      case "setTitle":
      case "set_editor_text":
        // These are fire-and-forget UI updates, no response needed
        // But some implementations may still wait, so ack with cancel
        response = { type: "extension_ui_response", id, cancelled: true };
        break;
      default:
        // Unknown method — cancel to unblock
        response = { type: "extension_ui_response", id, cancelled: true };
        this.log.debug(`Extension UI auto-cancel unknown method: "${method}"`);
    }

    if (response && this.proc) {
      this.proc.stdin.write(JSON.stringify(response) + "\n");
    }
  }

  private startReadLoop(): void {
    if (!this.proc) return;

    const decoder = new TextDecoder();
    let buffer = "";
    const stdout = this.proc.stdout;

    this.readLoop = (async () => {
      const reader = (stdout as ReadableStream<Uint8Array>).getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            this.handleLine(line);
          }
        }
      } catch {
        // Stream closed
      }

      if (buffer.trim()) {
        this.handleLine(buffer);
      }
    })();
  }

  private collectStderr(): void {
    if (!this.proc) return;

    const stderr = this.proc.stderr;
    (async () => {
      const reader = (stderr as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          this.stderr += decoder.decode(value, { stream: true });
          if (this.stderr.length > 10_000) {
            this.stderr = this.stderr.slice(-5_000);
          }
        }
      } catch {
        // Stream closed
      }
    })();
  }
}
