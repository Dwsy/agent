/**
 * Daemon Client Provider for all-MiniLM-L6-v2
 * Connects to shared daemon process for multi-session embedding
 */

import { EmbeddingProvider } from "./memory-vector.ts";
import { DaemonClient, DaemonManager, DaemonConfig } from "./embedding-daemon.ts";
import { log } from "./logger.ts";
import { join } from "path";
import { homedir, platform } from "os";

export interface DaemonClientConfig {
  /** Socket path (auto-detected if not provided) */
  socketPath?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Auto-start daemon if not running */
  autoStartDaemon?: boolean;
  /** Daemon configuration (if auto-start) */
  daemonConfig?: Partial<DaemonConfig>;
}

/**
 * DaemonClientProvider - Shared model via daemon process
 * Multiple Pi sessions can share a single model instance
 */
export class MiniLMDaemonClientProvider implements EmbeddingProvider {
  readonly dim = 384;
  readonly model = "all-MiniLM-L6-v2";

  private config: Required<DaemonClientConfig>;
  private client: DaemonClient;
  private manager: DaemonManager | null = null;
  private initialized = false;

  constructor(config: DaemonClientConfig = {}) {
    const socketPath = config.socketPath || this.getDefaultSocketPath();

    this.config = {
      socketPath,
      timeoutMs: config.timeoutMs || 5000,
      autoStartDaemon: config.autoStartDaemon ?? true,
      daemonConfig: config.daemonConfig || {},
    };

    this.client = new DaemonClient(socketPath, this.config.timeoutMs);

    if (this.config.autoStartDaemon) {
      this.manager = new DaemonManager({
        socketPath: this.config.socketPath,
        ...this.config.daemonConfig,
      });
    }
  }

  /**
   * Initialize provider - ensures daemon is running
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    log("embedding-minilm-daemon", "Initializing daemon client...");

    // Ensure daemon is running
    if (this.manager) {
      const started = await this.manager.ensureDaemon();
      if (started) {
        log("embedding-minilm-daemon", "Daemon started successfully");
      } else {
        log("embedding-minilm-daemon", "Connected to existing daemon");
      }
    }

    // Verify connection with health check
    try {
      const health = await this.client.health();
      log(
        "embedding-minilm-daemon",
        `Daemon healthy: ${health.model} (${health.dimensions}d, ${health.requestsProcessed} requests processed)`
      );
    } catch (err: any) {
      throw new Error(`Daemon health check failed: ${err.message}`);
    }

    this.initialized = true;
  }

  /**
   * Generate embedding via daemon
   */
  async embed(text: string): Promise<number[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      return await this.client.embed(text);
    } catch (err: any) {
      log("embedding-minilm-daemon", `Embed failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Dispose client (does NOT stop daemon)
   */
  async dispose(): Promise<void> {
    // Client has no persistent resources, just clear state
    this.initialized = false;
  }

  /**
   * Stop the daemon (use with caution - affects all sessions)
   */
  async stopDaemon(): Promise<boolean> {
    if (!this.manager) {
      throw new Error("Daemon manager not initialized");
    }
    return this.manager.stopDaemon();
  }

  /**
   * Check daemon status
   */
  async checkStatus(): Promise<{ running: boolean; health?: any }> {
    try {
      const health = await this.client.health();
      return { running: true, health };
    } catch {
      return { running: false };
    }
  }

  private getDefaultSocketPath(): string {
    const isWindows = platform() === "win32";

    if (isWindows) {
      return "\\\\.\\pipe\\pi-embedding-daemon";
    }

    return join(homedir(), ".pi", "sockets", "embedding-daemon.sock");
  }
}

/**
 * Factory function
 */
export async function createMiniLMDaemonProvider(
  config?: DaemonClientConfig
): Promise<MiniLMDaemonClientProvider> {
  const provider = new MiniLMDaemonClientProvider(config);
  await provider.initialize();
  return provider;
}
