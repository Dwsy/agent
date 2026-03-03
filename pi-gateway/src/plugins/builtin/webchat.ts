/**
 * WebChat channel plugin — built-in, uses Gateway WebSocket.
 *
 * WebChat is handled directly by the Gateway WS protocol (chat.send, chat.history, etc.)
 * This plugin just registers the channel for discoverability.
 */

import type { GatewayPluginApi, ChannelPlugin } from "../types.ts";
import { sendWebChatMediaEvent } from "../../core/webchat-media.ts";

let apiRef: GatewayPluginApi | null = null;

const webchatPlugin: ChannelPlugin = {
  id: "webchat",
  resolveTarget({ chatId }) {
    return chatId;
  },
  meta: {
    label: "WebChat",
    blurb: "Browser-based chat via Gateway WebSocket",
  },
  capabilities: {
    direct: true,
    group: false,
    thread: false,
    media: true,
    streaming: false,
    security: false,
    reactions: false,
    editable: false,
    deletable: false,
    pinnable: false,
    history: false,
    matrix: {
      messaging: {
        post: true,
        edit: false,
        delete: false,
        fileUpload: "full",
        streaming: "none",
      },
      richContent: {
        cards: "none",
        buttons: "none",
        modals: false,
      },
      conversation: {
        mentions: false,
        reactions: "none",
        dms: true,
        typing: false,
        ephemeral: "none",
      },
      history: {
        fetchMessages: "none",
        fetchSingleMessage: "none",
        fetchThreadInfo: "none",
        fetchChannelMessages: "none",
        listThreads: "none",
        fetchChannelInfo: "none",
        postChannelMessage: "none",
      },
    },
  },
  outbound: {
    maxLength: Infinity,
    async sendText(_target, text, opts) {
      if (!apiRef?.broadcastToWs) {
        return { ok: false, error: "WebChat broadcast is unavailable" };
      }
      const sessionKey = opts?.sessionKey;
      if (!sessionKey) {
        return { ok: false, error: "WebChat sendText requires sessionKey in SendOptions" };
      }
      apiRef.broadcastToWs("message_event", {
        sessionKey,
        type: "text",
        text,
        replyTo: opts?.replyTo ?? null,
        parseMode: opts?.parseMode ?? null,
        timestamp: Date.now(),
      });
      return { ok: true };
    },
    async sendMedia(_target, filePath, opts) {
      if (!apiRef?.broadcastToWs) {
        return { ok: false, error: "WebChat broadcast is unavailable" };
      }
      const sessionKey = opts?.sessionKey;
      if (!sessionKey) {
        return { ok: false, error: "WebChat sendMedia requires sessionKey in SendOptions" };
      }
      const result = sendWebChatMediaEvent(
        apiRef.config,
        apiRef.broadcastToWs.bind(apiRef),
        sessionKey,
        filePath,
        {
          caption: opts?.caption,
          type: opts?.type,
        },
      );
      if (!result.ok) {
        return { ok: false, error: "Media path blocked or file not found" };
      }
      return { ok: true, filePath: result.url };
    },
  },
  // No streaming adapter — WebChat uses WS push (broadcastToWs), not edit-in-place
  // No security adapter — WebChat uses HTTP auth only

  async init(api: GatewayPluginApi) {
    apiRef = api;
  },

  async start() {
    // No-op
  },

  async stop() {
    apiRef = null;
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(webchatPlugin);
}
