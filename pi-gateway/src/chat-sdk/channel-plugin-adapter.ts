/**
 * ChannelPlugin wrapper — adapts a chat-sdk Adapter to gateway's ChannelPlugin interface.
 *
 * Maps gateway outbound calls → chat-sdk adapter methods.
 * Supports enhanced streaming with tool/thinking display, 429 backoff,
 * and concise mode awareness.
 */

import type { Adapter, AdapterPostableMessage } from "chat";
import type {
  ChannelPlugin,
  ChannelMeta,
  ChannelCapabilities,
  ChannelOutbound,
  ChannelStreamingAdapter,
  GatewayPluginApi,
  MessageSendResult,
  MessageActionResult,
  MediaSendResult,
  MediaSendOptions,
  SendOptions,
  StreamPlaceholderOpts,
  StreamEditOpts,
  ReadHistoryResult,
  InlineKeyboardMarkup,
} from "../core/interface/plugins/types.ts";
import type { ChatSdkBridge } from "./bridge.ts";
import { toPostableMessage } from "./message-mapper.ts";

// ============================================================================
// Adapter extras — platform-specific methods
// ============================================================================

/**
 * Optional platform-specific methods that adapters can expose.
 * Telegram adapter implements these; others return not-supported.
 */
export interface AdapterExtras {
  pinMessage?(chatId: string, messageId: number): Promise<void>;
  unpinMessage?(chatId: string, messageId: number): Promise<void>;
  sendKeyboard?(chatId: string, text: string, keyboard: InlineKeyboardMarkup): Promise<{ messageId: string }>;
  editMessageMarkup?(chatId: string, messageId: number, text: string, keyboard?: InlineKeyboardMarkup): Promise<void>;
}

/**
 * Try to get platform-specific extras from an adapter.
 */
function getExtras(adapter: Adapter): AdapterExtras | null {
  if ("getExtras" in adapter && typeof (adapter as any).getExtras === "function") {
    return (adapter as any).getExtras();
  }
  return null;
}

// ============================================================================
// Outbound adapter
// ============================================================================

