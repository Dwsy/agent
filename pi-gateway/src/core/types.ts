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

/** RPC commands we actually use (subset of pi-mono's RpcCommand) */
export type RpcCommand =
  | { id?: string; type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
  | { id?: string; type: "steer"; message: string }
  | { id?: string; type: "follow_up"; message: string }
  | { id?: string; type: "abort" }
  | { id?: string; type: "new_session"; parentSession?: string }
  | { id?: string; type: "get_state" }
  | { id?: string; type: "set_model"; provider: string; modelId: string }
  | { id?: string; type: "get_available_models" }
  | { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
  | { id?: string; type: "compact"; customInstructions?: string }
  | { id?: string; type: "set_auto_compaction"; enabled: boolean }
  | { id?: string; type: "set_auto_retry"; enabled: boolean }
  | { id?: string; type: "abort_retry" }
  | { id?: string; type: "cycle_model" }
  | { id?: string; type: "cycle_thinking_level" }
  | { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "get_session_stats" }
  | { id?: string; type: "get_messages" }
  | { id?: string; type: "get_last_assistant_text" };

/** RPC response (generic — we parse data dynamically) */
export interface RpcResponse {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

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
}

// ============================================================================
// Message Types
// ============================================================================

/** Source of an inbound message */
export interface MessageSource {
  channel: string;
  chatType: "dm" | "group" | "channel" | "thread";
  chatId: string;
  threadId?: string;
  topicId?: string;
  senderId: string;
  senderName?: string;
  guildId?: string;
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
}

/** Outbound message sent to a channel */
export interface OutboundMessage {
  channel: string;
  target: string;
  text: string;
  replyTo?: string;
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
  | "plugins.list"
  | "config.get";

// ============================================================================
// Logger
// ============================================================================

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export function createLogger(prefix: string): Logger {
  const ts = () => new Date().toISOString().slice(11, 19);
  return {
    debug: (msg, ...args) => console.debug(`${ts()} [${prefix}] ${msg}`, ...args),
    info: (msg, ...args) => console.info(`${ts()} [${prefix}] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`${ts()} [${prefix}] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`${ts()} [${prefix}] ${msg}`, ...args),
  };
}
