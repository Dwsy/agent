/**
 * Cron Announcer — delivers cron job results to users.
 *
 * Aligned with OpenClaw: both "announce" and "direct" modes send
 * directly via channel outbound.sendText. The main-session summary
 * is handled separately by CronEngine.notifyOriginSession.
 */

import type { CronAnnouncer } from "./cron.ts";
import type { CronDelivery } from "./config.ts";
import type { Logger } from "./types.ts";
import type { SessionStore } from "./session-store.ts";
import type { ChannelPlugin } from "../plugins/types.ts";

export interface CronAnnouncerDeps {
  log: Logger;
  sessions: SessionStore;
  getChannels: () => Map<string, ChannelPlugin>;
}

export function buildCronAnnouncer(deps: CronAnnouncerDeps): CronAnnouncer & { markSelfDelivered(sessionKey: string): void } {
  const { log, sessions, getChannels } = deps;
  const selfDelivered = new Set<string>();

  async function cronDirectSend(agentId: string, text: string, delivery: CronDelivery): Promise<boolean> {
    let targetChannel = delivery.channel && delivery.channel !== "last" ? delivery.channel : undefined;
    let targetChatId = delivery.to;

    if (!targetChannel || !targetChatId) {
      let latestActivity = 0;
      for (const session of sessions.values()) {
        const sk = session.sessionKey ?? "";
        if (sk.startsWith("cron:")) continue;
        const parts = sk.split(":");
        if (parts[1] !== agentId) continue;
        if (session.lastChannel && session.lastChatId && (session.lastActivity ?? 0) > latestActivity) {
          if (!targetChannel) targetChannel = session.lastChannel;
          if (!targetChatId) targetChatId = session.lastChatId;
          latestActivity = session.lastActivity ?? 0;
        }
      }
    }

    if (!targetChannel || !targetChatId) {
      log.warn(`[cron-announcer] no bound channel for agent ${agentId}, dropping`);
      return false;
    }

    const plugin = getChannels().get(targetChannel);
    if (!plugin?.outbound?.sendText) {
      log.warn(`[cron-announcer] channel ${targetChannel} has no sendText, dropping`);
      return false;
    }

    try {
      await plugin.outbound.sendText(targetChatId, text);
      log.info(`[cron-announcer] sent to ${targetChannel}:${targetChatId} (${text.length} chars)`);
      return true;
    } catch (err: unknown) {
      log.error(`[cron-announcer] delivery failed: ${(err instanceof Error ? err.message : String(err))}`);
      return false;
    }
  }

  return {
    deliver: async (agentId, text, delivery, sessionKey) => {
      if (selfDelivered.has(sessionKey)) {
        log.info(`[cron-announcer] skipping — agent already sent message in ${sessionKey}`);
        selfDelivered.delete(sessionKey);
        return;
      }
      selfDelivered.delete(sessionKey);
      await cronDirectSend(agentId, text, delivery);
    },
    markSelfDelivered: (sessionKey: string) => {
      if (sessionKey.startsWith("cron:")) selfDelivered.add(sessionKey);
    },
  };
}
