/**
 * Embedding Daemon - Cross-platform shared model service
 * Provides embedding computation as a singleton process across multiple Pi sessions
 *
 * Architecture:
 * - Single model instance loaded in daemon process
 * - Unix Domain Socket (macOS/Linux) or Named Pipe (Windows) for IPC
 * - JSON-RPC style protocol for request/response
 * - Automatic daemon lifecycle management
 */

import { createServer, Server, Socket, createConnection } from "net";
import { join, dirname } from "path";
import { homedir, platform } from "os";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import { spawn, ChildProcess } from "child_process";
import { fileURLToPath } from "url";

// Dynamic imports
let ortModule: typeof import("onnxruntime-node") | null = null;

async function loadOnnxRuntime(): Promise<typeof import("onnxruntime-node")> {
  if (!ortModule) {
    ortModule = await import("onnxruntime-node");
  }
  return ortModule;
}

// ============================================================================
// Configuration
// ============================================================================

export interface DaemonConfig {
  /** Socket path for IPC (auto-detected if not provided) */
  socketPath?: string;
  /** Model path (auto-resolved if not provided) */
  modelPath?: string;
  /** Maximum concurrent batch size */
  maxBatchSize?: number;
  /** Idle timeout before auto-shutdown (ms, 0 = never) */
  idleTimeoutMs?: number;
  /** Log level */
  logLevel?: "debug" | "info" | "warn" | "error";
  /** PID file path for tracking daemon instance */
  pidFilePath?: string;
}

const DEFAULT_CONFIG: Required<DaemonConfig> = {
  socketPath: getDefaultSocketPath(),
  modelPath: getDefaultModelPath(),
  maxBatchSize: 8,
  idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
  logLevel: "info",
  pidFilePath: getDefaultPidPath(),
};

function getDefaultSocketPath(): string {
  const home = homedir();
  const isWindows = platform() === "win32";

  if (isWindows) {
    // Windows named pipe
    return "\\\\.\\pipe\\pi-embedding-daemon";
  }

  // macOS/Linux Unix socket
  const socketDir = join(home, ".pi", "sockets");
  if (!existsSync(socketDir)) {
    mkdirSync(socketDir, { recursive: true });
  }

  return join(socketDir, "embedding-daemon.sock");
}

function getDefaultPidPath(): string {
  return join(homedir(), ".pi", "sockets", "embedding-daemon.pid");
}

function getDefaultModelPath(): string {
  return join(homedir(), ".pi", "models", "all-MiniLM-L6-v2", "model.onnx");
}

// ============================================================================
// Protocol
// ============================================================================

interface EmbedRequest {
  id: string;
  method: "embed";
  params: {
    text: string;
    options?: {
      normalize?: boolean;
      maxLength?: number;
    };
  };
}

interface EmbedResponse {
  id: string;
  result?: {
    embedding: number[];
    dimensions: number;
    model: string;
  };
  error?: {
    code: number;
    message: string;
  };
}

interface HealthResponse {
  status: "healthy";
  model: string;
  dimensions: number;
  uptime: number;
  requestsProcessed: number;
}

// ============================================================================
// Daemon Server
// ============================================================================

export class EmbeddingDaemon {
  private config: Required<DaemonConfig>;
  private server: Server | null = null;
  private session: any = null; // ONNX session
  private tokenizer: any = null;
  private requestQueue: Array<QueuedRequest> = [];
  private processing = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private startTime = Date.now();
  private requestsProcessed = 0;
  private log: (level: string, msg: string) => void;

  constructor(config: DaemonConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.log = (level, msg) => {
      if (this.shouldLog(level)) {
        console.log(`[Daemon:${level.toUpperCase()}] ${msg}`);
      }
    };
  }

