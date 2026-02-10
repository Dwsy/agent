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

const AGENT_ID = "main";

// ============================================================================
// Session Key Resolution
// ============================================================================

/**
 * Resolve a session key from an inbound message source.
 */
export function resolveSessionKey(source: MessageSource, config: Config): SessionKey {
  const { channel, accountId, chatType, chatId, threadId, topicId } = source;

  // DM routing
  if (chatType === "dm") {
    return resolveDmSessionKey(source, config);
  }

  // Group / channel / thread routing
  let key = `agent:${AGENT_ID}:${channel}`;
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
 */
function resolveDmSessionKey(source: MessageSource, config: Config): SessionKey {
  const { dmScope } = config.session;
  const { channel, accountId, senderId } = source;
  const accountPart = channel === "telegram" ? `:account:${accountId ?? "default"}` : "";

  switch (dmScope) {
    case "main":
      // All DMs collapse to the main session (OpenClaw default)
      return channel === "telegram"
        ? `agent:${AGENT_ID}:${channel}${accountPart}:main`
        : `agent:${AGENT_ID}:main:main`;

    case "per-peer":
      return channel === "telegram"
        ? `agent:${AGENT_ID}:${channel}${accountPart}:dm:${senderId}`
        : `agent:${AGENT_ID}:dm:${senderId}`;

    case "per-channel-peer":
      return `agent:${AGENT_ID}:${channel}${accountPart}:dm:${senderId}`;

    default:
      return channel === "telegram"
        ? `agent:${AGENT_ID}:${channel}${accountPart}:main`
        : `agent:${AGENT_ID}:main:main`;
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
 *   3. Telegram group-level role
 *   4. Channel-level default role
 *   5. Global default (null → use default role from role-persona)
 */
export function resolveRoleForSession(source: MessageSource, config: Config): string | null {
  const { channel, accountId, chatType, chatId, guildId } = source;

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

  // Telegram: check group > channel hierarchy
  if (channel === "telegram" && config.channels.telegram) {
    const tg = config.channels.telegram as any;
    const accountCfg = accountId ? tg.accounts?.[accountId] : undefined;
    const groups = accountCfg?.groups ?? tg.groups;
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

function resolveRolesDir(config: Config): string {
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
