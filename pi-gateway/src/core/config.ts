/**
 * Configuration system for pi-gateway.
 *
 * Aligned with openclaw.json key structure:
 * - gateway.*        (port, bind, auth)
 * - agent.*          (model, tools, sandbox, pool)
 * - session.*        (dmScope, dataDir)
 * - channels.*       (telegram, discord, ...)
 * - plugins.*        (dirs, disabled)
 * - roles.*          (workspaceDirs)
 * - hooks.*          (enabled, token)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { ThinkingLevel } from "./types.ts";
import { ConfigValidator, type ValidationOptions, type ValidationResult } from "./config-validator.ts";

// ============================================================================
// Config Types
// ============================================================================

export interface GatewayConfig {
  port: number;
  bind: "loopback" | "lan" | "auto";
  /** Log level: "debug" | "info" | "warn" | "error". Default: "info" */
  logLevel?: "debug" | "info" | "warn" | "error";
  auth: {
    mode: "off" | "token" | "password";
    token?: string;
    password?: string;
    /** Must be true to run with mode:"off". Prevents accidental open gateways. */
    allowUnauthenticated?: boolean;
    /** Whether to log auto-generated tokens at startup. Default: true. Set false in production. */
    logToken?: boolean;
  };
  /** Gateway command toggles. */
  commands?: {
    /** Allow agent to restart the gateway process. Default: false */
    restart?: boolean;
  };
}

export interface AgentPoolConfig {
  min: number;
  max: number;
  idleTimeoutMs: number;
  /** Per-message timeout in ms. Default: 120000 (2 min). Moved from agent.timeoutMs. */
  messageTimeoutMs?: number;
}

export interface DelegationConfig {
  /** Timeout for sync delegate_to_agent calls in ms. Default: 120000 */
  timeoutMs: number;
  /** Max allowed timeout (cap for per-call overrides). Default: 600000 (10 min) */
  maxTimeoutMs: number;
  /** Behavior when delegation times out. Default: "abort" */
  onTimeout: "abort" | "return-partial";
  /** Max chain depth for nested delegations (A→B→C). Default: 1 */
  maxDepth: number;
  /** Max concurrent delegations per agent. Default: 2 */
  maxConcurrent: number;
  /** Whitelist of agent IDs allowed as delegation targets. Empty = all allowed. */
  allowAgents?: string[];
}

export interface HeartbeatConfig {
  /** Enable heartbeat. Default: false */
  enabled: boolean;
  /** Interval between heartbeats. Format: "30m", "1h", "5m". Default: "30m" */
  every: string;
  /** Active hours window. Heartbeat skipped outside this range. */
  activeHours?: {
    start: string; // "HH:MM" format, e.g. "08:00"
    end: string; // "HH:MM" format, e.g. "23:00"
    timezone: string; // IANA timezone, e.g. "Asia/Shanghai"
  };
  /** Prompt sent to agent. Default: see DEFAULT_HEARTBEAT_PROMPT */
  prompt: string;
  /** Max chars of remaining text after stripping HEARTBEAT_OK to still suppress. Default: 300 */
  ackMaxChars: number;
  /** Skip heartbeat when session has pending messages. Default: true */
  skipWhenBusy: boolean;
  /** Max retry attempts when no idle RPC available. Default: 2 */
  maxRetries: number;
  /** Delay between retries in ms. Default: 5000 */
  retryDelayMs: number;
  /** Per-message timeout in ms. Default: 60000 */
  messageTimeoutMs?: number;
}

export interface ToolPolicyConfig {
  profile?: "minimal" | "coding" | "messaging" | "full";
  allow?: string[];
  deny?: string[];
  byChannel?: Record<string, { allow?: string[]; deny?: string[] }>;
}

export interface SandboxConfig {
  mode: "off" | "non-main" | "all";
  scope: "session" | "agent" | "shared";
}

export interface AgentRuntimeConfig {
  /** Isolated runtime agent dir (mapped to PI_CODING_AGENT_DIR). */
  agentDir?: string;
  /** Optional isolated package dir (mapped to PI_PACKAGE_DIR). */
  packageDir?: string;
}

// ============================================================================
// Multi-Agent Configuration (v3)
// ============================================================================

export interface DelegationConstraints {
  /** List of agent IDs this agent can delegate to. */
  allowAgents: string[];
  /** Maximum concurrent delegations from this agent. */
  maxConcurrent: number;
  /** Maximum delegation depth (prevent A→B→C chains). */
  maxDepth: number;
}

