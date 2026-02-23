/**
 * pi-gateway Core Module
 *
 * Clean Architecture layered structure:
 *
 * ```
 *     interface/          ← External adapters (HTTP, WS, plugins)
 *          ↓
 *     application/        ← Use case orchestration
 *          ↓
 *     domain/             ← Business logic (innermost layer)
 *          ↑
 *     infrastructure/     ← External system implementations
 * ```
 *
 * Dependency rule: Dependencies point inward.
 * - domain: No dependencies on other layers
 * - application: Depends only on domain
 * - infrastructure: Depends only on domain
 * - interface: Depends on application and domain
 */

// Domain Layer Exports
export type {
  SessionKey,
  SessionState,
  MessageChannel,
  ChatType,
  MessageSource,
  InboundMessage,
  LogLevel,
  Logger,
  ScheduleKind,
  CronSchedule,
  CronDeliveryMode,
  CronDelivery,
  CronJob,
  PluginStatus,
  PluginMetadata,
  Plugin,
  PluginApi,
  PluginConfigApi,
  HookContext,
  HookHandler,
  ToolDefinition,
  ToolHandler,
  ToolParameter,
  PluginConstructor,
  PluginFactory,
  PluginEvent,
  PluginEventType,
  PluginLoadResult,
  PluginLoadError,
  GatewayEvent,
  GatewayEventType,
  AuthMode,
  BindMode,
  TimeoutBehavior,
  ToolProfile,
  SandboxMode,
  SandboxScope,
  DmScope,
  AuthConfig,
  GatewayCommandsConfig,
  GatewayEntity,
  AgentPoolEntity,
  DelegationEntity,
  ActiveHoursEntity,
  HeartbeatEntity,
  ToolPolicyEntity,
  DelegationConstraintsEntity,
  AgentDefinitionEntity,
  PeerMatchEntity,
  BindingMatchEntity,
  AgentBindingEntity,
  AgentsEntity,
  SessionEntity,
  PluginsEntity,
  RolesEntity,
  ConfigEntity,
  TelegramChannelEntity,
  DiscordChannelEntity,
  ChannelsEntity,
  SessionRepository,
  SessionRepositoryOptions,
  SessionRepositoryFactory,
  SessionLookupCriteria,
  QueryableSessionRepository,
  SessionRepositoryEvent,
  SessionRepositoryEventHandler,
  ObservableSessionRepository,
} from "./domain/index.ts";

// Application Layer Exports
export type {
  MessageHandlerPort,
  MessageProcessingResult,
  MessageHandlingOptions,
  CronHandlerPort,
  CronExecutionResult,
  CommandHandlerPort,
  GatewayCommand,
  CommandResult,
  WebhookHandlerPort,
  WebhookRequest,
  WebhookResponse,
} from "./application/ports/inbound/index.ts";

export type {
  SessionStorePort,
  OutboundMessage,
  MessageSendResult,
  MessageSenderPort,
  RpcCommand,
  RpcResponse,
  RpcPoolPort,
  CronStorePort,
  PluginManagerPort,
  LoggerPort,
  ConfigPort,
} from "./application/ports/outbound/index.ts";

export {
  SessionRouterService,
  type SessionRouterOptions,
  type RoleResolution,
  type RoleSource,
  type AgentRouteResolution,
  type AgentRouteSource,
  MessageDispatcherService,
  type MessageDispatcherOptions,
  HandleInboundMessageUseCase,
  type HandleInboundMessageOptions,
} from "./application/index.ts";

// Infrastructure Layer Exports
export {
  AuthService,
  type AuthServiceOptions,
  type AuthResult,
  safeTokenCompare,
  ExecGuardService,
  type ExecGuardOptions,
  type ExecValidationResult,
  SsrfGuardService,
  type SsrfGuardOptions,
  type SsrfValidationResult,
  SessionStore,
  splitMessage,
  formatDuration,
  parseDuration,
  debounce,
  sleep,
  retry,
  deepMerge,
  pick,
  omit,
} from "./infrastructure/index.ts";

// Interface Layer Exports
export {
  type GatewayIdentityContext,
  type PromptFeatureFlags,
  type ISystemPromptSegment,
  type SegmentConstructor,
  type PluginSystemPromptSegment,
  type RegistryEntry,
  type BuildResult,
  type BuilderOptions,
  SegmentPriority,
  BaseSegment,
  StaticSegment,
  ConditionalSegment,
  IdentitySegment,
  HeartbeatSegment,
  CronSegment,
  MediaSegment,
  DelegationSegment,
  ChannelSegment,
  getBuiltinSegments,
  SegmentRegistry,
  registry,
  registerSegment,
  registerSystemPromptSegment,
  getActiveSegments,
  SystemPromptBuilder,
  buildGatewaySystemPrompt,
  buildGatewaySystemPromptWithMetadata,
  // Plugin System Types
  type GatewayPluginApi,
  type ChannelPlugin,
  type ToolPlugin,
  type ToolContext,
  type ToolResult,
  type BackgroundService,
  type CommandContext,
  type CommandHandler,
  type CliCommandHandler,
  type CliProgram,
  type HttpHandler,
  type WsMethodHandler,
  type DispatchResult,
  type PluginManifest,
  type PluginHookName,
  type HookPayload,
  type TypedHookHandler,
  type DmPolicy,
  type ChannelCapabilities,
  type ChannelMeta,
  type SendOptions,
  type MediaSendOptions,
  type MediaSendResult,
  type ReactionOptions,
  type MessageActionResult,
  type ReadHistoryResult,
  type InlineKeyboardButton,
  type InlineKeyboardMarkup,
  type ChannelOutbound,
  type StreamingConfig,
  type ChannelStreamingAdapter,
  type AccessCheckContext,
  type AccessResult,
  type ChannelSecurityAdapter,
} from "./interface/index.ts";

// Legacy Compatibility Exports (deprecated, will be removed)
// These will gradually migrate to the new architecture exports above
