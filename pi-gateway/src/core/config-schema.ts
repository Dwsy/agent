/**
 * Config Schema Definitions using TypeBox
 * 
 * Provides JSON Schema validation for all configuration sections.
 * @owner Config Validation System (Issue #4)
 */

import { Type, type Static } from "@sinclair/typebox";

// ============================================================================
// Base Types
// ============================================================================

export const LogLevelSchema = Type.Union([
  Type.Literal("debug"),
  Type.Literal("info"),
  Type.Literal("warn"),
  Type.Literal("error"),
]);

export const BindModeSchema = Type.Union([
  Type.Literal("loopback"),
  Type.Literal("lan"),
  Type.Literal("auto"),
]);

export const AuthModeSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("token"),
  Type.Literal("password"),
]);

export const ThinkingLevelSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

export const DmScopeSchema = Type.Union([
  Type.Literal("main"),
  Type.Literal("per-peer"),
  Type.Literal("per-channel-peer"),
  Type.Literal("per-account-channel-peer"),
]);

export const MessageModeSchema = Type.Union([
  Type.Literal("steer"),
  Type.Literal("follow-up"),
  Type.Literal("interrupt"),
]);

export const ToolProfileSchema = Type.Union([
  Type.Literal("minimal"),
  Type.Literal("coding"),
  Type.Literal("messaging"),
  Type.Literal("full"),
]);

export const SandboxModeSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("non-main"),
  Type.Literal("all"),
]);

export const SandboxScopeSchema = Type.Union([
  Type.Literal("session"),
  Type.Literal("agent"),
  Type.Literal("shared"),
]);

export const GroupPolicySchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("disabled"),
  Type.Literal("allowlist"),
]);

export const StreamModeSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("partial"),
  Type.Literal("block"),
]);

export const ReactionLevelSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("ack"),
  Type.Literal("minimal"),
  Type.Literal("extensive"),
]);

export const ReactionNotificationsSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("own"),
  Type.Literal("all"),
]);

export const DmPolicySchema = Type.Union([
  Type.Literal("pairing"),
  Type.Literal("allowlist"),
  Type.Literal("open"),
  Type.Literal("disabled"),
]);

// ============================================================================
// Gateway Config Schema
// ============================================================================

export const GatewayAuthSchema = Type.Object({
  mode: AuthModeSchema,
  token: Type.Optional(Type.String({ minLength: 1 })),
  password: Type.Optional(Type.String({ minLength: 1 })),
  allowUnauthenticated: Type.Optional(Type.Boolean()),
  logToken: Type.Optional(Type.Boolean()),
});

export const GatewayCommandsSchema = Type.Object({
  restart: Type.Optional(Type.Boolean()),
});

export const GatewayConfigSchema = Type.Object({
  port: Type.Integer({ minimum: 1, maximum: 65535 }),
  bind: BindModeSchema,
  logLevel: Type.Optional(LogLevelSchema),
  auth: GatewayAuthSchema,
  commands: Type.Optional(GatewayCommandsSchema),
});

// ============================================================================
// Agent Config Schema
// ============================================================================

export const AgentPoolConfigSchema = Type.Object({
  min: Type.Integer({ minimum: 0, maximum: 100 }),
  max: Type.Integer({ minimum: 1, maximum: 100 }),
  idleTimeoutMs: Type.Integer({ minimum: 1000, maximum: 3600000 }),
  messageTimeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 })),
});

export const ToolPolicyConfigSchema = Type.Object({
  profile: Type.Optional(ToolProfileSchema),
  allow: Type.Optional(Type.Array(Type.String())),
  deny: Type.Optional(Type.Array(Type.String())),
  byChannel: Type.Optional(Type.Record(Type.String(), Type.Object({
    allow: Type.Optional(Type.Array(Type.String())),
    deny: Type.Optional(Type.Array(Type.String())),
  }))),
});

export const SandboxConfigSchema = Type.Object({
  mode: SandboxModeSchema,
  scope: SandboxScopeSchema,
});

export const AgentRuntimeConfigSchema = Type.Object({
  agentDir: Type.Optional(Type.String()),
  packageDir: Type.Optional(Type.String()),
});

export const ModelFailoverConfigSchema = Type.Object({
  primary: Type.Optional(Type.String()),
  fallbacks: Type.Optional(Type.Array(Type.String())),
  maxRetries: Type.Optional(Type.Integer({ minimum: 0, maximum: 10 })),
  cooldownMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 })),
});

