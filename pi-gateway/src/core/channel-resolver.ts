/**
 * Channel Resolver — shared utility for resolving delivery targets.
 *
 * Used by cron-announcer and heartbeat alert delivery to find the best
 * channel/chatId for an agent when static bindings are unavailable.
 */

import type { SessionStore } from "./session-store.ts";

export interface DeliveryTarget {
  channel: string;
  chatId: string;
}

export function resolveDeliveryTarget(
  agentId: string,
  sessions: SessionStore,
  bindings?: Array<{ agentId?: string; match: { channel?: string; peer?: { id?: string }; guildId?: string } }>,
): DeliveryTarget | null {
  if (bindings) {
    const binding = bindings.find(b => b.agentId === agentId);
    if (binding?.match.channel) {
      const target = binding.match.peer?.id ?? binding.match.guildId;
      if (target) return { channel: binding.match.channel, chatId: target };
    }
  }

  let bestChannel: string | undefined;
  let bestChatId: string | undefined;
  let latestActivity = 0;

  for (const session of sessions.values()) {
    const sk = session.sessionKey ?? "";
    if (sk.startsWith("cron:")) continue;
    const parts = sk.split(":");
    if (parts[1] !== agentId) continue;
    if (session.lastChannel && session.lastChatId && (session.lastActivity ?? 0) > latestActivity) {
      bestChannel = session.lastChannel;
      bestChatId = session.lastChatId;
      latestActivity = session.lastActivity ?? 0;
    }
  }

  if (bestChannel && bestChatId) return { channel: bestChannel, chatId: bestChatId };
  return null;
}
