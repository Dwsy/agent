/**
 * Core type definitions for pi-gateway.
 *
 * Uses @mariozechner/pi-ai and @mariozechner/pi-agent-core for
 * authoritative type definitions — no hand-rolled duplicates.
 *
 * Re-exports the types we need so the rest of the codebase
 * imports from here (single point of change if SDK updates).
 */

// ============================================================================
// Re-exports from pi SDK (authoritative types)
// ============================================================================

/** Image content — flat format: { type: "image", data: base64, mimeType } */
export type { ImageContent } from "@mariozechner/pi-ai";

/** LLM message types */
export type {
  TextContent,
  ThinkingContent,
  ToolCall,
  Usage,
  StopReason,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Model,
} from "@mariozechner/pi-ai";

/**
 * Thinking level — pi-agent-core includes "off", pi-ai does not.
 * We use pi-agent-core's definition which matches the RPC protocol.
 */
export type { ThinkingLevel } from "@mariozechner/pi-agent-core";

/** Agent event types from the RPC stream */
export type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";

/** Assistant message streaming event (text_delta, toolcall_delta, etc.) */
export type { AssistantMessageEvent } from "@mariozechner/pi-ai";

// ============================================================================
// RPC Protocol Types (aligned with pi-mono rpc-types.ts)
// ============================================================================

// We don't import RpcCommand/RpcResponse directly because they reference
// internal types (SessionStats, BashResult, CompactionResult).
// Instead we define a minimal version for what gateway needs.

import type { ImageContent } from "@mariozechner/pi-ai";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

