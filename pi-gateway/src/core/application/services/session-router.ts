/**
 * Application Layer - Session Router Service
 *
 * Routes inbound messages to appropriate sessions.
 * Implements session key resolution logic.
 */

import type {
  SessionKey,
  MessageSource,
} from "../../domain/types.ts";
import type {
  ConfigEntity,
  AgentDefinitionEntity,
  AgentBindingEntity,
  BindingMatchEntity,
} from "../../domain/index.ts";
import type { ConfigPort } from "../ports/outbound/index.ts";

// ============================================================================
// Types
// ============================================================================

export type RoleSource =
  | "discord.channel"
  | "discord.guild"
  | "discord.channel-default"
  | "telegram.topic"
  | "telegram.topic-wildcard"
  | "telegram.group"
  | "telegram.group-wildcard"
  | "telegram.account"
  | "telegram.channel-default"
  | "channel-default"
  | "agent.role"
  | "default";

export interface RoleResolution {
  role: string | null;
  source: RoleSource;
}

export type AgentRouteSource = "single-agent" | "binding" | "prefix" | "default";

export interface AgentRouteResolution {
  agentId: string;
  text: string;
  source: AgentRouteSource;
  bindingScore?: number;
}

// ============================================================================
// Session Router Service
// ============================================================================

export interface SessionRouterOptions {
  configPort: ConfigPort;
}

export class SessionRouterService {
  private configPort: ConfigPort;

  constructor(options: SessionRouterOptions) {
    this.configPort = options.configPort;
  }

  /**
   * Resolve a session key from message source.
   */
  resolveSessionKey(source: MessageSource, agentId?: string): SessionKey {
    const config = this.configPort.get();
    const resolvedAgentId = agentId ?? this.getDefaultAgentId(config);

    // DM handling
    if (source.chatType === "dm") {
      return this.resolveDmSessionKey(source, config, resolvedAgentId);
    }

    // Build session key
    let key = `agent:${resolvedAgentId}:${source.channel}`;

    if (source.channel === "telegram") {
      key += `:account:${source.accountId ?? "default"}`;
    }

    if (source.chatType === "group") {
      key += `:group:${source.chatId}`;
      if (source.topicId) {
        key += `:topic:${source.topicId}`;
      }
    } else if (source.chatType === "channel") {
      key += `:channel:${source.chatId}`;
    } else if (source.chatType === "thread") {
      key += `:thread:${source.chatId}`;
    }

    return key;
  }

  /**
   * Resolve role for a session.
   */
  resolveRole(sessionKey: SessionKey, source: MessageSource): RoleResolution {
    const config = this.configPort.get();

    // Extract agent ID from session key
    const agentId = this.extractAgentId(sessionKey);
    const agent = this.findAgent(config, agentId);

    if (agent?.role) {
      return { role: agent.role, source: "agent.role" };
    }

    // Channel-specific role resolution
    if (source.channel === "telegram") {
      return this.resolveTelegramRole(source, config);
    }

    if (source.channel === "discord") {
      return this.resolveDiscordRole(source, config);
    }

    return { role: null, source: "default" };
  }

  /**
   * Route message to appropriate agent.
   */
  routeAgent(text: string, source: MessageSource): AgentRouteResolution {
    const config = this.configPort.get();

    // Check for agent prefix (e.g., "@code do something")
    const prefixMatch = text.match(/^@(\w+)\s*/);
    if (prefixMatch) {
      const agentId = prefixMatch[1];
      const cleanText = text.slice(prefixMatch[0].length);
      return {
        agentId,
        text: cleanText,
        source: "prefix",
      };
    }

    // Check bindings
    const binding = this.findMatchingBinding(source, config);
    if (binding) {
      return {
        agentId: binding.agentId,
        text,
        source: "binding",
      };
    }

    // Default agent
    return {
      agentId: this.getDefaultAgentId(config),
      text,
      source: "default",
    };
  }

  /**
   * Resolve agent ID from various inputs.
   */
  resolveAgentId(input: string): string {
    const config = this.configPort.get();

    // Check if it's a valid agent ID
    const agent = this.findAgent(config, input);
    if (agent) {
      return agent.id;
    }

    // Return default
    return config.agents.default;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private resolveDmSessionKey(
    source: MessageSource,
    config: ConfigEntity,
    agentId: string
  ): SessionKey {
    const { dmScope } = config.session;

    switch (dmScope) {
      case "main":
        return `agent:${agentId}:main:main`;
      case "per-peer":
        return `agent:${agentId}:dm:${source.senderId ?? "unknown"}`;
      case "per-channel-peer":
        return `agent:${agentId}:${source.channel}:dm:${source.senderId ?? "unknown"}`;
      case "per-account-channel-peer":
        const accountPart = source.accountId ? `:account:${source.accountId}` : "";
        return `agent:${agentId}:${source.channel}${accountPart}:dm:${source.senderId ?? "unknown"}`;
      default:
        return `agent:${agentId}:main:main`;
    }
  }

  private resolveTelegramRole(source: MessageSource, config: ConfigEntity): RoleResolution {
    // This would implement Telegram-specific role resolution
    // based on group/topic configuration
    return { role: null, source: "telegram.channel-default" };
  }

  private resolveDiscordRole(source: MessageSource, config: ConfigEntity): RoleResolution {
    // This would implement Discord-specific role resolution
    return { role: null, source: "discord.channel-default" };
  }

  private findMatchingBinding(
    source: MessageSource,
    config: ConfigEntity
  ): AgentBindingEntity | undefined {
    if (!config.agents.bindings) {
      return undefined;
    }

    // Score each binding and find best match
    let bestMatch: AgentBindingEntity | undefined;
    let bestScore = 0;

    for (const binding of config.agents.bindings) {
      const score = this.calculateBindingScore(binding, source);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = binding;
      }
    }

    return bestMatch;
  }

  private calculateBindingScore(binding: AgentBindingEntity, source: MessageSource): number {
    const match = binding.match;
    let score = 0;

    if (match.channel && match.channel === source.channel) {
      score += 10;
    }

    if (match.accountId && match.accountId === source.accountId) {
      score += 5;
    }

    if (match.peer?.kind && match.peer.kind === source.chatType) {
      score += 3;
    }

    if (match.peer?.id && match.peer.id === source.chatId) {
      score += 20;
    }

    return score;
  }

  private extractAgentId(sessionKey: SessionKey): string {
    const parts = sessionKey.split(":");
    return parts[1] ?? "main";
  }

  private findAgent(
    config: ConfigEntity,
    agentId: string
  ): AgentDefinitionEntity | undefined {
    return config.agents.list.find((a) => a.id === agentId);
  }

  private getDefaultAgentId(config: ConfigEntity): string {
    return config.agents.default;
  }
}
