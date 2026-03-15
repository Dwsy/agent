import type { ChannelStreamingAdapter } from "../../types.ts";
import type { QqbotPluginRuntime } from "./types.ts";
import { sendQqbotNativeStream, sendQqbotText } from "./outbound.ts";
import { deleteQqbotOutbound } from "./actions.ts";

export function createQqbotStreamingAdapter(getRuntime: () => QqbotPluginRuntime | null): ChannelStreamingAdapter {
  return {
    config: {
      editThrottleMs: 1200,
      streamStartChars: 80,
    },
    async createPlaceholder(target, opts) {
      const runtime = getRuntime();
      if (!runtime) throw new Error("QQBot runtime not initialized");
      const result = await sendQqbotText(runtime, target, opts?.text ?? "⏳ Processing...", {
        channelMeta: { qqbotSkipChunking: true },
      });
      if (!result.ok || !result.messageId) throw new Error(result.error || "QQBot placeholder failed");
      runtime.streamPlaceholders.set(target, { target, messageId: result.messageId });
      return { messageId: result.messageId };
    },
    async editMessage(target, messageId, text) {
      const runtime = getRuntime();
      if (!runtime) return false;

      const native = await sendQqbotNativeStream(runtime, target, text, {
        channelMeta: { qqbotSkipChunking: true },
      });
      if (native.ok && native.messageId) {
        runtime.streamPlaceholders.set(target, { target, messageId: native.messageId });
        return true;
      }

      const deleted = await deleteQqbotOutbound(runtime, target, messageId);
      if (!deleted.ok) return false;
      const resent = await sendQqbotText(runtime, target, text, {
        channelMeta: { qqbotSkipChunking: true },
      });
      if (!resent.ok || !resent.messageId) return false;
      runtime.streamPlaceholders.set(target, { target, messageId: resent.messageId });
      return true;
    },
    async setTyping() {
      return;
    },
  };
}