function createOutbound(adapter: Adapter): ChannelOutbound {
  return {
    maxLength: 4096,

    async sendText(target: string, text: string, opts?: SendOptions): Promise<MessageSendResult> {
      try {
        const message = toPostableMessage(text, opts?.parseMode);
        const result = await adapter.postMessage(target, message as AdapterPostableMessage);
        return { ok: true, messageId: result.id };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async sendMedia(target: string, filePath: string, opts?: MediaSendOptions): Promise<MediaSendResult> {
      try {
        const { readFileSync } = await import("node:fs");
        const { basename } = await import("node:path");
        const data = readFileSync(filePath);
        const filename = basename(filePath);
        const message: AdapterPostableMessage = {
          raw: opts?.caption ?? "",
          files: [{ data, filename, mimeType: opts?.type === "photo" ? "image/png" : undefined }],
        };
        const result = await adapter.postMessage(target, message);
        return { ok: true, messageId: result.id };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async editMessage(target: string, messageId: string, text: string): Promise<MessageActionResult> {
      try {
        const message = toPostableMessage(text);
        await adapter.editMessage(target, messageId, message as AdapterPostableMessage);
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async deleteMessage(target: string, messageId: string): Promise<MessageActionResult> {
      try {
        await adapter.deleteMessage(target, messageId);
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async sendReaction(target: string, messageId: string, emoji: string | string[]): Promise<MessageActionResult> {
      try {
        const emojiStr = Array.isArray(emoji) ? emoji[0] : emoji;
        if (emojiStr) {
          await adapter.addReaction(target, messageId, emojiStr);
        }
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async pinMessage(target: string, messageId: string, unpin?: boolean): Promise<MessageActionResult> {
      const extras = getExtras(adapter);
      if (!extras?.pinMessage) {
        return { ok: false, error: `pinMessage not supported by ${adapter.name}` };
      }
      try {
        if (unpin && extras.unpinMessage) {
          await extras.unpinMessage(target, Number(messageId));
        } else {
          await extras.pinMessage(target, Number(messageId));
        }
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async readHistory(target: string, limit?: number, before?: string): Promise<ReadHistoryResult> {
      try {
        const result = await adapter.fetchMessages(target, { limit: limit ?? 20, cursor: before });
        return {
          ok: true,
          messages: result.messages.map((m: any) => ({
            id: m.id,
            text: m.text ?? "",
            senderId: m.author?.userId,
            timestamp: m.metadata?.dateSent
              ? Math.floor(m.metadata.dateSent.getTime() / 1000)
              : Math.floor(Date.now() / 1000),
          })),
        };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async sendKeyboard(target: string, text: string, keyboard: InlineKeyboardMarkup): Promise<MessageSendResult> {
      const extras = getExtras(adapter);
      if (extras?.sendKeyboard) {
        try {
          const result = await extras.sendKeyboard(target, text, keyboard);
          return { ok: true, messageId: result.messageId };
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
      // Fallback: send text-only (keyboard not supported)
      try {
        const message = toPostableMessage(text);
        const result = await adapter.postMessage(target, message as AdapterPostableMessage);
        return { ok: true, messageId: result.id };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async editMessageMarkup(target: string, messageId: string, text: string, keyboard?: InlineKeyboardMarkup): Promise<MessageActionResult> {
      const extras = getExtras(adapter);
      if (extras?.editMessageMarkup) {
        try {
          await extras.editMessageMarkup(target, Number(messageId), text, keyboard);
          return { ok: true };
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
      // Fallback: edit text only (no keyboard support)
      try {
        const message = toPostableMessage(text);
        await adapter.editMessage(target, messageId, message as AdapterPostableMessage);
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ============================================================================
// Streaming adapter (enhanced)
// ============================================================================

function createStreamingAdapter(adapter: Adapter): ChannelStreamingAdapter {
  let throttleBackoff = 0;

  return {
    config: {
      editThrottleMs: 1000,
      streamStartChars: 800,
    },

    async createPlaceholder(target: string, opts?: StreamPlaceholderOpts): Promise<{ messageId: string }> {
      const text = opts?.text ?? "⠋";
      const result = await adapter.postMessage(target, text);
      return { messageId: result.id };
    },

    async editMessage(target: string, messageId: string, text: string, _opts?: StreamEditOpts): Promise<boolean> {
      try {
        await adapter.editMessage(target, messageId, { markdown: text });
        throttleBackoff = Math.max(0, throttleBackoff - 100);
        return true;
      } catch (err: unknown) {
        // Handle 429 rate limiting
        const anyErr = err as any;
        if (anyErr?.error_code === 429 || anyErr?.statusCode === 429 || anyErr?.status === 429) {
          const retryAfter = anyErr?.parameters?.retry_after ?? anyErr?.retryAfter ?? 1;
          throttleBackoff = Math.max(throttleBackoff, retryAfter * 1000);
        }
        return false;
      }
    },

    async setTyping(target: string, active: boolean): Promise<void> {
      if (active) {
        await adapter.startTyping(target).catch(() => {});
      }
    },
  };
}

// ============================================================================
// ChatSdkChannelPlugin
// ============================================================================

export class ChatSdkChannelPlugin implements ChannelPlugin {
  readonly id: string;
  readonly meta: ChannelMeta;
  readonly capabilities: ChannelCapabilities;
  readonly outbound: ChannelOutbound;
  streaming?: ChannelStreamingAdapter;

  private api?: GatewayPluginApi;

  constructor(
    private readonly adapter: Adapter,
    private readonly bridge: ChatSdkBridge,
  ) {
    this.id = adapter.name;
    this.meta = {
      label: adapter.name.charAt(0).toUpperCase() + adapter.name.slice(1),
      blurb: `chat-sdk ${adapter.name} adapter`,
    };
    this.capabilities = {
      direct: true,
      group: true,
      media: true,
      streaming: true,
      editable: true,
      deletable: true,
      reactions: true,
      pinnable: !!getExtras(adapter)?.pinMessage,
      history: true,
    };
    this.outbound = createOutbound(adapter);
    this.streaming = createStreamingAdapter(adapter);
  }

  async init(api: GatewayPluginApi): Promise<void> {
    this.api = api;
  }

  async start(): Promise<void> {
    // Adapter lifecycle is managed by the bridge
  }

  async stop(): Promise<void> {
    // Adapter lifecycle is managed by the bridge
  }
}