  private shouldLog(level: string): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level as keyof typeof levels] >= levels[this.config.logLevel];
  }

  /**
   * Start the daemon server
   */
  async start(): Promise<void> {
    this.log("info", "Starting embedding daemon...");

    // Check if already running
    const existingPid = this.readPidFile();
    if (existingPid) {
      try {
        process.kill(existingPid, 0); // Check if process exists
        this.log("warn", `Daemon already running (PID: ${existingPid})`);
        throw new Error("Daemon already running");
      } catch (e: any) {
        if (e.code === "ESRCH") {
          // Process doesn't exist, stale PID file
          this.log("info", "Cleaning stale PID file");
          this.removePidFile();
        } else {
          throw e;
        }
      }
    }

    // Clean up stale socket file (Unix only)
    if (platform() !== "win32" && existsSync(this.config.socketPath)) {
      try {
        unlinkSync(this.config.socketPath);
        this.log("info", "Cleaned stale socket file");
      } catch (e) {
        // Ignore errors
      }
    }

    // Load model
    await this.loadModel();

    // Create server
    this.server = createServer((socket) => {
      this.handleConnection(socket);
    });

    // Write PID file
    this.writePidFile();

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.config.socketPath, () => {
        this.log("info", `Listening on ${this.config.socketPath}`);

        // Set permissions on socket (Unix only)
        if (platform() !== "win32") {
          try {
            chmodSync(this.config.socketPath, 0o600);
          } catch (e) {
            this.log("warn", "Failed to set socket permissions");
          }
        }

        resolve();
      });

      this.server!.on("error", (err) => {
        this.log("error", `Server error: ${err.message}`);
        reject(err);
      });
    });

    // Start idle timeout handler
    this.resetIdleTimer();

    this.log("info", "Daemon ready");
  }

  /**
   * Stop the daemon server
   */
  async stop(): Promise<void> {
    this.log("info", "Stopping daemon...");

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    if (this.session) {
      await this.session.release();
      this.session = null;
    }

    this.removePidFile();
    this.removeSocketFile();

    this.log("info", "Daemon stopped");
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async loadModel(): Promise<void> {
    this.log("info", `Loading model from ${this.config.modelPath}`);

    const ort = await loadOnnxRuntime();

    this.session = await ort.InferenceSession.create(this.config.modelPath);

    // Load tokenizer from tokenizer.json
    const { BertWordPieceTokenizer } = await import("./embedding-minilm.ts");
    const modelDir = join(this.config.modelPath, "..");
    const tokenizerPath = join(modelDir, "tokenizer.json");
    this.tokenizer = await BertWordPieceTokenizer.fromFile(tokenizerPath);

    this.log("info", "Model and tokenizer loaded successfully");
  }

  private handleConnection(socket: Socket): void {
    let buffer = "";

    socket.on("data", (data: Buffer) => {
      buffer += data.toString();
      this.processBuffer(socket, buffer);
    });

    socket.on("error", (err) => {
      this.log("warn", `Socket error: ${err.message}`);
    });

    socket.on("close", () => {
      this.log("debug", "Socket closed");
    });
  }

  private processBuffer(socket: Socket, buffer: string): void {
    // Process complete JSON lines
    let newlineIndex: number;

    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.trim()) continue;

      try {
        const request = JSON.parse(line) as EmbedRequest;
        this.handleRequest(socket, request);
      } catch (err) {
        this.sendError(socket, "", -32700, "Parse error: Invalid JSON");
      }
    }
  }

  private handleRequest(socket: Socket, request: EmbedRequest): void {
    this.resetIdleTimer();

    if (request.method === "embed") {
      this.enqueueRequest(socket, request);
    } else if (request.method === "health") {
      this.sendHealthResponse(socket, request.id);
    } else {
      this.sendError(socket, request.id, -32601, "Method not found");
    }
  }

  private enqueueRequest(socket: Socket, request: EmbedRequest): void {
    this.requestQueue.push({
      socket,
      request,
      timestamp: Date.now(),
    });

    if (!this.processing) {
      this.processBatch();
    }
  }

  private async processBatch(): Promise<void> {
    this.processing = true;

    while (this.requestQueue.length > 0) {
      // Collect batch (respect maxBatchSize)
      const batchSize = Math.min(
        this.requestQueue.length,
        this.config.maxBatchSize
      );
      const batch = this.requestQueue.splice(0, batchSize);

      try {
        // Process batch
        const texts = batch.map((r) => r.request.params.text);
        const embeddings = await this.computeBatchEmbeddings(texts);

        // Send responses
        batch.forEach((item, i) => {
          this.sendResponse(item.socket, item.request.id, {
            embedding: embeddings[i],
            dimensions: embeddings[i].length,
            model: "all-MiniLM-L6-v2",
          });
          this.requestsProcessed++;
        });
      } catch (err: any) {
        // Send errors to all in batch
        batch.forEach((item) => {
          this.sendError(
            item.socket,
            item.request.id,
            -32603,
            `Internal error: ${err.message}`
          );
        });
      }
    }

    this.processing = false;
  }

  private async computeBatchEmbeddings(texts: string[]): Promise<number[][]> {
    // Simple sequential processing for now
    // TODO: Implement true batch inference
    const results: number[][] = [];

    for (const text of texts) {
      const embedding = await this.computeEmbedding(text);
      results.push(embedding);
    }

    return results;
  }

  private async computeEmbedding(text: string): Promise<number[]> {
    const ort = await loadOnnxRuntime();

    // Simple tokenization (max 512 tokens)
    const maxLength = 512;
    const tokens = this.tokenize(text, maxLength);

    // Create tensors
    const inputIds = new ort.Tensor(
      "int64",
      BigInt64Array.from(tokens.inputIds.map((x) => BigInt(x))),
      [1, tokens.inputIds.length]
    );

    const attentionMask = new ort.Tensor(
      "int64",
      BigInt64Array.from(tokens.attentionMask.map((x) => BigInt(x))),
      [1, tokens.attentionMask.length]
    );

    // token_type_ids: all zeros for single sentence
    const tokenTypeIds = new ort.Tensor("int64", new BigInt64Array(tokens.inputIds.length), [1, tokens.inputIds.length]);

    // Run inference
    const results = await this.session.run({
      input_ids: inputIds,
      attention_mask: attentionMask,
      token_type_ids: tokenTypeIds,
    });

    // Mean pooling and normalize
    const hiddenStates = results.last_hidden_state || results.output_0;
    const pooled = this.meanPooling(hiddenStates, tokens.attentionMask);
    return this.normalize(pooled);
  }

  private tokenize(text: string, maxLength: number): TokenizationResult {
    if (!this.tokenizer) {
      throw new Error("Tokenizer not initialized");
    }
    return this.tokenizer.encode(text, maxLength);
  }

  private meanPooling(hiddenStates: any, attentionMask: number[]): Float32Array {
    const dims = hiddenStates.dims as number[];
    const [, seqLen, hiddenDim] = dims;
    const data = hiddenStates.data as Float32Array;

    let maskSum = 0;
    for (let i = 0; i < seqLen; i++) {
      maskSum += attentionMask[i];
    }

    const output = new Float32Array(hiddenDim);
    for (let h = 0; h < hiddenDim; h++) {
      let sum = 0;
      for (let s = 0; s < seqLen; s++) {
        sum += data[s * hiddenDim + h] * attentionMask[s];
      }
      output[h] = sum / maskSum;
    }

    return output;
  }

  private normalize(vector: Float32Array): number[] {
    let sumSquares = 0;
    for (let i = 0; i < vector.length; i++) {
      sumSquares += vector[i] * vector[i];
    }

    const magnitude = Math.sqrt(sumSquares);
    if (magnitude === 0) return Array.from(vector);

    return Array.from(vector).map((v) => v / magnitude);
  }

  private sendResponse(socket: Socket, id: string, result: any): void {
    const response: EmbedResponse = { id, result };
    socket.write(JSON.stringify(response) + "\n");
  }

  private sendError(
    socket: Socket,
    id: string,
    code: number,
    message: string
  ): void {
    const response: EmbedResponse = { id, error: { code, message } };
    socket.write(JSON.stringify(response) + "\n");
  }

  private sendHealthResponse(socket: Socket, id: string): void {
    const health: HealthResponse = {
      status: "healthy",
      model: "all-MiniLM-L6-v2",
      dimensions: 384,
      uptime: Date.now() - this.startTime,
      requestsProcessed: this.requestsProcessed,
    };
    this.sendResponse(socket, id, health);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    if (this.config.idleTimeoutMs > 0) {
      this.idleTimer = setTimeout(() => {
        this.log("info", "Idle timeout reached, shutting down");
        this.stop().then(() => process.exit(0));
      }, this.config.idleTimeoutMs);
    }
  }

  // ============================================================================
  // PID File Management
  // ============================================================================

  private writePidFile(): void {
    try {
      writeFileSync(this.config.pidFilePath, process.pid.toString(), "utf-8");
    } catch (e) {
      this.log("warn", "Failed to write PID file");
    }
  }

  private readPidFile(): number | null {
    try {
      if (!existsSync(this.config.pidFilePath)) return null;
      const pid = parseInt(readFileSync(this.config.pidFilePath, "utf-8"), 10);
      return isNaN(pid) ? null : pid;
    } catch (e) {
      return null;
    }
  }

  private removePidFile(): void {
    try {
      if (existsSync(this.config.pidFilePath)) {
        unlinkSync(this.config.pidFilePath);
      }
    } catch (e) {
      // Ignore
    }
  }

  private removeSocketFile(): void {
    if (platform() === "win32") return; // Windows uses named pipes, not files

    try {
      if (existsSync(this.config.socketPath)) {
        unlinkSync(this.config.socketPath);
      }
    } catch (e) {
      // Ignore
    }
  }
}

