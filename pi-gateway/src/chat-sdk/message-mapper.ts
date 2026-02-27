/**
 * Message format mapping between chat-sdk and pi-gateway.
 *
 * Converts chat-sdk Thread/Message ↔ gateway InboundMessage/OutboundMessage.
 */

import type { Message, Thread } from "chat";
import type { InboundMessage, MessageSource, ImageContent } from "../core/types.ts";

// ============================================================================
// Session Key
// ============================================================================

/**
 * Build a gateway-compatible session key from chat-sdk context.
 *
 * Format: `agent:{agentId}:{adapterName}:{chatType}:{chatId}`
 */
export function buildSessionKey(
  adapterName: string,
  threadId: string,
  isDM: boolean,
  agentId = "main",
): string {
  const chatType = isDM ? "dm" : "group";
  // Use the threadId as chatId — adapters encode platform-specific data in it
  return `agent:${agentId}:${adapterName}:${chatType}:${threadId}`;
}

// ============================================================================
// Inbound: chat-sdk → gateway
// ============================================================================

/**
 * Build a MessageSource from chat-sdk context.
 */
export function toMessageSource(
  adapterName: string,
  thread: Thread,
  message: Message,
): MessageSource {
  return {
    channel: adapterName,
    chatType: thread.isDM ? "dm" : "group",
    chatId: thread.id,
    senderId: message.author.userId,
    senderName: message.author.fullName || message.author.userName,
    messageId: message.id,
    timestamp: message.metadata.dateSent
      ? Math.floor(message.metadata.dateSent.getTime() / 1000)
      : Math.floor(Date.now() / 1000),
  };
}

/**
 * Extract images from chat-sdk message attachments.
 *
 * Gateway's ImageContent requires `data` (base64) and `mimeType`.
 * We convert attachment data or skip if no data is available.
 */
export function extractImages(message: Message): ImageContent[] {
  if (!message.attachments?.length) return [];

  const results: ImageContent[] = [];
  for (const a of message.attachments) {
    if (a.type !== "image") continue;
    if (a.data) {
      results.push({
        type: "image",
        data: Buffer.from(a.data as unknown as ArrayBuffer).toString("base64"),
        mimeType: a.mimeType ?? "image/png",
      });
    }
  }
  return results;
}

/**
 * Convert a chat-sdk Thread + Message into a gateway InboundMessage.
 *
 * The `respond` and `setTyping` callbacks are wired to the chat-sdk adapter.
 */
export function toInboundMessage(
  adapterName: string,
  thread: Thread,
  message: Message,
  callbacks: {
    respond: (text: string) => Promise<void>;
    setTyping: (active: boolean) => Promise<void>;
    onStreamDelta?: (accumulated: string, delta?: string) => void;
    onThinkingDelta?: (accumulated: string, delta: string) => void;
    onToolStart?: (toolName: string, args?: Record<string, unknown>, toolCallId?: string) => void;
    onSteerInjected?: () => void;
  },
): InboundMessage {
  const source = toMessageSource(adapterName, thread, message);
  const sessionKey = buildSessionKey(adapterName, thread.id, thread.isDM);
  const images = extractImages(message);

  return {
    source,
    sessionKey,
    text: message.text,
    images: images.length > 0 ? images : undefined,
    respond: callbacks.respond,
    setTyping: callbacks.setTyping,
    onStreamDelta: callbacks.onStreamDelta,
    onThinkingDelta: callbacks.onThinkingDelta,
    onToolStart: callbacks.onToolStart,
    onSteerInjected: callbacks.onSteerInjected,
  };
}

// ============================================================================
// Streaming callbacks factory
// ============================================================================

/**
 * Content sequence item for building live streaming text.
 */
export interface StreamContentItem {
  type: "tool" | "thinking" | "text";
  content: string;
}

/**
 * Options for creating streaming callbacks.
 */
export interface StreamingCallbackOptions {
  /** Suppress intermediate edits (concise mode) */
  concise?: boolean;
  /** Minimum ms between edits (default: 1000) */
  editThrottleMs?: number;
  /** Minimum chars before first streaming edit (default: 800) */
  streamStartChars?: number;
}

/**
 * Build a formatted live text from content sequence items.
 */
export function buildStreamingText(items: StreamContentItem[]): string {
  const parts: string[] = [];
  for (const item of items) {
    if (item.type === "tool") {
      parts.push(item.content);
    } else if (item.type === "thinking") {
      const truncated = item.content.length > 1024
        ? item.content.slice(-1024) + "..."
        : item.content;
      parts.push(`💭 ${truncated}\n---`);
    } else if (item.type === "text") {
      parts.push(item.content);
    }
  }
  return parts.join("\n\n");
}

/**
 * Format a tool start notification line.
 */