export interface AgentDefinition {
  /** Unique agent ID (e.g., 'code', 'docs', 'ops'). */
  id: string;
  /** Working directory for this agent. */
  workspace: string;
  /** Model for this agent (optional, uses global default if not set). */
  model?: string;
  /** Role for this agent (optional, uses agentId if not set). */
  role?: string;
  /** Extensions specific to this agent. */
  extensions?: string[];
  /** Skills specific to this agent. */
  skills?: string[];
  /** Delegation constraints for this agent. */
  delegation?: DelegationConstraints;
}

export interface AgentBinding {
  /** Target agent ID. */
  agentId: string;
  /** Match criteria for routing. */
  match: {
    channel?: string;
    accountId?: string;
    guildId?: string;  // Discord specific
    /** Discord member roles constraint (all listed roles must match at least one in source roles set). */
    roles?: string[];
    peer?: {
      kind?: "dm" | "group" | "channel" | "thread";
      id?: string;
    };
    /** Parent peer inheritance (e.g. thread parent channel/topic). */
    parentPeer?: {
      kind?: "group" | "channel";
      id?: string;
    };
  };
}

export interface AgentsConfig {
  /** List of available agents. */
  list: AgentDefinition[];
  /** Default agent ID when no binding matches. */
  default: string;
  /** Static routing bindings. */
  bindings?: AgentBinding[];
}

export interface GatewayPromptsConfig {
  /** Override heartbeat prompt injection. Default: auto (true when heartbeat.enabled). */
  heartbeat?: boolean;
  /** Override cron prompt injection. Default: auto (true when cron.enabled). */
  cron?: boolean;
  /** Override media prompt injection. Default: auto (true when any channel enabled). */
  media?: boolean;
  /** Inject gateway identity prompt (Layer 1). Default: true. */
  identity?: boolean;
  /** Inject channel-specific formatting hints. Default: auto (true when channel active). */
  channel?: boolean;
  /** Inject delegation protocol prompt. Default: auto (true when agents > 1). */
  delegation?: boolean;
  /** Include heartbeat protocol even when heartbeat.enabled=false. Default: false. */
  alwaysHeartbeat?: boolean;
}

export interface ModelFailoverConfig {
  /** Primary model name. */
  primary?: string;
  /** Fallback model names in priority order. */
  fallbacks?: string[];
  /** Max retries before giving up. Default: 1. */
  maxRetries?: number;
  /** Cooldown duration in ms after transient failure. Default: 60000. */
  cooldownMs?: number;
}

export interface AgentConfig {
  model?: string;
  thinkingLevel?: ThinkingLevel;
  piCliPath?: string;
  runtime?: AgentRuntimeConfig;
  /** Model failover configuration. */
  modelFailover?: ModelFailoverConfig;
  /** Replace default system prompt (text or file path). */
  systemPrompt?: string;
  /** Append extra system prompt instructions (text or file path). */
  appendSystemPrompt?: string;
  /** Control gateway-injected protocol prompts. */
  gatewayPrompts?: GatewayPromptsConfig;
  /** Layered base skills (legacy/original pi skills). */
  skillsBase?: string[];
  /** Layered gateway-specific skills (higher priority than base). */
  skillsGateway?: string[];
  /** Explicit extension file/directory paths (mapped to repeated --extension). */
  extensions?: string[];
  /** Explicit skill file/directory paths (mapped to repeated --skill). */
  skills?: string[];
  /** Explicit prompt template file/directory paths (mapped to repeated --prompt-template). */
  promptTemplates?: string[];
  /** Disable extension auto-discovery (explicit extensions still work). */
  noExtensions?: boolean;
  /** Disable skills discovery/loading. */
  noSkills?: boolean;
  /** Disable prompt template discovery/loading. */
  noPromptTemplates?: boolean;
  pool: AgentPoolConfig;
  tools?: ToolPolicyConfig;
  sandbox?: SandboxConfig;
  /** Per-message timeout in milliseconds. Default: 120000 (2 min) */
  timeoutMs?: number;
  /** Message handling mode when agent is already running. Default: "steer" */
  messageMode?: "steer" | "follow-up" | "interrupt";
}

export interface SessionConfig {
  dmScope: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
  dataDir: string;
  /** Auto-resume sessions on restart via --continue. Default: true */
  continueOnRestart?: boolean;
}