interface QueuedRequest {
  socket: Socket;
  request: EmbedRequest;
  timestamp: number;
}

interface TokenizationResult {
  inputIds: number[];
  attentionMask: number[];
}

// ============================================================================
// Daemon Client
// ============================================================================

export class DaemonClient {
  private socketPath: string;
  private timeoutMs: number;

  constructor(socketPath?: string, timeoutMs = 5000) {
    this.socketPath = socketPath || getDefaultSocketPath();
    this.timeoutMs = timeoutMs;
  }

  /**
   * Generate embedding via daemon
   */
  async embed(text: string): Promise<number[]> {
    const result = await this.callMethod("embed", { text });
    return result.embedding;
  }

  /**
   * Check daemon health
   */
  async health(): Promise<HealthResponse> {
    return this.callMethod("health", {});
  }

  private async callMethod(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const request = { id, method, params };

      const socket = createConnection(this.socketPath);
      let buffer = "";
      let timeout: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timeout);
        socket.destroy();
      };

      timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Request timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      socket.on("data", (data: Buffer) => {
        buffer += data.toString();

        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);

          try {
            const response = JSON.parse(line) as EmbedResponse;
            cleanup();

            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          } catch (err) {
            cleanup();
            reject(new Error("Invalid response from daemon"));
          }
        }
      });

      socket.on("error", (err) => {
        cleanup();
        reject(err);
      });

      socket.on("connect", () => {
        socket.write(JSON.stringify(request) + "\n");
      });
    });
  }
}

