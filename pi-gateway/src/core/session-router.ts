/**
 * Session Router — resolves inbound messages to session keys.
 *
 * Session key format (aligned with OpenClaw):
 *   agent:{agentId}:{channel}:{scope}:{identifier}
 *
 * Examples:
 *   agent:main:main:main                              DM (dmScope=main)
 *   agent:main:dm:{peerId}                            DM (per-peer)
 *   agent:main:telegram:account:{accountId}:group:{chatId}                Telegram group
 *   agent:main:telegram:account:{accountId}:group:{chatId}:topic:{tid}    Telegram forum topic
 *   agent:main:discord:channel:{channelId}            Discord channel
 *   agent:main:discord:channel:{cid}:thread:{tid}     Discord thread
 *   agent:main:webchat:{tabId}                        WebChat tab
 *   cron:{jobId}                                      Cron job
 *   hook:{uuid}                                       Webhook
 */

import type { Config } from "./config.ts";
import type { MessageSource, SessionKey } from "./types.ts";

const DEFAULT_AGENT_ID = "main";
const AGENT_ID = "main"; // Legacy fallback, will be removed after v3 migration

// ============================================================================
// Session Key Resolution
// ============================================================================

/**
 * Resolve a session key from an inbound message source.
 * @param agentId - Optional agent ID (defaults to legacy AGENT_ID for backward compatibility)
 */
export function resolveSessionKey(source: MessageSource, config: Config, agentId?: string): SessionKey {
  const { channel, accountId, chatType, chatId, threadId, topicId } = source;
  const resolvedAgentId = agentId ?? AGENT_ID;

  // DM routing
  if (chatType === "dm") {
    return resolveDmSessionKey(source, config, resolvedAgentId);
  }

  // Group / channel / thread routing
  let key = `agent:${resolvedAgentId}:${channel}`;
  if (channel === "telegram") {
    key += `:account:${accountId ?? "default"}`;
  }

  if (chatType === "group") {
    key += `:group:${chatId}`;
    if (topicId) {
      key += `:topic:${topicId}`;
    }
  } else if (chatType === "channel") {
    key += `:channel:${chatId}`;
    if (threadId) {
      key += `:thread:${threadId}`;
    }
  } else if (chatType === "thread") {
    key += `:channel:${chatId}:thread:${threadId ?? chatId}`;
  }

  return key;
}

/**
 * Resolve DM session key based on dmScope config.
 * @param agentId - Agent ID for the session key
 */
function resolveDmSessionKey(source: MessageSource, config: Config, agentId: string = AGENT_ID): SessionKey {
  const { dmScope } = config.session;
  const { channel, accountId, senderId } = source;
  const accountPart = channel === "telegram" ? `:account:${accountId ?? "default"}` : "";

  switch (dmScope) {
    case "main":
      // All DMs collapse to the main session (OpenClaw default)
      return channel === "telegram"
        ? `agent:${agentId}:${channel}${accountPart}:main`
        : `agent:${agentId}:main:main`;

    case "per-peer":
      return channel === "telegram"
        ? `agent:${agentId}:${channel}${accountPart}:dm:${senderId}`
        : `agent:${agentId}:dm:${senderId}`;

    case "per-channel-peer":
      return `agent:${agentId}:${channel}${accountPart}:dm:${senderId}`;

    default:
      return channel === "telegram"
        ? `agent:${agentId}:${channel}${accountPart}:main`
        : `agent:${agentId}:main:main`;
  }
}

// ============================================================================
// Role Resolution
// ============================================================================

/**
 * Resolve the role for a session based on channel configuration.
 *
 * Priority (most specific first):
 *   1. Discord guild channel-level role
 *   2. Discord guild-level role
 *   3. Telegram topic-level role
 *   4. Telegram group-level role
 *   5. Channel-level default role
 *   6. Global default (null → use default role from role-persona)
 */
export function resolveRoleForSession(source: MessageSource, config: Config): string | null {
  const { channel, accountId, chatType, chatId, guildId, topicId } = source;

  // Discord: check guild > channel hierarchy
  if (channel === "discord" && config.channels.discord) {
    const dc = config.channels.discord as any;
    if (guildId && dc.guilds?.[guildId]) {
      const guild = dc.guilds[guildId];
      // Channel-level role
      if (chatId && guild.channels?.[chatId]?.role) {
        return guild.channels[chatId].role;
      }
      // Guild-level role
      if (guild.role) return guild.role;
    }
    if (dc.role) return dc.role;
  }

  // Telegram: check topic > group > account > channel hierarchy
  if (channel === "telegram" && config.channels.telegram) {
    const tg = config.channels.telegram as any;
    const accountCfg = accountId ? tg.accounts?.[accountId] : undefined;
    const groups = accountCfg?.groups ?? tg.groups;

    if (chatType === "group" && topicId) {
      const groupTopicRole = groups?.[chatId]?.topics?.[topicId]?.role;
      if (groupTopicRole) return groupTopicRole;

      const wildcardGroupTopicRole = groups?.["*"]?.topics?.[topicId]?.role;
      if (wildcardGroupTopicRole) return wildcardGroupTopicRole;
    }

    if (chatType === "group" && groups?.[chatId]?.role) {
      return groups[chatId].role;
    }
    if (chatType === "group" && groups?.["*"]?.role) {
      return groups["*"].role;
    }
    if (accountCfg?.role) return accountCfg.role;
    if (tg.role) return tg.role;
  }

  // Generic channel-level role
  const channelConfig = config.channels[channel];
  if (channelConfig && typeof channelConfig === "object" && "role" in channelConfig) {
    return (channelConfig as any).role ?? null;
  }

  return null;
}

