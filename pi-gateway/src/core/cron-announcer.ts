/**
 * Cron Announcer — extracted from server.ts (T7).
 *
 * Delivers cron job results to users via two modes:
 * - "announce": inject into main session → agent retells naturally
 * - "direct":   send raw text to channel via outbound.sendText
 *
 * @owner PureWolf
 */

import type { CronAnnouncer, CronDelivery } from "./cron.ts";
import type { SessionKey } from "./types.ts";
import type { Logger } from "./types.ts";
import type { SessionStore } from "./session-store.ts";
import type { SystemEventsQueue } from "./system-events.ts";
import type { ChannelPlugin } from "../plugins/types.ts";

export interface CronAnnouncerDeps {
  log: Logger;
  sessions: SessionStore;
  systemEvents: SystemEventsQueue;
  getChannels: () => Map<string, ChannelPlugin>;
  heartbeatWake?: (agentId: string) => void;
}

/**
 * Build a CronAnnouncer that delivers results via announce (inject) or direct (sendText).
 */
export function buildCronAnnouncer(deps: CronAnnouncerDeps): CronAnnouncer & { markSelfDelivered(sessionKey: string): void } {
  const { log, sessions, systemEvents, getChannels, heartbeatWake } = deps;
  const selfDelivered = new Set<string>();

  function tryCronInject(agentId: string, text: string): boolean {
    const mainKey = `agent:${agentId}:main`;
    const mainSession = sessions.get(mainKey as SessionKey);
    if (!mainSession?.lastChannel) return false;

    const retellPrompt = `[CRON_RESULT] The following cron job completed. Summarize the result naturally for the user in 1-2 sentences. Do not mention technical details or that this was a cron job.\n\n${text}`;
    systemEvents.inject(mainKey, retellPrompt);
    heartbeatWake?.(agentId);
    log.info(`[cron-announcer] injected to ${mainKey} for retelling (${text.length} chars)`);
    return true;
  }

  async function cronDirectSend(agentId: string, text: string, delivery: CronDelivery): Promise<void> {
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
      return;
    }

    const plugin = getChannels().get(targetChannel);
    if (!plugin?.outbound?.sendText) {
      log.warn(`[cron-announcer] channel ${targetChannel} has no sendText, dropping`);
      return;
    }

    try {
      await plugin.outbound.sendText(targetChatId, text);
      log.info(`[cron-announcer] direct send to ${targetChannel}:${targetChatId} (${text.length} chars)`);
    } catch (err: any) {
      log.error(`[cron-announcer] delivery failed: ${err?.message}`);
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

      if (delivery.mode === "announce") {
        if (tryCronInject(agentId, text)) return;
        log.info(`[cron-announcer] inject failed for ${agentId}, falling back to direct send`);
      }
      await cronDirectSend(agentId, text, delivery);
    },
    markSelfDelivered: (sessionKey: string) => {
      if (sessionKey.startsWith("cron:")) selfDelivered.add(sessionKey);
    },
  };
}
