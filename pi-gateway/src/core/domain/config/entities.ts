/**
 * Domain Layer - Configuration Entities
 *
 * Pure configuration entity definitions with no external dependencies.
 * These are the source of truth for gateway configuration structure.
 */

import type { LogLevel } from "../types.ts";

// ============================================================================
// Gateway Configuration
// ============================================================================

export type AuthMode = "off" | "token" | "password";
export type BindMode = "loopback" | "lan" | "auto";

export interface AuthConfig {
  mode: AuthMode;
  token?: string;
  password?: string;
  /** Must be true to run with mode:"off". Prevents accidental open gateways. */
  allowUnauthenticated?: boolean;
  /** Whether to log auto-generated tokens at startup. Default: true. */
  logToken?: boolean;
}

export interface GatewayCommandsConfig {
  /** Allow agent to restart the gateway process. Default: false */
  restart?: boolean;
}

export interface GatewayEntity {
  port: number;
  bind: BindMode;
  logLevel?: LogLevel;
  auth: AuthConfig;
  commands?: GatewayCommandsConfig;
}

// ============================================================================
// Agent Pool Configuration
// ============================================================================

export interface AgentPoolEntity {
  min: number;
  max: number;
  idleTimeoutMs: number;
  /** Per-message timeout in ms. Default: 120000 (2 min). */
  messageTimeoutMs?: number;
}

// ============================================================================
// Delegation Configuration
// ============================================================================

export type TimeoutBehavior = "abort" | "return-partial";

export interface DelegationEntity {
  /** Timeout for sync delegate_to_agent calls in ms. Default: 120000 */
  timeoutMs: number;
  /** Max allowed timeout (cap for per-call overrides). Default: 600000 (10 min) */
  maxTimeoutMs: number;
  /** Behavior when delegation times out. Default: "abort" */
  onTimeout: TimeoutBehavior;
  /** Max chain depth for nested delegations (A→B→C). Default: 1 */
  maxDepth: number;
  /** Max concurrent delegations per agent. Default: 2 */
  maxConcurrent: number;
  /** Whitelist of agent IDs allowed as delegation targets. Empty = all allowed. */
  allowAgents?: string[];
}

// ============================================================================
// Heartbeat Configuration
// ============================================================================

export interface ActiveHoursEntity {
  start: string;
  end: string;
  timezone: string;
}

export interface HeartbeatEntity {
  /** Enable heartbeat. Default: false */
  enabled: boolean;
  /** Interval between heartbeats. Format: "30m", "1h", "5m". Default: "30m" */
  every: string;
  /** Active hours window. Heartbeat skipped outside this range. */
  activeHours?: ActiveHoursEntity;
  /** Prompt sent to agent. */
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

// ============================================================================
// Tool Policy Configuration
// ============================================================================

export type ToolProfile = "minimal" | "coding" | "messaging" | "full";

export interface ToolPolicyEntity {
  profile?: ToolProfile;
  allow?: string[];
  deny?: string[];
  byChannel?: Record<string, { allow?: string[]; deny?: string[] }>;
}

// ============================================================================
// Sandbox Configuration
// ============================================================================

export type SandboxMode = "off" | "non-main" | "all";
export type SandboxScope = "session" | "agent" | "shared";

export interface SandboxEntity {
  mode: SandboxMode;
  scope: SandboxScope;
}

// ============================================================================
// Agent Definition
// ============================================================================

export interface DelegationConstraintsEntity {
  /** List of agent IDs this agent can delegate to. */
  allowAgents: string[];
  /** Maximum concurrent delegations from this agent. */
  maxConcurrent: number;
  /** Maximum delegation depth (prevent A→B→C chains). */
  maxDepth: number;
}

export interface AgentDefinitionEntity {
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
  delegation?: DelegationConstraintsEntity;
}

// ============================================================================
// Agent Binding
// ============================================================================

export interface PeerMatchEntity {
  kind?: "dm" | "group" | "channel" | "thread";
  id?: string;
}

export interface BindingMatchEntity {
  channel?: string;
  accountId?: string;
  guildId?: string;
  /** Discord member roles constraint. */
  roles?: string[];
  peer?: PeerMatchEntity;
  /** Parent peer inheritance (e.g. thread parent channel/topic). */
  parentPeer?: Omit<PeerMatchEntity, "kind"> & { kind?: "group" | "channel" };
}

export interface AgentBindingEntity {
  /** Target agent ID. */
  agentId: string;
  /** Match criteria for routing. */
  match: BindingMatchEntity;
}

export interface AgentsEntity {
  /** List of available agents. */
  list: AgentDefinitionEntity[];
  /** Default agent ID when no binding matches. */
  default: string;
  /** Static routing bindings. */
  bindings?: AgentBindingEntity[];
}

// ============================================================================
// Session Configuration
// ============================================================================

export type DmScope = "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";

export interface SessionEntity {
  dmScope: DmScope;
  dataDir: string;
  /** Auto-resume sessions on restart via --continue. Default: true */
  continueOnRestart?: boolean;
}

// ============================================================================
// Plugin Configuration
// ============================================================================

export interface PluginsEntity {
  /** Plugin search directories. */
  dirs?: string[];
  /** Explicitly disabled plugin IDs. */
  disabled?: string[];
  /** Auto-discover plugins in directories. Default: true */
  autoDiscover?: boolean;
}

// ============================================================================
// Roles Configuration
// ============================================================================

export interface RolesEntity {
  /** Role workspace search directories. */
  workspaceDirs?: string[];
}

// ============================================================================
// Root Configuration Entity
// ============================================================================

/**
 * Root configuration entity - the single source of truth for gateway config.
 * Infrastructure layer implements loading, validation, and persistence.
 */
export interface ConfigEntity {
  gateway: GatewayEntity;
  agent: {
    pool: AgentPoolEntity;
    tools?: ToolPolicyEntity;
    sandbox?: SandboxEntity;
    delegation?: DelegationEntity;
    heartbeat?: HeartbeatEntity;
  };
  agents: AgentsEntity;
  session: SessionEntity;
  plugins?: PluginsEntity;
  roles?: RolesEntity;
  hooks?: {
    enabled?: boolean;
    token?: string;
  };
}

// ============================================================================
// Channel Configurations (Minimal - extend as needed)
// ============================================================================

export interface TelegramChannelEntity {
  enabled?: boolean;
  botToken?: string;
  // ... channel-specific config
}

export interface DiscordChannelEntity {
  enabled?: boolean;
  botToken?: string;
  // ... channel-specific config
}

export interface ChannelsEntity {
  telegram?: TelegramChannelEntity;
  discord?: DiscordChannelEntity;
  webchat?: { enabled?: boolean };
}
