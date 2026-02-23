/**
 * Domain Layer - Core Business Logic
 *
 * The innermost layer of Clean Architecture.
 * Contains pure business logic with no external dependencies.
 *
 * Rules:
 * - No imports from application/, infrastructure/, or interface/
 * - No framework-specific code
 * - No I/O operations
 * - Only pure TypeScript types and interfaces
 */

export type {
  // Session
  SessionKey,
  SessionState,
  MessageChannel,
  ChatType,
  MessageSource,
  InboundMessage,
  // Logging
  LogLevel,
  Logger,
  // Cron
  ScheduleKind,
  CronSchedule,
  CronDeliveryMode,
  CronDelivery,
  CronJob,
  // Plugin (from types.ts)
  PluginStatus,
  PluginMetadata,
  Plugin,
  PluginApi,
  HookContext,
  HookHandler,
  ToolDefinition,
  PluginEvent,
  GatewayEvent,
  GatewayEventType,
  Optional,
  Result,
} from "./types.ts";

export type {
  // Plugin (from plugins/)
  PluginConfigApi,
  ToolHandler,
  ToolParameter,
  PluginConstructor,
  PluginFactory,
  PluginEventType,
  PluginLoadResult,
  PluginLoadError,
} from "./plugins/index.ts";

export type {
  // Config
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
} from "./config/entities.ts";

export type {
  SessionRepository,
  SessionRepositoryOptions,
  SessionRepositoryFactory,
  SessionLookupCriteria,
  QueryableSessionRepository,
  SessionRepositoryEvent,
  SessionRepositoryEventHandler,
  ObservableSessionRepository,
} from "./session/repository.ts";
