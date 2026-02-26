/**
 * Domain Layer - Core type definitions
 *
 * Pure business logic types with no external dependencies.
 * This is the innermost layer of Clean Architecture.
 */

// ============================================================================
// Session Types
// ============================================================================

/** Unique identifier for a session */
export type SessionKey = string;

/** Message source channel */
export type MessageChannel = "main" | "telegram" | "discord" | "webchat" | "cron" | "hook";

/** Chat type within a channel */
export type ChatType = "dm" | "group" | "channel" | "thread";

/** Source of an inbound message */
export interface MessageSource {
  channel: MessageChannel;
  accountId?: string;
  chatType: ChatType;
  chatId: string;
  threadId?: string;
  topicId?: string;
  senderId?: string;
  senderName?: string;
}

/** Session state persisted to disk */
export interface SessionState {
  sessionKey: SessionKey;
  role: string | null;
  lastActivity: number;
  messageCount: number;
  lastChatId?: string;
  lastChannel?: string;
  lastAccountId?: string;
  lastChatType?: ChatType;
  lastSenderId?: string;
  lastSenderName?: string;
  lastTopicId?: string;
  lastThreadId?: string;
  lastModel?: string;
  lastModelSource?: string;
  lastThinkingLevel?: string;
  lastThinkingLevelSource?: string;
}

/** Inbound message to be processed */
export interface InboundMessage {
  id: string;
  source: MessageSource;
  text: string;
  images?: Array<{
    data: string;
    mimeType: string;
  }>;
  timestamp: number;
}

// ============================================================================
// Logging Types
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Cron Types
// ============================================================================

export type ScheduleKind = "cron" | "at" | "every";

export interface CronSchedule {
  kind: ScheduleKind;
  expression: string;
}

export type CronDeliveryMode = "direct" | "announce" | "silent";

export interface CronDelivery {
  mode: CronDeliveryMode;
  target?: string;
}

export interface CronJob {
  id: string;
  name?: string;
  enabled: boolean;
  paused?: boolean;
  schedule: CronSchedule;
  prompt: string;
  delivery: CronDelivery;
  lastRun?: number;
  nextRun?: number;
  runCount?: number;
  errorCount?: number;
}

// ============================================================================
// Plugin Types (Domain Layer)
// ============================================================================

export type PluginStatus = "inactive" | "initializing" | "active" | "error" | "stopping";

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: string[];
}

/**
 * Base plugin interface - no privilege distinction between builtin and external.
 * All plugins implement this interface for lifecycle management.
 */
export interface Plugin {
  readonly metadata: PluginMetadata;
  readonly status: PluginStatus;

  /** Initialize plugin with API access */
  init?(api: PluginApi): Promise<void>;

  /** Start plugin operation */
  start?(): Promise<void>;

  /** Gracefully stop plugin */
  stop?(): Promise<void>;

  /** Unload plugin and cleanup resources */
  unload?(): Promise<void>;
}

/**
 * Plugin API provided by the gateway during initialization.
 * Domain layer defines the interface, infrastructure implements it.
 */
export interface PluginApi {
  /** Logger instance for this plugin */
  logger: Logger;

  /** Register a hook handler */
  onHook(name: string, handler: HookHandler): void;

  /** Emit an event to the gateway */
  emitEvent(event: PluginEvent): void;

  /** Get plugin configuration */
  getConfig<T = unknown>(): T;

  /** Register custom tools */
  registerTool(name: string, tool: ToolDefinition): void;
}

export type HookHandler = (context: HookContext) => Promise<void> | void;

export interface HookContext {
  readonly type: string;
  readonly data: unknown;
  readonly abort: () => void;
}

export interface PluginEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

// ============================================================================
// Gateway Events
// ============================================================================

export type GatewayEventType =
  | "session_created"
  | "session_destroyed"
  | "message_received"
  | "message_sent"
  | "cron_triggered"
  | "plugin_loaded"
  | "plugin_error"
  | "system_error";

export interface GatewayEvent {
  type: GatewayEventType;
  timestamp: number;
  sessionKey?: SessionKey;
  data: unknown;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
