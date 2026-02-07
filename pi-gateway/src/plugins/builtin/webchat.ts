/**
 * WebChat channel plugin — built-in, uses Gateway WebSocket.
 *
 * WebChat is handled directly by the Gateway WS protocol (chat.send, chat.history, etc.)
 * This plugin just registers the channel for discoverability.
 */

import type { GatewayPluginApi, ChannelPlugin } from "../types.ts";

const webchatPlugin: ChannelPlugin = {
  id: "webchat",
  meta: {
    label: "WebChat",
    blurb: "Browser-based chat via Gateway WebSocket",
  },
  capabilities: {
    direct: true,
    group: false,
    thread: false,
    media: false,
  },
  outbound: {
    maxLength: Infinity,
    async sendText(_target, _text) {
      // WebChat replies are sent via WS events, not through this method
    },
  },

  async init(_api: GatewayPluginApi) {
    // No-op: WebChat is handled by the Gateway WS protocol
  },

  async start() {
    // No-op
  },

  async stop() {
    // No-op
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(webchatPlugin);
}