// ============================================================================
// Daemon Manager (for spawning/attaching to daemon)
// ============================================================================

export class DaemonManager {
  private config: DaemonConfig;
  private daemonProcess: ChildProcess | null = null;

  constructor(config: DaemonConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Ensure daemon is running (starts if not)
   */
  async ensureDaemon(): Promise<boolean> {
    // Check if daemon is already running
    if (await this.isDaemonRunning()) {
      return true;
    }

    // Start daemon
    return this.startDaemon();
  }

  /**
   * Stop daemon if running
   */
  async stopDaemon(): Promise<boolean> {
    const pid = this.readPidFile();
    if (!pid) return false;

    try {
      process.kill(pid, "SIGTERM");

      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          try {
            process.kill(pid, 0);
          } catch {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      });

      return true;
    } catch (e) {
      return false;
    }
  }

  private async isDaemonRunning(): Promise<boolean> {
    const client = new DaemonClient(this.config.socketPath, 1000);

    try {
      await client.health();
      return true;
    } catch {
      return false;
    }
  }

  private async startDaemon(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Get this file's path for spawning
      const currentFile = fileURLToPath(import.meta.url);
      const isCompiled = currentFile.endsWith(".js");

      const args = isCompiled
        ? [currentFile, "--daemon"]
        : [currentFile, "--daemon"];

      const command = isCompiled ? "node" : "tsx";

      const child = spawn(command, args, {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          EMBEDDING_DAEMON_SOCKET: this.config.socketPath,
          EMBEDDING_DAEMON_MODEL: this.config.modelPath,
        },
      });

      child.stdout?.on("data", (data) => {
        const msg = data.toString();
        if (msg.includes("ready")) {
          // Daemon is ready
          child.unref();
          resolve(true);
        }
      });

      child.stderr?.on("data", (data) => {
        console.error(`[Daemon stderr] ${data}`);
      });

      child.on("error", (err) => {
        reject(err);
      });

      child.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Daemon exited with code ${code}`));
        }
      });

      // Timeout if daemon doesn't start
      setTimeout(() => {
        reject(new Error("Daemon startup timeout"));
      }, 10000);
    });
  }

  private readPidFile(): number | null {
    try {
      const pidPath = this.config.pidFilePath || getDefaultPidPath();
      if (!existsSync(pidPath)) return null;

      const pid = parseInt(
        readFileSync(pidPath, "utf-8"),
        10
      );
      return isNaN(pid) ? null : pid;
    } catch (e) {
      return null;
    }
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes("--daemon")) {
    // Daemon mode
    const socketPath = process.env.EMBEDDING_DAEMON_SOCKET;
    const modelPath = process.env.EMBEDDING_DAEMON_MODEL;

    const daemon = new EmbeddingDaemon({ socketPath, modelPath });

    daemon.start().catch((err) => {
      console.error("Failed to start daemon:", err);
      process.exit(1);
    });

    // Handle signals
    process.on("SIGTERM", async () => {
      await daemon.stop();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      await daemon.stop();
      process.exit(0);
    });
  } else {
    // CLI mode
    console.log("Usage:");
    console.log("  tsx embedding-daemon.ts --daemon    # Start daemon");
    console.log("  tsx embedding-daemon.ts --status    # Check status");
    console.log("  tsx embedding-daemon.ts --stop      # Stop daemon");
  }
}
