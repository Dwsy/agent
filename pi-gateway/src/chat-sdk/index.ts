/**
 * chat-sdk integration layer for pi-gateway.
 *
 * Bridges the chat-sdk Chat instance + Adapters to gateway's ChannelPlugin system.
 */

export { ChatSdkBridge, type ChatSdkBridgeConfig } from "./bridge.ts";
export { ChatSdkChannelPlugin, type AdapterExtras } from "./channel-plugin-adapter.ts";
export { GatewayStateAdapter } from "./state-adapter.ts";
export {
  buildSessionKey,
  toInboundMessage,
  toMessageSource,
  toPostableMessage,
  extractImages,
  createStreamingCallbacks,
  buildStreamingText,
  formatToolLine,
  type StreamContentItem,
  type StreamingCallbackOptions,
} from "./message-mapper.ts";
export {
  registerChatSdkPlugin,
  type ChatSdkPluginOptions,
} from "./plugin-factory.ts";
export { default as chatSdkPlugin } from "./plugin-factory.ts";
export {
  registerChatSdkCommands,
  getRegisteredCommands,
  type ChatSdkCommand,
} from "./commands.ts";