export const GatewayPromptsConfigSchema = Type.Object({
  heartbeat: Type.Optional(Type.Union([Type.Boolean(), Type.Literal("auto")])),
  cron: Type.Optional(Type.Union([Type.Boolean(), Type.Literal("auto")])),
  media: Type.Optional(Type.Union([Type.Boolean(), Type.Literal("auto")])),
  identity: Type.Optional(Type.Boolean()),
  channel: Type.Optional(Type.Union([Type.Boolean(), Type.Literal("auto")])),
  delegation: Type.Optional(Type.Union([Type.Boolean(), Type.Literal("auto")])),
  alwaysHeartbeat: Type.Optional(Type.Boolean()),
});

export const AgentConfigSchema = Type.Object({
  model: Type.Optional(Type.String()),
  thinkingLevel: Type.Optional(ThinkingLevelSchema),
  piCliPath: Type.Optional(Type.String()),
  runtime: Type.Optional(AgentRuntimeConfigSchema),
  modelFailover: Type.Optional(ModelFailoverConfigSchema),
  systemPrompt: Type.Optional(Type.String()),
  appendSystemPrompt: Type.Optional(Type.String()),
  gatewayPrompts: Type.Optional(GatewayPromptsConfigSchema),
  skillsBase: Type.Optional(Type.Array(Type.String())),
  skillsGateway: Type.Optional(Type.Array(Type.String())),
  extensions: Type.Optional(Type.Array(Type.String())),
  skills: Type.Optional(Type.Array(Type.String())),
  promptTemplates: Type.Optional(Type.Array(Type.String())),
  noExtensions: Type.Optional(Type.Boolean()),
  noSkills: Type.Optional(Type.Boolean()),
  noPromptTemplates: Type.Optional(Type.Boolean()),
  pool: AgentPoolConfigSchema,
  tools: Type.Optional(ToolPolicyConfigSchema),
  sandbox: Type.Optional(SandboxConfigSchema),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 })),
  messageMode: Type.Optional(MessageModeSchema),
});

// ============================================================================
// Session Config Schema
// ============================================================================

export const SessionConfigSchema = Type.Object({
  dmScope: DmScopeSchema,
  dataDir: Type.String(),
  continueOnRestart: Type.Optional(Type.Boolean()),
});

// ============================================================================
// Channels Config Schema
// ============================================================================

export const TelegramTopicConfigSchema = Type.Object({
  requireMention: Type.Optional(Type.Boolean()),
  role: Type.Optional(Type.String()),
  groupPolicy: Type.Optional(GroupPolicySchema),
  enabled: Type.Optional(Type.Boolean()),
  allowFrom: Type.Optional(Type.Array(Type.Union([Type.String(), Type.Integer()]))),
  skills: Type.Optional(Type.Array(Type.String())),
  systemPrompt: Type.Optional(Type.String()),
});