// ============================================================================
// Agent Resolution (v3 Multi-Agent Routing)
// ============================================================================

/**
 * Resolve which agent should handle this message.
 * Three-layer routing (first match wins):
 *   Layer 1: Static binding — config.agents.bindings[] match
 *   Layer 2: Prefix command — /{agentId} strips prefix
 *   Layer 3: Default agent
 */
export function resolveAgentId(
  source: MessageSource,
  text: string,
  config: Config,
): { agentId: string; text: string } {
  const agents = config.agents;
  if (!agents?.list?.length) {
    return { agentId: DEFAULT_AGENT_ID, text };
  }

  const agentIds = new Set(agents.list.map((a) => a.id));

  // Layer 1: Static binding
  if (agents.bindings?.length) {
    const bound = matchBinding(source, agents.bindings);
    if (bound && agentIds.has(bound)) {
      return { agentId: bound, text };
    }
  }

  // Layer 2: Prefix command — /{agentId} <rest>
  const prefixMatch = text.match(/^\/(\S+)(?:\s+(.*))?$/s);
  if (prefixMatch) {
    const prefix = prefixMatch[1]!;
    if (agentIds.has(prefix)) {
      return { agentId: prefix, text: prefixMatch[2]?.trim() || "" };
    }
  }

  // Layer 3: Default
  return { agentId: agents.default || DEFAULT_AGENT_ID, text };
}

/**
 * Static binding matcher. Score-based: peer(8) > guild(4) > account(2) > channel(1).
 */
function matchBinding(
  source: MessageSource,
  bindings: NonNullable<Config["agents"]>["bindings"],
): string | null {
  if (!bindings) return null;
  let bestMatch: string | null = null;
  let bestScore = -1;

  for (const binding of bindings) {
    const m = binding.match;
    let score = 0;
    let matched = true;

    if (m.channel) {
      if (m.channel !== source.channel) { matched = false; continue; }
      score += 1;
    }
    if (m.accountId) {
      if (m.accountId !== source.accountId) { matched = false; continue; }
      score += 2;
    }
    if (m.guildId) {
      if (m.guildId !== source.guildId) { matched = false; continue; }
      score += 4;
    }
    if (m.peer) {
      if (m.peer.kind && m.peer.kind !== source.chatType) { matched = false; continue; }
      if (m.peer.id && m.peer.id !== source.chatId && m.peer.id !== source.senderId) { matched = false; continue; }
      score += 8;
    }

    if (matched && score > bestScore) {
      bestScore = score;
      bestMatch = binding.agentId;
    }
  }
  return bestMatch;
}

// ============================================================================
// Role → CWD Mapping (for pi --mode rpc process)
// ============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Get the CWD that maps to a role for the RPC process.
 * Also ensures the role mapping exists in role-persona's config.json.
 */
export function getCwdForRole(role: string, config: Config): string {
  // Check if user configured a workspace dir for this role
  const configured = config.roles.workspaceDirs?.[role];
  if (configured) {
    const resolved = configured.replace(/^~/, homedir());
    ensureDir(resolved);
    ensureRoleMapping(resolved, role, config);
    return resolved;
  }

  // Default: ~/.pi/gateway/workspaces/{role}
  const defaultDir = join(homedir(), ".pi", "gateway", "workspaces", role);
  ensureDir(defaultDir);
  ensureRoleMapping(defaultDir, role, config);
  return defaultDir;
}

/**
 * Ensure role-persona's config.json has a CWD → role mapping.
 * This allows pi's role-persona extension to auto-resolve the role from CWD.
 */
function ensureRoleMapping(cwd: string, role: string, config: Config): void {
  try {
    const rolesDir = resolveRolesDir(config);
    const roleConfigFile = join(rolesDir, "config.json");
    ensureDir(rolesDir);

    let roleConfig: { mappings: Record<string, string>; defaultRole?: string; disabledPaths?: string[] };

    if (existsSync(roleConfigFile)) {
      roleConfig = JSON.parse(readFileSync(roleConfigFile, "utf-8"));
    } else {
      roleConfig = { mappings: {}, defaultRole: "default" };
    }

    if (!roleConfig.mappings) roleConfig.mappings = {};

    // Only update if mapping doesn't exist or is different
    if (roleConfig.mappings[cwd] !== role) {
      roleConfig.mappings[cwd] = role;
      writeFileSync(roleConfigFile, JSON.stringify(roleConfig, null, 2), "utf-8");
    }
  } catch {
    // Non-fatal: role-persona will fall back to default role
  }
}

export function resolveRolesDir(config: Config): string {
  const envRolesDir = process.env.PI_AGENT_ROLES_DIR?.trim();
  if (envRolesDir) return envRolesDir;

  const runtimeAgentDir = config.agent.runtime?.agentDir?.trim();
  if (runtimeAgentDir) {
    return join(runtimeAgentDir.replace(/^~/, homedir()), "roles");
  }
  return join(homedir(), ".pi", "agent", "roles");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// Main Session Key Resolution (shared with cron.ts and heartbeat)
// ============================================================================

/**
 * Resolve the main session key for an agent.
 * Aligned with SwiftQuartz's cron.ts for consistent session naming.
 */
export function resolveMainSessionKey(agentId: string): string {
  return `agent:${agentId}:main`;
}