export interface TelegramGroupConfig {
  requireMention?: boolean;
  role?: string;
  groupPolicy?: "open" | "disabled" | "allowlist";
  enabled?: boolean;
  allowFrom?: Array<string | number>;
  topics?: Record<string, TelegramTopicConfig>;
  skills?: string[];
  systemPrompt?: string;
  tools?: Record<string, unknown>;
  toolsBySender?: Record<string, unknown>;
}

export interface TelegramTopicConfig {
  requireMention?: boolean;
  role?: string;
  groupPolicy?: "open" | "disabled" | "allowlist";
  enabled?: boolean;
  allowFrom?: Array<string | number>;
  skills?: string[];
  systemPrompt?: string;
}

export interface TelegramProviderCommandsConfig {
  native?: boolean | "auto";
  nativeSkills?: boolean | "auto";
}

export interface TelegramCustomCommand {
  command: string;
  description: string;
}

export interface TelegramDraftChunkConfig {
  minChars?: number;
  maxChars?: number;
  breakPreference?: "newline" | "sentence" | "word";
}

export interface TelegramAccountConfig {
  enabled?: boolean;
  botToken?: string;
  tokenFile?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  groupPolicy?: "open" | "disabled" | "allowlist";
  messageMode?: "steer" | "follow-up" | "interrupt";
  role?: string;
  groups?: Record<string, TelegramGroupConfig>;
  mediaMaxMb?: number;
  /** Audio STT configuration */
  audio?: {
    provider?: "groq" | "openai";
    model?: string;
    apiKey?: string;
    language?: string;
    timeoutSeconds?: number;
  };
  streamMode?: "off" | "partial" | "block";
  replyToMode?: "off" | "first" | "all";
  proxy?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookPath?: string;
  reactionLevel?: "off" | "ack" | "minimal" | "extensive";
  reactionNotifications?: "off" | "own" | "all";
  commands?: TelegramProviderCommandsConfig;
  customCommands?: TelegramCustomCommand[];
  draftChunk?: TelegramDraftChunkConfig;
  textChunkLimit?: number;
  chunkMode?: "length" | "newline";
  linkPreview?: boolean;
  /** @deprecated Legacy streaming config — use streamMode/draftChunk instead */
  streaming?: Record<string, unknown>;
}

export interface TelegramChannelConfig extends TelegramAccountConfig {
  enabled: boolean;
  accounts?: Record<string, TelegramAccountConfig>;
}

export interface DiscordDmConfig {
  enabled: boolean;
  allowFrom?: string[];
}

export interface DiscordGuildConfig {
  requireMention?: boolean;
  role?: string;
  channels?: Record<string, { role?: string }>;
}

export interface DiscordChannelConfig {
  enabled: boolean;
  token?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  role?: string;
  dm?: DiscordDmConfig;
  guilds?: Record<string, DiscordGuildConfig>;
}

export interface WebChatChannelConfig {
  enabled?: boolean;
  /** HMAC secret for signed media URLs */
  mediaSecret?: string;
  /** Media token TTL in ms (default: 3600000 = 1h) */
  mediaTokenTtlMs?: number;
  /** Max upload size in MB (default: 10) */
  mediaMaxMb?: number;
}

export interface ChannelsConfig {
  telegram?: TelegramChannelConfig;
  discord?: DiscordChannelConfig;
  webchat?: WebChatChannelConfig;
  [key: string]: unknown;
}

export interface PluginsConfig {
  dirs?: string[];
  disabled?: string[];
  /**
   * Per-plugin config bag, accessed as api.pluginConfig.
   * Example: plugins.config.myPlugin -> api.pluginConfig for plugin id "myPlugin"
   */
  config?: Record<string, Record<string, unknown>>;
}

export interface RoleCapabilityConfig {
  skills?: string[];
  extensions?: string[];
  promptTemplates?: string[];
}

export interface RolesConfig {
  mergeMode?: "append";
  workspaceDirs?: Record<string, string>;
  capabilities?: Record<string, RoleCapabilityConfig>;
}

export interface HooksConfig {
  enabled: boolean;
  token?: string;
  path?: string;
}

export interface CronDelivery {
  /** Delivery mode. "announce" = direct send via channel outbound, "silent" = log only. Default: "announce" */
  mode: "announce" | "silent";
  /** Target channel. "last" = user's most recent active channel. Default: "last" */
  channel?: string | "last";
  /** Target chatId. If omitted, resolved from agent's most recent session. */
  to?: string;
}