export const TelegramGroupConfigSchema = Type.Object({
  requireMention: Type.Optional(Type.Boolean()),
  role: Type.Optional(Type.String()),
  groupPolicy: Type.Optional(GroupPolicySchema),
  enabled: Type.Optional(Type.Boolean()),
  allowFrom: Type.Optional(Type.Array(Type.Union([Type.String(), Type.Integer()]))),
  topics: Type.Optional(Type.Record(Type.String(), TelegramTopicConfigSchema)),
  skills: Type.Optional(Type.Array(Type.String())),
  systemPrompt: Type.Optional(Type.String()),
  tools: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  toolsBySender: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const TelegramProviderCommandsConfigSchema = Type.Object({
  native: Type.Optional(Type.Union([Type.Boolean(), Type.Literal("auto")])),
  nativeSkills: Type.Optional(Type.Union([Type.Boolean(), Type.Literal("auto")])),
});

export const TelegramCustomCommandSchema = Type.Object({
  command: Type.String({ minLength: 1 }),
  description: Type.String(),
});

export const TelegramDraftChunkConfigSchema = Type.Object({
  minChars: Type.Optional(Type.Integer({ minimum: 1 })),
  maxChars: Type.Optional(Type.Integer({ minimum: 1 })),
  breakPreference: Type.Optional(Type.Union([
    Type.Literal("newline"),
    Type.Literal("sentence"),
    Type.Literal("word"),
  ])),
});

export const TelegramAudioConfigSchema = Type.Object({
  provider: Type.Optional(Type.Union([Type.Literal("groq"), Type.Literal("openai")])),
  model: Type.Optional(Type.String()),
  apiKey: Type.Optional(Type.String()),
  language: Type.Optional(Type.String()),
  timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
});

export const TelegramAccountConfigSchema = Type.Object({
  enabled: Type.Optional(Type.Boolean()),
  botToken: Type.Optional(Type.String()),
  tokenFile: Type.Optional(Type.String()),
  dmPolicy: Type.Optional(DmPolicySchema),
  allowFrom: Type.Optional(Type.Array(Type.Union([Type.String(), Type.Integer()]))),
  groupAllowFrom: Type.Optional(Type.Array(Type.Union([Type.String(), Type.Integer()]))),
  groupPolicy: Type.Optional(GroupPolicySchema),
  messageMode: Type.Optional(MessageModeSchema),
  role: Type.Optional(Type.String()),
  groups: Type.Optional(Type.Record(Type.String(), TelegramGroupConfigSchema)),
  mediaMaxMb: Type.Optional(Type.Number({ minimum: 0.1, maximum: 50 })),
  audio: Type.Optional(TelegramAudioConfigSchema),
  streamMode: Type.Optional(StreamModeSchema),
  replyToMode: Type.Optional(Type.Union([Type.Literal("off"), Type.Literal("first"), Type.Literal("all")])),
  proxy: Type.Optional(Type.String()),
  webhookUrl: Type.Optional(Type.String({ format: "uri" })),
  webhookSecret: Type.Optional(Type.String()),
  webhookPath: Type.Optional(Type.String()),
  reactionLevel: Type.Optional(ReactionLevelSchema),
  reactionNotifications: Type.Optional(ReactionNotificationsSchema),
  commands: Type.Optional(TelegramProviderCommandsConfigSchema),
  customCommands: Type.Optional(Type.Array(TelegramCustomCommandSchema)),
  draftChunk: Type.Optional(TelegramDraftChunkConfigSchema),
  textChunkLimit: Type.Optional(Type.Integer({ minimum: 1 })),
  chunkMode: Type.Optional(Type.Union([Type.Literal("length"), Type.Literal("newline")])),
  linkPreview: Type.Optional(Type.Boolean()),
});

export const TelegramChannelConfigSchema = Type.Intersect([
  TelegramAccountConfigSchema,
  Type.Object({
    enabled: Type.Boolean(),
    accounts: Type.Optional(Type.Record(Type.String(), TelegramAccountConfigSchema)),
  }),
]);

export const DiscordDmConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  allowFrom: Type.Optional(Type.Array(Type.String())),
});

export const DiscordGuildConfigSchema = Type.Object({
  requireMention: Type.Optional(Type.Boolean()),
  role: Type.Optional(Type.String()),
  channels: Type.Optional(Type.Record(Type.String(), Type.Object({
    role: Type.Optional(Type.String()),
  }))),
});

export const DiscordChannelConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  token: Type.Optional(Type.String()),
  dmPolicy: Type.Optional(DmPolicySchema),
  role: Type.Optional(Type.String()),
  dm: Type.Optional(DiscordDmConfigSchema),
  guilds: Type.Optional(Type.Record(Type.String(), DiscordGuildConfigSchema)),
});

export const WebChatChannelConfigSchema = Type.Object({
  enabled: Type.Optional(Type.Boolean()),
  mediaSecret: Type.Optional(Type.String()),
  mediaTokenTtlMs: Type.Optional(Type.Integer({ minimum: 60000, maximum: 86400000 })),
  mediaMaxMb: Type.Optional(Type.Number({ minimum: 0.1, maximum: 100 })),
});

export const ChannelsConfigSchema = Type.Object({
  telegram: Type.Optional(TelegramChannelConfigSchema),
  discord: Type.Optional(DiscordChannelConfigSchema),
  webchat: Type.Optional(WebChatChannelConfigSchema),
});

// ============================================================================
// Plugins Config Schema
// ============================================================================

export const PluginsConfigSchema = Type.Object({
  dirs: Type.Optional(Type.Array(Type.String())),
  disabled: Type.Optional(Type.Array(Type.String())),
  config: Type.Optional(Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown()))),
});

// ============================================================================
// Roles Config Schema
// ============================================================================

