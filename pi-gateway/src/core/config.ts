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

// ============================================================================
// Config Types
// ============================================================================

export interface GatewayConfig {
  port: number;
  bind: "loopback" | "lan" | "auto";
  auth: {
    mode: "off" | "token" | "password";
    token?: string;
    password?: string;
  };
}

export interface AgentPoolConfig {
  min: number;
  max: number;
  idleTimeoutMs: number;
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

export interface AgentConfig {
  model?: string;
  thinkingLevel?: ThinkingLevel;
  piCliPath?: string;
  runtime?: AgentRuntimeConfig;
  /** Replace default system prompt (text or file path). */
  systemPrompt?: string;
  /** Append extra system prompt instructions (text or file path). */
  appendSystemPrompt?: string;
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
}

export interface SessionConfig {
  dmScope: "main" | "per-peer" | "per-channel-peer";
  dataDir: string;
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

export interface ChannelsConfig {
  telegram?: TelegramChannelConfig;
  discord?: DiscordChannelConfig;
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

export interface CronJob {
  id: string;
  schedule: { kind: "cron" | "at" | "every"; expr: string; timezone?: string };
  sessionKey?: string;
  payload: { text: string };
  enabled?: boolean;
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
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_DATA_DIR = join(homedir(), ".pi", "gateway");

export const DEFAULT_CONFIG: Config = {
  gateway: {
    port: 18789,
    bind: "loopback",
    auth: { mode: "off" },
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
  cron: {
    enabled: false,
    jobs: [],
  },
  logging: {
    file: false,
    level: "info",
    retentionDays: 7,
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
 */
export function loadConfig(configPath?: string): Config {
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
  validateTelegramConfig(merged);
  return merged;
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