export interface CronJob {
  id: string;
  schedule: { kind: "cron" | "at" | "every"; expr: string; timezone?: string };
  sessionKey?: string;
  payload: { text: string };
  enabled?: boolean;
  /** Target agent ID. Default: config.agents.default */
  agentId?: string;
  /** Result delivery config. String shorthand ("announce"/"silent") or full object. Default: "announce" */
  delivery?: CronDelivery | "announce" | "silent";
  /** Per-job timeout in ms. Default: config.delegation.timeoutMs */
  timeoutMs?: number;
  /** If true, remove job after first execution (for "at" jobs). Default: false */
  deleteAfterRun?: boolean;
  /** If true, job is paused (not scheduled). Default: false */
  paused?: boolean;
}

export interface CronConfig {
  enabled: boolean;
  jobs?: CronJob[];
}

export interface LoggingConfig {
  file: boolean;
  level: "debug" | "info" | "warn" | "error";
  retentionDays: number;
}

export interface QueueConfig {
  /** Max items per session queue. Default: 15 */
  maxPerSession: number;
  /** Max total pending items across all sessions. Default: 100 */
  globalMaxPending: number;
  /** Debounce window for collect mode in ms. Default: 1500 */
  collectDebounceMs: number;
  /** TTL for pool waiting list entries in ms. Default: 30000 */
  poolWaitTtlMs: number;
  /** Queue processing mode. Default: "collect" */
  mode: "collect" | "individual";
  /** Drop policy when queue is full. Default: "summarize" */
  dropPolicy: "summarize" | "old" | "new";
  /** Dedup configuration */
  dedup: {
    enabled: boolean;
    cacheSize: number;
    ttlMs: number;
  };
  /** Priority values by message source */
  priority: {
    dm: number;
    group: number;
    webhook: number;
    allowlistBonus: number;
  };
}

export interface MediaConfig {
  /** Restrict send_media to workspace files only. Default: false (allow any path). */
  workspaceOnly?: boolean;
}