export const RoleCapabilityConfigSchema = Type.Object({
  skills: Type.Optional(Type.Array(Type.String())),
  extensions: Type.Optional(Type.Array(Type.String())),
  promptTemplates: Type.Optional(Type.Array(Type.String())),
});

export const RolesConfigSchema = Type.Object({
  mergeMode: Type.Optional(Type.Literal("append")),
  workspaceDirs: Type.Optional(Type.Record(Type.String(), Type.String())),
  capabilities: Type.Optional(Type.Record(Type.String(), RoleCapabilityConfigSchema)),
});

// ============================================================================
// Hooks Config Schema
// ============================================================================

export const HooksConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  token: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
});

// ============================================================================
// Cron Config Schema
// ============================================================================

export const CronScheduleSchema = Type.Object({
  kind: Type.Union([Type.Literal("cron"), Type.Literal("at"), Type.Literal("every")]),
  expr: Type.String({ minLength: 1 }),
  timezone: Type.Optional(Type.String()),
});

export const CronDeliverySchema = Type.Object({
  mode: Type.Union([Type.Literal("announce"), Type.Literal("silent")]),
  channel: Type.Optional(Type.Union([Type.String(), Type.Literal("last")])),
  to: Type.Optional(Type.String()),
});

export const CronJobSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  schedule: CronScheduleSchema,
  sessionKey: Type.Optional(Type.String()),
  payload: Type.Object({
    text: Type.String({ minLength: 1 }),
  }),
  enabled: Type.Optional(Type.Boolean()),
  agentId: Type.Optional(Type.String()),
  delivery: Type.Optional(Type.Union([CronDeliverySchema, Type.Literal("announce"), Type.Literal("silent")])),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000 })),
  deleteAfterRun: Type.Optional(Type.Boolean()),
  paused: Type.Optional(Type.Boolean()),
});

export const CronConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  jobs: Type.Optional(Type.Array(CronJobSchema)),
});

// ============================================================================
// Logging Config Schema
// ============================================================================

export const LoggingConfigSchema = Type.Object({
  file: Type.Boolean(),
  level: LogLevelSchema,
  retentionDays: Type.Integer({ minimum: 1, maximum: 365 }),
});

// ============================================================================
// Queue Config Schema
// ============================================================================

export const QueueDedupConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  cacheSize: Type.Integer({ minimum: 100, maximum: 10000 }),
  ttlMs: Type.Integer({ minimum: 1000, maximum: 600000 }),
});

export const QueuePriorityConfigSchema = Type.Object({
  dm: Type.Integer({ minimum: 0, maximum: 100 }),
  group: Type.Integer({ minimum: 0, maximum: 100 }),
  webhook: Type.Integer({ minimum: 0, maximum: 100 }),
  allowlistBonus: Type.Integer({ minimum: 0, maximum: 100 }),
});

export const QueueConfigSchema = Type.Object({
  maxPerSession: Type.Integer({ minimum: 1, maximum: 100 }),
  globalMaxPending: Type.Integer({ minimum: 1, maximum: 500 }),
  collectDebounceMs: Type.Integer({ minimum: 0, maximum: 10000 }),
  poolWaitTtlMs: Type.Integer({ minimum: 1000, maximum: 120000 }),
  mode: Type.Union([Type.Literal("collect"), Type.Literal("individual")]),
  dropPolicy: Type.Union([Type.Literal("summarize"), Type.Literal("old"), Type.Literal("new")]),
  dedup: QueueDedupConfigSchema,
  priority: QueuePriorityConfigSchema,
});

// ============================================================================
// Delegation Config Schema
// ============================================================================

export const DelegationConfigSchema = Type.Object({
  timeoutMs: Type.Integer({ minimum: 1000, maximum: 600000 }),
  maxTimeoutMs: Type.Integer({ minimum: 1000, maximum: 3600000 }),
  onTimeout: Type.Union([Type.Literal("abort"), Type.Literal("return-partial")]),
  maxDepth: Type.Integer({ minimum: 0, maximum: 5 }),
  maxConcurrent: Type.Integer({ minimum: 1, maximum: 20 }),
  allowAgents: Type.Optional(Type.Array(Type.String())),
});

// ============================================================================
// Agents Config Schema (Multi-Agent v3)
// ============================================================================

export const DelegationConstraintsSchema = Type.Object({
  allowAgents: Type.Array(Type.String()),
  maxConcurrent: Type.Integer({ minimum: 1, maximum: 20 }),
  maxDepth: Type.Integer({ minimum: 0, maximum: 5 }),
});

