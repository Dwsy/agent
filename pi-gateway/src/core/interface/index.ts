/**
 * Interface Layer - External Adapters
 *
 * Adapts external interactions to the application layer.
 * Contains HTTP handlers, WebSocket handlers, plugin interfaces, etc.
 *
 * Dependencies:
 * - Depends on application layer (uses ports)
 * - Depends on domain layer (uses types)
 */

// ============================================================================
// System Prompts Plugin Interface
// ============================================================================

export {
  // Types
  type GatewayIdentityContext,
  type PromptFeatureFlags,
  type ISystemPromptSegment,
  type SegmentConstructor,
  type PluginSystemPromptSegment,
  type RegistryEntry,
  type BuildResult,
  type BuilderOptions,
  // Constants
  SegmentPriority,
  // Base classes
  BaseSegment,
  StaticSegment,
  ConditionalSegment,
  // Segments
  IdentitySegment,
  HeartbeatSegment,
  CronSegment,
  MediaSegment,
  DelegationSegment,
  ChannelSegment,
  getBuiltinSegments,
  // Registry
  SegmentRegistry,
  registry,
  registerSegment,
  registerSystemPromptSegment,
  getActiveSegments,
  // Builder
  SystemPromptBuilder,
  buildGatewaySystemPrompt,
  buildGatewaySystemPromptWithMetadata,
} from "./plugins/system-prompts/index.ts";

// Plugin System Interfaces
export type {
  // Domain re-exports
  SessionKey,
  MessageSource,
  InboundMessage,
  Logger,
  PluginMetadata,
  PluginStatus,
  Result,
  // Channel Plugin
  DmPolicy,
  CapabilitySupportLevel,
  StreamingSupportMode,
  ChannelCapabilityMatrix,
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
} from "./plugins/index.ts";

// ============================================================================
// Extension UI
// ============================================================================

// To be implemented:
// export { ExtensionUIForwarder } from "./extension-ui/forwarder.ts";
// export type { ExtensionUIResponse } from "./extension-ui/types.ts";

// ============================================================================
// HTTP Interface
// ============================================================================

// To be implemented:
// export { createHttpServer } from "./http/server.ts";
// export { authMiddleware } from "./http/middleware/auth.ts";

// ============================================================================
// WebSocket Interface
// ============================================================================

// To be implemented:
// export { createWebSocketServer } from "./websocket/server.ts";