export interface Config {
  gateway: GatewayConfig;
  agent: AgentConfig;
  session: SessionConfig;
  channels: ChannelsConfig;
  plugins: PluginsConfig;
  roles: RolesConfig;
  hooks: HooksConfig;
  cron: CronConfig;
  logging: LoggingConfig;
  queue: QueueConfig;
  /** Delegation configuration for delegate_to_agent (v3). */
  delegation: DelegationConfig;
  /** Multi-agent configuration (v3). */
  agents?: AgentsConfig;
  /** Heartbeat configuration (v3.1). */
  heartbeat?: HeartbeatConfig;
  /** Media send configuration. */
  media?: MediaConfig;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_DATA_DIR = join(homedir(), ".pi", "gateway");

export const DEFAULT_CONFIG: Config = {
  gateway: {
    port: 52134,
    bind: "loopback",
    auth: { mode: "token" },
  },
  agent: {
    piCliPath: "pi",
    thinkingLevel: "off",
    pool: {
      min: 1,
      max: 4,
      idleTimeoutMs: 5 * 60 * 1000,
    },
    tools: { profile: "coding" },
    sandbox: { mode: "off", scope: "session" },
    messageMode: "steer",
  },
  session: {
    dmScope: "main",
    dataDir: join(DEFAULT_DATA_DIR, "sessions"),
  },
  channels: {},
  plugins: {
    dirs: [],
    disabled: [],
    config: {},
  },
  roles: {
    mergeMode: "append",
    workspaceDirs: {},
    capabilities: {},
  },
  hooks: {
    enabled: false,
    path: "/hooks",
  },
  agents: {
    list: [],
    default: "main",
  },
  cron: {
    enabled: false,
    jobs: [],
  },
  logging: {
    file: false,
    level: "info",
    retentionDays: 7,
  },
  queue: {
    maxPerSession: 15,
    globalMaxPending: 100,
    collectDebounceMs: 1500,
    poolWaitTtlMs: 30000,
    mode: "collect",
    dropPolicy: "summarize",
    dedup: {
      enabled: true,
      cacheSize: 1000,
      ttlMs: 60000,
    },
    priority: {
      dm: 10,
      group: 5,
      webhook: 3,
      allowlistBonus: 2,
    },
  },
  delegation: {
    timeoutMs: 120_000,
    maxTimeoutMs: 600_000,
    onTimeout: "abort",
    maxDepth: 1,
    maxConcurrent: 2,
  },
  heartbeat: {
    enabled: true,
    every: "30m",
    prompt: "Read core/heartbeat.md if it exists. Follow it strictly — do not infer or repeat tasks from prior conversations. If nothing needs attention, reply HEARTBEAT_OK.",
    ackMaxChars: 300,
    skipWhenBusy: true,
    maxRetries: 2,
    retryDelayMs: 5000,
    messageTimeoutMs: 60000,
  },
};

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Resolve the config file path.
 * Search order: $PI_GATEWAY_CONFIG > ./pi-gateway.jsonc > ./pi-gateway.json > ~/.pi/gateway/pi-gateway.jsonc > ~/.pi/gateway/pi-gateway.json
 */
export function resolveConfigPath(): string {
  if (process.env.PI_GATEWAY_CONFIG) {
    return process.env.PI_GATEWAY_CONFIG;
  }

  // cwd 优先，.jsonc > .json
  for (const ext of [".jsonc", ".json"]) {
    const p = join(process.cwd(), `pi-gateway${ext}`);
    if (existsSync(p)) return p;
  }

  // fallback 到 ~/.pi/gateway/，.jsonc > .json
  for (const ext of [".jsonc", ".json"]) {
    const p = join(DEFAULT_DATA_DIR, `pi-gateway${ext}`);
    if (existsSync(p)) return p;
  }

  return join(DEFAULT_DATA_DIR, "pi-gateway.jsonc");
}

/**
 * Load and merge configuration from file with defaults.
 *
 * Env override:
 * - PI_GATEWAY_PORT: force gateway port (1-65535)
 */
export function loadConfig(configPath?: string): Config;
/**
 * Load config with validation.
 *
 * @param configPath - Path to config file
 * @param validateOptions - Validation options
 * @returns Object with config and validation result
 */
export function loadConfig(configPath: string | undefined, validateOptions: ValidationOptions & { validate: true }): Promise<{ config: Config; validation: ValidationResult }>;
export function loadConfig(configPath?: string, validateOptions?: ValidationOptions & { validate?: boolean }): Config | Promise<{ config: Config; validation: ValidationResult }> {
  const path = configPath ?? resolveConfigPath();

  let fileConfig: Partial<Config> = {};
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      // Strip JSON5 comments (// and /* */)
      const cleaned = raw
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // Allow trailing commas
        .replace(/,\s*([\]}])/g, "$1");
      fileConfig = JSON.parse(cleaned);
    } catch (err) {
      console.error(`Failed to parse config at ${path}:`, err);
    }
  }

  const migrated = applyConfigMigrations(fileConfig as Record<string, unknown>);
  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    migrated as Record<string, unknown>,
  ) as unknown as Config;

  const envPort = Number.parseInt(process.env.PI_GATEWAY_PORT ?? "", 10);
  if (Number.isInteger(envPort) && envPort > 0 && envPort <= 65535) {
    merged.gateway.port = envPort;
  }

  validateTelegramConfig(merged);

  // Handle validation if requested
  if (validateOptions?.validate) {
    const validator = new ConfigValidator(validateOptions);
    return validator.validate(merged).then(validation => ({
      config: merged,
      validation,
    }));
  }

  return merged;
}

/**
 * Validate a loaded configuration.
 *
 * @param config - The configuration to validate
 * @param options - Validation options
 * @returns Validation result with issues and stats
 */
export async function validateConfig(
  config: Config,
  options?: ValidationOptions,
): Promise<ValidationResult> {
  const validator = new ConfigValidator(options);
  return validator.validate(config);
}

/**
 * Ensure the data directory exists.
 */
export function ensureDataDir(config: Config): void {
  const dirs = [
    dirname(resolveConfigPath()),
    config.session.dataDir,
    join(DEFAULT_DATA_DIR, "credentials"),
    join(DEFAULT_DATA_DIR, "logs"),
    join(DEFAULT_DATA_DIR, "plugins"),
    config.agent.runtime?.agentDir,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  for (const dir of dirs) {
    const resolved = dir.replace(/^~/, homedir());
    if (!existsSync(resolved)) {
      mkdirSync(resolved, { recursive: true });
    }
  }
}

/**
 * Save config to disk.
 */
export function saveConfig(config: Config, configPath?: string): void {
  const path = configPath ?? resolveConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
}

// ============================================================================
// Config Watcher (hot reload)
// ============================================================================

/**
 * Watch config file for changes and reload.
 * Returns a cleanup function to stop watching.
 */
export function watchConfig(configPath: string, onChange: (config: Config) => void): () => void {
  if (!existsSync(configPath)) return () => {};

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const { watch } = require("node:fs") as typeof import("node:fs");

  const watcher = watch(configPath, () => {
    // Debounce rapid changes (editors often write multiple times)
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        const newConfig = loadConfig(configPath);
        onChange(newConfig);
      } catch {
        // Ignore parse errors during save
      }
    }, 500);
  });

  return () => {
    watcher.close();
    if (debounce) clearTimeout(debounce);
  };
}