export const AgentDefinitionSchema = Type.Object({
  id: Type.String({ minLength: 1, pattern: "^[a-zA-Z0-9_-]+$" }),
  workspace: Type.String(),
  model: Type.Optional(Type.String()),
  role: Type.Optional(Type.String()),
  extensions: Type.Optional(Type.Array(Type.String())),
  skills: Type.Optional(Type.Array(Type.String())),
  delegation: Type.Optional(DelegationConstraintsSchema),
});

export const AgentBindingSchema = Type.Object({
  agentId: Type.String(),
  match: Type.Object({
    channel: Type.Optional(Type.String()),
    accountId: Type.Optional(Type.String()),
    guildId: Type.Optional(Type.String()),
    roles: Type.Optional(Type.Array(Type.String())),
    peer: Type.Optional(Type.Object({
      kind: Type.Optional(Type.Union([
        Type.Literal("dm"),
        Type.Literal("group"),
        Type.Literal("channel"),
        Type.Literal("thread"),
      ])),
      id: Type.Optional(Type.String()),
    })),
    parentPeer: Type.Optional(Type.Object({
      kind: Type.Optional(Type.Union([Type.Literal("group"), Type.Literal("channel")])),
      id: Type.Optional(Type.String()),
    })),
  }),
});

export const AgentsConfigSchema = Type.Object({
  list: Type.Array(AgentDefinitionSchema),
  default: Type.String(),
  bindings: Type.Optional(Type.Array(AgentBindingSchema)),
});

// ============================================================================
// Heartbeat Config Schema
// ============================================================================

export const HeartbeatActiveHoursSchema = Type.Object({
  start: Type.String({ pattern: "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" }),
  end: Type.String({ pattern: "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" }),
  timezone: Type.String(),
});

export const HeartbeatConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  every: Type.String({ minLength: 1 }),
  activeHours: Type.Optional(HeartbeatActiveHoursSchema),
  prompt: Type.String(),
  ackMaxChars: Type.Integer({ minimum: 0, maximum: 1000 }),
  skipWhenBusy: Type.Boolean(),
  maxRetries: Type.Integer({ minimum: 0, maximum: 10 }),
  retryDelayMs: Type.Integer({ minimum: 100, maximum: 60000 }),
  messageTimeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 })),
});

// ============================================================================
// Media Config Schema
// ============================================================================

export const MediaConfigSchema = Type.Object({
  workspaceOnly: Type.Optional(Type.Boolean()),
});

// ============================================================================
// Root Config Schema
// ============================================================================

export const ConfigSchema = Type.Object({
  gateway: GatewayConfigSchema,
  agent: AgentConfigSchema,
  session: SessionConfigSchema,
  channels: ChannelsConfigSchema,
  plugins: PluginsConfigSchema,
  roles: RolesConfigSchema,
  hooks: HooksConfigSchema,
  cron: CronConfigSchema,
  logging: LoggingConfigSchema,
  queue: QueueConfigSchema,
  delegation: DelegationConfigSchema,
  agents: Type.Optional(AgentsConfigSchema),
  heartbeat: Type.Optional(HeartbeatConfigSchema),
  media: Type.Optional(MediaConfigSchema),
});

// ============================================================================
// Type Exports
// ============================================================================

export type GatewayConfigType = Static<typeof GatewayConfigSchema>;
export type AgentConfigType = Static<typeof AgentConfigSchema>;
export type SessionConfigType = Static<typeof SessionConfigSchema>;
export type ChannelsConfigType = Static<typeof ChannelsConfigSchema>;
export type PluginsConfigType = Static<typeof PluginsConfigSchema>;
export type RolesConfigType = Static<typeof RolesConfigSchema>;
export type HooksConfigType = Static<typeof HooksConfigSchema>;
export type CronConfigType = Static<typeof CronConfigSchema>;
export type LoggingConfigType = Static<typeof LoggingConfigSchema>;
export type QueueConfigType = Static<typeof QueueConfigSchema>;
export type DelegationConfigType = Static<typeof DelegationConfigSchema>;
export type AgentsConfigType = Static<typeof AgentsConfigSchema>;
export type HeartbeatConfigType = Static<typeof HeartbeatConfigSchema>;
export type MediaConfigType = Static<typeof MediaConfigSchema>;
export type ConfigType = Static<typeof ConfigSchema>;