/** RPC commands (aligned with pi-mono rpc-types.ts RpcCommand union) */
export type RpcCommand =
  // ── Prompting ──
  | { id?: string; type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
  | { id?: string; type: "steer"; message: string; images?: ImageContent[] }
  | { id?: string; type: "follow_up"; message: string; images?: ImageContent[] }
  | { id?: string; type: "abort" }
  // ── Session ──
  | { id?: string; type: "new_session"; parentSession?: string }
  | { id?: string; type: "switch_session"; sessionPath: string }
  | { id?: string; type: "fork"; entryId: string }
  | { id?: string; type: "get_fork_messages" }
  | { id?: string; type: "set_session_name"; name: string }
  | { id?: string; type: "export_html"; outputPath?: string }
  // ── State ──
  | { id?: string; type: "get_state" }
  | { id?: string; type: "get_session_stats" }
  | { id?: string; type: "get_messages" }
  | { id?: string; type: "get_last_assistant_text" }
  | { id?: string; type: "get_commands" }
  // ── Model ──
  | { id?: string; type: "set_model"; provider: string; modelId: string }
  | { id?: string; type: "get_available_models" }
  | { id?: string; type: "cycle_model" }
  // ── Thinking ──
  | { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
  | { id?: string; type: "cycle_thinking_level" }
  // ── Queue mode ──
  | { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }
  // ── Compaction ──
  | { id?: string; type: "compact"; customInstructions?: string }
  | { id?: string; type: "set_auto_compaction"; enabled: boolean }
  // ── Retry ──
  | { id?: string; type: "set_auto_retry"; enabled: boolean }
  | { id?: string; type: "abort_retry" }
  // ── Bash ──
  | { id?: string; type: "bash"; command: string }
  | { id?: string; type: "abort_bash" };

/** RPC response (generic — we parse data dynamically) */
export interface RpcResponse {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/** RPC get_state response payload (aligned with pi-mono RpcSessionState) */
export interface RpcSessionState {
  model?: unknown;
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

// ============================================================================
// RPC Wire Events (AgentSessionEvent superset — includes AgentEvent + session-level)
// ============================================================================

// The RPC stdout emits AgentSessionEvents, which is a superset of AgentEvent
// (from pi-agent-core). Session-level events like auto_retry, auto_compaction,
// extension_error, and before_agent_start are NOT in AgentEvent — we define
// them here so the gateway can type-check the full wire protocol.

export interface RpcAutoRetryStartEvent {
  type: "auto_retry_start";
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
}

export interface RpcAutoRetryEndEvent {
  type: "auto_retry_end";
  success: boolean;
  attempt: number;
  finalError?: string;
}

export interface RpcAutoCompactionStartEvent {
  type: "auto_compaction_start";
  reason: "threshold" | "overflow";
}

export interface RpcAutoCompactionEndEvent {
  type: "auto_compaction_end";
  result: { summary: string; firstKeptEntryId?: string; tokensBefore?: number; details?: unknown } | null;
  aborted: boolean;
  willRetry: boolean;
}

export interface RpcBeforeAgentStartEvent {
  type: "before_agent_start";
  prompt: string;
  images?: ImageContent[];
  systemPrompt: string;
}

export interface RpcExtensionErrorEvent {
  type: "extension_error";
  extensionPath: string;
  event: string;
  error: string;
}

/** Union of all session-level events that come over the RPC wire but are NOT in AgentEvent */
export type RpcSessionEvent =
  | RpcAutoRetryStartEvent
  | RpcAutoRetryEndEvent
  | RpcAutoCompactionStartEvent
  | RpcAutoCompactionEndEvent
  | RpcBeforeAgentStartEvent
  | RpcExtensionErrorEvent;

/**
 * Full RPC wire event — union of AgentEvent (agent loop level) + RpcSessionEvent (session level).
 * This is what actually comes over stdout in `pi --mode rpc`.
 */
export type RpcWireEvent = AgentEvent | RpcSessionEvent;

// ============================================================================
// Session Types (aligned with OpenClaw session key format)
// ============================================================================

/**
 * Session key format (aligned with OpenClaw):
 *   agent:{agentId}:{channel}:{scope}:{identifier}
 */
export type SessionKey = string;

export interface SessionState {
  sessionKey: SessionKey;
  role: string | null;
  isStreaming: boolean;
  lastActivity: number;
  messageCount: number;
  rpcProcessId: string | null;
  /** Last known chat ID for this session (for direct media delivery) */
  lastChatId?: string;
  /** Channel name extracted from session key or message source */
  lastChannel?: string;
  /** Auto-compaction in progress (to prevent message race) */
  isCompacting?: boolean;
}

// ============================================================================
// Message Types
// ============================================================================

/** Source of an inbound message */
export interface MessageSource {
  channel: string;
  /** Optional channel account id (e.g. telegram account) */
  accountId?: string;
  chatType: "dm" | "group" | "channel" | "thread";
  chatId: string;
  threadId?: string;
  topicId?: string;
  senderId: string;
  senderName?: string;
  guildId?: string;
  /** Target agent ID for routing (cron/delegation). */
  agentId?: string;
  /** Inbound message ID (platform-specific, for pin/reply/react). */
  messageId?: string;
  /** Message timestamp (Unix timestamp in seconds, from platform). */
  timestamp?: number;
}

/** Inbound message dispatched to the agent */
export interface InboundMessage {
  source: MessageSource;
  sessionKey: SessionKey;
  text: string;
  images?: ImageContent[];
  /** Callback to send final reply back to the originating channel */
  respond: (text: string) => Promise<void>;
  /** Callback to show typing indicator */
  setTyping: (typing: boolean) => Promise<void>;
  /** Optional: called on each streaming text delta for live editing */
  onStreamDelta?: (accumulated: string, delta: string) => void;
  /** Optional: called when tool execution starts (for live UI/tool hint rendering) */
  onToolStart?: (toolName: string, args?: Record<string, unknown>, toolCallId?: string) => void;
  /** Optional: called on thinking content delta (for live thinking display) */
  onThinkingDelta?: (accumulated: string, delta: string) => void;
  /** Optional: called when a steer injection occurs — finalize current reply and reset state */
  onSteerInjected?: () => void;
}

/** Attachment in outbound message */
export interface OutboundAttachment {
  type: "image" | "audio" | "file";
  /** Local file path or HTTP(S) URL */
  url: string;
  /** Optional caption for the attachment */
  caption?: string;
}

/** Outbound message sent to a channel */
export interface OutboundMessage {
  channel: string;
  target: string;
  text: string;
  replyTo?: string;
  /** Optional attachments (images, audio, files) */
  attachments?: OutboundAttachment[];
}

// ============================================================================
// WebSocket Protocol (aligned with OpenClaw Gateway Protocol)
// ============================================================================

export type WsFrame =
  | { type: "req"; id: string; method: string; params?: Record<string, unknown> }
  | { type: "res"; id: string; ok: boolean; payload?: unknown; error?: string }
  | { type: "event"; event: string; payload: unknown; seq?: number };

export type GatewayMethod =
  | "connect"
  | "health"
  | "status"
  | "chat.send"
  | "chat.history"
  | "chat.abort"
  | "agent"
  | "sessions.list"
  | "sessions.get"
  | "sessions.compact"
  | "sessions.delete"
  | "plugins.list"
  | "tools.list"
  | "tools.call"
  | "config.get"
  | "config.reload"
  | "models.list"
  | "usage.status";

// ============================================================================
// Logger
// ============================================================================

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const LOG_LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let globalLogLevel = 1; // default: info

export function setLogLevel(level: string) {
  globalLogLevel = LOG_LEVELS[level] ?? 1;
}

export function createLogger(prefix: string): Logger {
  const ts = () => new Date().toISOString().slice(11, 19);
  return {
    debug: (msg, ...args) => { if (globalLogLevel <= 0) console.debug(`${ts()} [${prefix}] ${msg}`, ...args); },
    info: (msg, ...args) => { if (globalLogLevel <= 1) console.info(`${ts()} [${prefix}] ${msg}`, ...args); },
    warn: (msg, ...args) => { if (globalLogLevel <= 2) console.warn(`${ts()} [${prefix}] ${msg}`, ...args); },
    error: (msg, ...args) => console.error(`${ts()} [${prefix}] ${msg}`, ...args),
  };
}