// ============================================================================
// Helpers
// ============================================================================

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const sv = (source as Record<string, unknown>)[key];
    const tv = result[key];
    if (isPlainObject(sv) && isPlainObject(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else if (sv !== undefined) {
      result[key] = sv;
    }
  }
  return result as T;
}

function applyConfigMigrations(fileConfig: Record<string, unknown>): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(fileConfig ?? {})) as Record<string, unknown>;

  // Legacy: top-level telegram.* -> channels.telegram.*
  const legacyTelegram = cloned.telegram;
  if (legacyTelegram && typeof legacyTelegram === "object") {
    const channels = (cloned.channels && typeof cloned.channels === "object")
      ? cloned.channels as Record<string, unknown>
      : {};
    const existingTg = (channels.telegram && typeof channels.telegram === "object")
      ? channels.telegram as Record<string, unknown>
      : {};
    channels.telegram = { ...legacyTelegram as Record<string, unknown>, ...existingTg };
    cloned.channels = channels;
    delete cloned.telegram;
  }

  const channels = cloned.channels;
  if (!channels || typeof channels !== "object") return cloned;
  const telegram = (channels as Record<string, unknown>).telegram;
  if (!telegram || typeof telegram !== "object") return cloned;

  const tg = telegram as Record<string, unknown>;

  // Legacy: channels.telegram.requireMention -> channels.telegram.groups["*"].requireMention
  if (typeof tg.requireMention === "boolean") {
    const groups = (tg.groups && typeof tg.groups === "object")
      ? tg.groups as Record<string, unknown>
      : {};
    const wildcard = (groups["*"] && typeof groups["*"] === "object")
      ? groups["*"] as Record<string, unknown>
      : {};
    if (typeof wildcard.requireMention !== "boolean") {
      wildcard.requireMention = tg.requireMention;
    }
    groups["*"] = wildcard;
    tg.groups = groups;
    delete tg.requireMention;
  }

  // Legacy: channels.telegram.streaming.* -> streamMode / draftChunk
  if (tg.streaming && typeof tg.streaming === "object") {
    const streaming = tg.streaming as Record<string, unknown>;
    if (typeof tg.streamMode !== "string") {
      tg.streamMode = "partial";
    }
    const draftChunk = (tg.draftChunk && typeof tg.draftChunk === "object")
      ? tg.draftChunk as Record<string, unknown>
      : {};
    if (typeof draftChunk.minChars !== "number" && typeof streaming.streamStartChars === "number") {
      draftChunk.minChars = Math.max(1, Math.floor(streaming.streamStartChars));
    }
    if (Object.keys(draftChunk).length > 0) {
      tg.draftChunk = draftChunk;
    }
    delete tg.streaming;
  }

  (channels as Record<string, unknown>).telegram = tg;
  cloned.channels = channels;
  return cloned;
}

function validateTelegramConfig(config: Config): void {
  const tg = config.channels.telegram;
  if (!tg) return;

  const validateOne = (entry: TelegramAccountConfig, path: string) => {
    if (entry.dmPolicy === "open") {
      const allow = entry.allowFrom?.map((v) => String(v)) ?? [];
      if (!allow.includes("*")) {
        throw new Error(`${path}.dmPolicy=\"open\" requires ${path}.allowFrom to include \"*\"`);
      }
    }
    if (entry.webhookUrl && !entry.webhookSecret && !tg.webhookSecret) {
      throw new Error(`${path}.webhookUrl requires ${path}.webhookSecret or channels.telegram.webhookSecret`);
    }
  };

  validateOne(tg, "channels.telegram");
  for (const [accountId, account] of Object.entries(tg.accounts ?? {})) {
    if (!account) continue;
    validateOne(account, `channels.telegram.accounts.${accountId}`);
  }
}