export function formatToolLine(toolName: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) {
    return `🔧 ${toolName}()`;
  }
  const summary = Object.entries(args)
    .slice(0, 3)
    .map(([k, v]) => {
      const val = typeof v === "string"
        ? (v.length > 60 ? v.slice(0, 60) + "…" : v)
        : JSON.stringify(v)?.slice(0, 60) ?? "";
      return `${k}=${val}`;
    })
    .join(", ");
  return `🔧 ${toolName}(${summary})`;
}

/**
 * Create streaming callbacks that update a message via adapter.editMessage.
 *
 * Returns callbacks for onStreamDelta, onThinkingDelta, onToolStart, and onSteerInjected
 * that maintain a content sequence and push live updates.
 */
export function createStreamingCallbacks(
  editFn: (text: string) => Promise<boolean>,
  opts: StreamingCallbackOptions = {},
): {
  onStreamDelta: (accumulated: string, delta?: string) => void;
  onThinkingDelta: (accumulated: string, delta: string) => void;
  onToolStart: (toolName: string, args?: Record<string, unknown>, toolCallId?: string) => void;
  onSteerInjected: () => void;
  getContentSequence: () => StreamContentItem[];
} {
  const contentSequence: StreamContentItem[] = [];
  const seenToolCalls = new Set<string>();
  const throttleMs = opts.editThrottleMs ?? 1000;
  const startChars = opts.streamStartChars ?? 800;
  const concise = opts.concise ?? false;

  let lastEditAt = 0;
  let editInFlight = false;
  let lastStreamAccumLen = 0;
  let toolCallSinceLastText = false;
  let throttleBackoff = 0;

  const pushUpdate = () => {
    if (concise) return;
    const text = buildStreamingText(contentSequence);
    if (!text.trim()) return;

    const now = Date.now();
    const effectiveThrottle = throttleMs + throttleBackoff;
    if (editInFlight || now - lastEditAt < effectiveThrottle) return;

    editInFlight = true;
    editFn(text)
      .then((ok) => {
        lastEditAt = Date.now();
        editInFlight = false;
        if (!ok) {
          // Possible 429 — back off
          throttleBackoff = Math.min(throttleBackoff + 500, 5000);
        } else {
          throttleBackoff = Math.max(0, throttleBackoff - 100);
        }
      })
      .catch(() => {
        editInFlight = false;
        throttleBackoff = Math.min(throttleBackoff + 1000, 5000);
      });
  };

  return {
    onStreamDelta: (accumulated: string, delta?: string) => {
      if (concise) return;
      const textDelta = delta ?? accumulated.slice(lastStreamAccumLen);
      lastStreamAccumLen = accumulated.length;
      if (!textDelta) return;

      if (toolCallSinceLastText) {
        contentSequence.push({ type: "text", content: textDelta });
        toolCallSinceLastText = false;
      } else {
        const lastTextIndex = contentSequence.findLastIndex(c => c.type === "text");
        if (lastTextIndex >= 0) {
          contentSequence[lastTextIndex]!.content += textDelta;
        } else {
          contentSequence.push({ type: "text", content: textDelta });
        }
      }

      if (accumulated.length < startChars && contentSequence.length <= 1) return;
      pushUpdate();
    },

    onThinkingDelta: (accumulated: string, _delta: string) => {
      if (concise) return;
      const thinkIdx = contentSequence.findIndex(c => c.type === "thinking");
      if (thinkIdx >= 0) {
        contentSequence[thinkIdx]!.content = accumulated;
      } else {
        contentSequence.push({ type: "thinking", content: accumulated });
      }
      pushUpdate();
    },

    onToolStart: (toolName: string, args?: Record<string, unknown>, toolCallId?: string) => {
      if (concise) return;
      if (toolCallId) {
        if (seenToolCalls.has(toolCallId)) return;
        seenToolCalls.add(toolCallId);
      }
      const line = formatToolLine(toolName, args);
      contentSequence.push({ type: "tool", content: line });
      toolCallSinceLastText = true;
      pushUpdate();
    },

    onSteerInjected: () => {
      // Reset state for next reply cycle
      contentSequence.length = 0;
      seenToolCalls.clear();
      lastStreamAccumLen = 0;
      toolCallSinceLastText = false;
      throttleBackoff = 0;
    },

    getContentSequence: () => contentSequence,
  };
}

// ============================================================================
// Outbound: gateway → chat-sdk
// ============================================================================

/**
 * Convert gateway outbound text to a chat-sdk AdapterPostableMessage.
 *
 * If parseMode is specified, wraps accordingly; otherwise sends as markdown.
 */
export function toPostableMessage(
  text: string,
  parseMode?: "Markdown" | "HTML" | "plain",
): string | { markdown: string } | { raw: string } {
  if (!parseMode || parseMode === "Markdown") {
    return { markdown: text };
  }
  // HTML and plain are passed through as raw
  return { raw: text };
}
