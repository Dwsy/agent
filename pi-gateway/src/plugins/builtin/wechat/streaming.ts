import type { WechatAccountRuntime } from "./types.ts";
import { sendWechatText } from "./outbound.ts";

/**
 * Weixin does not support native streaming like QQBot.
 * This module provides a placeholder for potential future streaming support
 * via message editing (not currently available in ilink API).
 */

/**
 * Streaming configuration for Weixin.
 * Since Weixin doesn't support native streaming, this is a placeholder.
 */
export interface WechatStreamingAdapter {
  /**
   * Start a streaming placeholder message.
   * In Weixin, we can only send complete messages.
   */
  startStream: (target: string, initialText: string) => Promise<{ ok: boolean; messageId?: string; error?: string }>;

  /**
   * Update a streaming message with new content.
   * Not supported in Weixin - will send a new message instead.
   */
  updateStream: (target: string, messageId: string, text: string) => Promise<{ ok: boolean; error?: string }>;

  /**
   * Finalize a streaming message.
   * In Weixin, this is a no-op since we send complete messages.
   */
  finalizeStream: (target: string, messageId: string, finalText: string) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Create a streaming adapter for Weixin.
 * Note: This is a compatibility shim that doesn't actually stream.
 * It sends complete messages instead.
 */
export function createWechatStreamingAdapter(
  getRuntime: () => WechatAccountRuntime | null
): WechatStreamingAdapter {
  return {
    async startStream(target: string, initialText: string) {
      const runtime = getRuntime();
      if (!runtime) return { ok: false, error: "WeChat not initialized" };

      // Weixin doesn't support streaming, send as complete message
      runtime.api.logger.warn(
        "Weixin streaming not supported, sending complete message"
      );
      return sendWechatText(runtime, target, initialText);
    },

    async updateStream(target: string, messageId: string, text: string) {
      const runtime = getRuntime();
      if (!runtime) return { ok: false, error: "WeChat not initialized" };

      // Weixin doesn't support message editing
      // Log warning and indicate failure
      runtime.api.logger.warn(
        "Weixin message editing not supported, cannot update stream"
      );
      return { ok: false, error: "Weixin does not support message editing" };
    },

    async finalizeStream(target: string, messageId: string, finalText: string) {
      const runtime = getRuntime();
      if (!runtime) return { ok: false, error: "WeChat not initialized" };

      // Weixin doesn't support streaming, just send final message
      // The initial message was already sent in startStream
      // This is a no-op since we can't replace it
      runtime.api.logger.debug(
        "Weixin stream finalize: message already sent, skipping duplicate"
      );
      return { ok: true };
    },
  };
}

/**
 * Export a flag to indicate streaming support status.
 */
export const WECHAT_SUPPORTS_STREAMING = false;

/**
 * Export a flag to indicate message editing support status.
 */
export const WECHAT_SUPPORTS_EDITING = false;
