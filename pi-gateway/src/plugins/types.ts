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

// Domain plugin types
export type { PluginFactory as DomainPluginFactory } from "../core/domain/plugins/index.ts";

// Import for local use
import type { GatewayPluginApi as _GatewayPluginApi } from "../core/interface/plugins/types.ts";

/** Gateway plugin factory — receives GatewayPluginApi and registers capabilities */
export type PluginFactory = (api: _GatewayPluginApi) => void | Promise<void>;

// Types defined locally (not in Clean Architecture layers yet)
export interface ReloadResult {
  success: boolean;
  pluginId: string;
  error?: string;
  timestamp: number;
}

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
  CommandContext,
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
  StreamPlaceholderOpts,
  StreamEditOpts,
  ChannelStreamingAdapter,
  AccessCheckContext,
  AccessResult,
  ChannelSecurityAdapter,
  CliProgram,
  HookPayload,
} from "../core/interface/plugins/types.ts";
