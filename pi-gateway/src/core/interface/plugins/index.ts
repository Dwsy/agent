/**
 * Interface Layer - Plugin System
 *
 * Plugin interfaces exposed to external plugins.
 */

export type {
  // Re-exports from domain
  SessionKey,
  MessageSource,
  InboundMessage,
  Logger,
  PluginMetadata,
  PluginStatus,
  HookHandler,
  Result,
} from "../../domain/types.ts";

export type {
  // Channel Plugin
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
  StreamPlaceholderOpts,
  StreamEditOpts,
  StreamingConfig,
  ChannelStreamingAdapter,
  AccessCheckContext,
  AccessResult,
  ChannelSecurityAdapter,
  ChannelPlugin,
  // Tool Plugin
  ToolContext,
  ToolResult,
  ToolPlugin,
  // Background Service
  BackgroundService,
  // Commands
  CommandContext,
  CommandHandler,
  CliCommandHandler,
  CliProgram,
  // HTTP/WebSocket
  HttpHandler,
  WsMethodHandler,
  // Gateway API
  DispatchResult,
  OutboundMessage,
  PluginManifest,
  GatewayPluginApi,
  SessionState,
  SessionStats,
  RpcState,
  RpcModelInfo,

  // Hooks
  PluginHookName,
  HookPayload,
  TypedHookHandler,
} from "./types.ts";
