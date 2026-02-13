/**
 * RPC Event type helpers — typed access to AgentEvent / RpcWireEvent fields.
 *
 * The upstream AgentEvent (from pi-agent-core) is a discriminated union
 * covering agent-loop events. RPC wire also emits session-level events
 * (auto_retry, auto_compaction, extension_error, before_agent_start)
 * defined as RpcSessionEvent in types.ts.
 *
 * This module provides:
 * 1. Narrowed Extract types for each AgentEvent variant
 * 2. Re-exports of RpcSessionEvent interfaces for direct use
 * 3. Helper functions for safe field extraction across camelCase/snake_case
 */

import type { AgentEvent, AssistantMessageEvent, AgentMessage } from "./types.ts";

// Re-export session-level event types for direct import
export type {
  RpcWireEvent,
  RpcSessionEvent,
  RpcAutoRetryStartEvent,
  RpcAutoRetryEndEvent,
  RpcAutoCompactionStartEvent,
  RpcAutoCompactionEndEvent,
  RpcBeforeAgentStartEvent,
  RpcExtensionErrorEvent,
} from "./types.ts";

// ── Narrowed AgentEvent types (extract from the discriminated union) ────

// Agent lifecycle
export type AgentStartEvent = Extract<AgentEvent, { type: "agent_start" }>;
export type AgentEndEvent = Extract<AgentEvent, { type: "agent_end" }>;

// Turn lifecycle
export type TurnStartEvent = Extract<AgentEvent, { type: "turn_start" }>;
export type TurnEndEvent = Extract<AgentEvent, { type: "turn_end" }>;

// Message lifecycle
export type MessageStartEvent = Extract<AgentEvent, { type: "message_start" }>;
export type MessageUpdateEvent = Extract<AgentEvent, { type: "message_update" }>;
export type MessageEndEvent = Extract<AgentEvent, { type: "message_end" }>;

// Tool execution
export type ToolExecutionStartEvent = Extract<AgentEvent, { type: "tool_execution_start" }>;
export type ToolExecutionUpdateEvent = Extract<AgentEvent, { type: "tool_execution_update" }>;
export type ToolExecutionEndEvent = Extract<AgentEvent, { type: "tool_execution_end" }>;

// ── Snake-case fallback for RPC transport ───────────────────────────────

/** RPC-transported event may carry snake_case `assistant_message_event` */
interface SnakeCaseFallback {
  assistant_message_event?: AssistantMessageEvent;
}

/**
 * Extract AssistantMessageEvent from a message_update event.
 * Handles both camelCase (native) and snake_case (RPC transport) keys.
 */
export function getAssistantMessageEvent(event: MessageUpdateEvent): AssistantMessageEvent | undefined {
  return event.assistantMessageEvent ?? (event as unknown as SnakeCaseFallback).assistant_message_event;
}

/**
 * Safely extract the `partial` field from an AssistantMessageEvent.
 * Not all AME variants carry `partial` (e.g., `done`, `error`).
 */
export function getAmePartial(ame: AssistantMessageEvent | undefined): unknown {
  if (!ame) return undefined;
  return "partial" in ame ? ame.partial : undefined;
}

// ── Type guard for session-level events ─────────────────────────────────

const SESSION_EVENT_TYPES = new Set([
  "auto_retry_start", "auto_retry_end",
  "auto_compaction_start", "auto_compaction_end",
  "before_agent_start", "extension_error",
]);

/** Check if a wire event is a session-level event (not in AgentEvent). */
export function isSessionEvent(event: { type: string }): boolean {
  return SESSION_EVENT_TYPES.has(event.type);
}
