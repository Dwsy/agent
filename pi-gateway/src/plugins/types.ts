/**
 * Plugin system type definitions.
 *
 * @deprecated This file is kept for backward compatibility.
 * Please import from "../core/index.ts" instead.
 */

// Re-export all plugin types from the new Clean Architecture location
export type {
  // Domain types
  SessionKey,
  SessionState,
  InboundMessage,
  Logger,
  PluginMetadata,
  PluginStatus,
  HookHandler,
  PluginApi,
  ToolDefinition,
} from "../core/index.ts";

// Export Config from domain
export type { ConfigEntity as Config } from "../core/domain/config/entities.ts";

// Re-export all interface layer plugin types
export type {
  GatewayPluginApi,
  PluginManifest,
  PluginHookName,
  ChannelPlugin,
  ToolPlugin,
  ToolContext,
  ToolResult,
  BackgroundService,
  CommandHandler,
  HttpHandler,
  WsMethodHandler,
  DispatchResult,
  OutboundMessage,
  DmPolicy,
  ChannelCapabilities,
  ChannelMeta,
  SendOptions,
  MediaSendOptions,
  MessageSendResult,
  MediaSendResult,
  ReactionOptions,
  MessageActionResult,
  ReadHistoryResult,
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  ChannelOutbound,
  StreamingConfig,
  ChannelStreamingAdapter,
  AccessCheckContext,
  AccessResult,
  ChannelSecurityAdapter,
} from "../core/interface/plugins/types.ts";
