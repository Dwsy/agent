/**
 * Application Layer - Outbound Ports
 *
 * Interfaces for outgoing interactions to external systems.
 * These define what the application needs from infrastructure.
 */

import type {
  SessionKey,
  SessionState,
  InboundMessage,
  Logger,
  CronJob,
  Plugin,
  PluginMetadata,
} from "../../../domain/types.ts";
import type { ConfigEntity } from "../../../domain/config/entities.ts";

// ============================================================================
// Session Store Port
// ============================================================================

/**
 * Port for session persistence.
 * Infrastructure layer implements this using the repository pattern.
 */
export interface SessionStorePort {
  /**
   * Get session by key.
   */
  get(key: SessionKey): SessionState | undefined;

  /**
   * Save or update session.
   */
  save(state: SessionState): void;

  /**
   * Delete session.
   */
  delete(key: SessionKey): void;

  /**
   * Get all sessions.
   */
  getAll(): SessionState[];

  /**
   * Get or create session.
   */
  getOrCreate(
    key: SessionKey,
    defaults: Omit<SessionState, "sessionKey">
  ): SessionState;

  /**
   * Mark session as updated.
   */
  touch(key: SessionKey): void;

  /**
   * Force immediate persistence.
   */
  flush(): Promise<void>;
}

// ============================================================================
// Message Sender Port
// ============================================================================

/**
 * Outbound message for sending to channels.
 */
export interface OutboundMessage {
  /** Target session key */
  sessionKey: SessionKey;
  /** Message text content */
  text: string;
  /** Optional images */
  images?: Array<{
    data: string;
    mimeType: string;
  }>;
  /** Reply to message ID */
  replyTo?: string;
  /** Additional options */
  options?: {
    /** Silent mode (no notification) */
    silent?: boolean;
    /** Parse mode for formatting */
    parseMode?: "markdown" | "html" | "plain";
  };
}

/**
 * Result of sending a message.
 */
export interface MessageSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Port for sending outbound messages.
 */
export interface MessageSenderPort {
  /**
   * Send a message to a channel.
   */
  send(message: OutboundMessage): Promise<MessageSendResult>;

  /**
   * Send text message (convenience method).
   */
  sendText(sessionKey: SessionKey, text: string): Promise<MessageSendResult>;

  /**
   * Broadcast message to multiple sessions.
   */
  broadcast(
    sessionKeys: SessionKey[],
    text: string
  ): Promise<Map<SessionKey, MessageSendResult>>;
}

// ============================================================================
// RPC Pool Port
// ============================================================================

/**
 * RPC command to send to agent process.
 */
export interface RpcCommand {
  type: string;
  payload: unknown;
}

/**
 * RPC response from agent process.
 */
export interface RpcResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Port for RPC pool management.
 */
export interface RpcPoolPort {
  /**
   * Execute RPC command on a session.
   */
  execute(
    sessionKey: SessionKey,
    command: RpcCommand
  ): Promise<RpcResponse>;

  /**
   * Send prompt to session.
   */
  prompt(
    sessionKey: SessionKey,
    text: string,
    images?: Array<{ data: string; mimeType: string }>
  ): Promise<RpcResponse>;

  /**
   * Get pool statistics.
   */
  getStats(): {
    total: number;
    active: number;
    idle: number;
    maxCapacity: number;
  };

  /**
   * Scale pool size.
   */
  scale(min: number, max: number): void;
}

// ============================================================================
// Cron Store Port
// ============================================================================

/**
 * Port for cron job persistence.
 */
export interface CronStorePort {
  /**
   * Get all jobs.
   */
  getAll(): CronJob[];

  /**
   * Get job by ID.
   */
  get(jobId: string): CronJob | undefined;

  /**
   * Save job.
   */
  save(job: CronJob): void;

  /**
   * Delete job.
   */
  delete(jobId: string): void;

  /**
   * Update job run statistics.
   */
  updateRun(
    jobId: string,
    stats: {
      lastRun: number;
      nextRun: number;
      runCount: number;
      errorCount: number;
    }
  ): void;
}

// ============================================================================
// Plugin Manager Port
// ============================================================================

/**
 * Port for plugin management.
 */
export interface PluginManagerPort {
  /**
   * Load a plugin.
   */
  load(plugin: Plugin): Promise<void>;

  /**
   * Unload a plugin.
   */
  unload(pluginId: string): Promise<void>;

  /**
   * Get loaded plugin.
   */
  get(pluginId: string): Plugin | undefined;

  /**
   * Get all loaded plugins.
   */
  getAll(): Plugin[];

  /**
   * Check if plugin is loaded.
   */
  isLoaded(pluginId: string): boolean;
}

// ============================================================================
// Logger Port
// ============================================================================

/**
 * Port for logging - re-exports domain Logger interface.
 */
export type LoggerPort = Logger;

// ============================================================================
// Config Port


/**
 * Port for configuration access.
 */
export interface ConfigPort {
  /**
   * Get current configuration.
   */
  get(): ConfigEntity;

  /**
   * Get specific section of configuration.
   */
  get<T extends keyof ConfigEntity>(section: T): ConfigEntity[T];

  /**
   * Subscribe to configuration changes.
   * @returns Unsubscribe function
   */
  onChange(handler: () => void): () => void;
}
