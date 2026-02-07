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

export interface AgentConfig {
  model?: string;
  thinkingLevel?: ThinkingLevel;
  piCliPath?: string;
  /** Replace default system prompt (text or file path). */
  systemPrompt?: string;
  /** Append extra system prompt instructions (text or file path). */
  appendSystemPrompt?: string;
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
}

export interface TelegramChannelConfig {
  enabled: boolean;
  botToken?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: string[];
  role?: string;
  groups?: Record<string, TelegramGroupConfig>;
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
}

export interface RolesConfig {
  workspaceDirs?: Record<string, string>;
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
  },
  roles: {
    workspaceDirs: {},
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
 * Search order: $PI_GATEWAY_CONFIG > ./pi-gateway.json > ~/.pi/gateway/pi-gateway.json
 */
export function resolveConfigPath(): string {
  if (process.env.PI_GATEWAY_CONFIG) {
    return process.env.PI_GATEWAY_CONFIG;
  }

  const localPath = join(process.cwd(), "pi-gateway.json");
  if (existsSync(localPath)) return localPath;

  return join(DEFAULT_DATA_DIR, "pi-gateway.json");
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

  return deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, fileConfig as Record<string, unknown>) as unknown as Config;
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
  ];

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
