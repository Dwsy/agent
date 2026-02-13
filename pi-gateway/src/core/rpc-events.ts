/**
 * RPC Event type helpers — typed access to AgentEvent fields.
 *
 * The upstream AgentEvent (from pi-agent-core) is a discriminated union,
 * but RPC transport may serialize with snake_case keys. These helpers
 * provide safe, typed extraction without `as any`.
 */

import type { AgentEvent, AssistantMessageEvent, AgentMessage } from "./types.ts";

// ── Narrowed event types (extract from the discriminated union) ─────────

export type MessageUpdateEvent = Extract<AgentEvent, { type: "message_update" }>;
export type ToolExecutionStartEvent = Extract<AgentEvent, { type: "tool_execution_start" }>;
export type ToolExecutionEndEvent = Extract<AgentEvent, { type: "tool_execution_end" }>;
export type AgentEndEvent = Extract<AgentEvent, { type: "agent_end" }>;
export type MessageEndEvent = Extract<AgentEvent, { type: "message_end" }>;

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
