/**
 * Telegram group message control — ported from legacy shouldAllowGroupMessage.
 *
 * Checks group config (enabled, allowFrom, requireMention) and returns
 * whether the message should be processed, plus cleaned text.
 */

import type { TelegramGroupConfig, GroupFilterResult } from "./types.ts";

/**
 * Check if a group message should be allowed through.
 *
 * @param groupCfg - Config for this specific group (or wildcard "*")
 * @param senderId - Telegram user ID of the sender
 * @param text - Raw message text
 * @param botUsername - Bot's @username (without @)
 * @returns { allowed, text } — text has @mention stripped if requireMention matched
 */
export function shouldAllowGroupMessage(params: {
  groupCfg: TelegramGroupConfig | undefined;
  senderId: string;
  text: string;
  botUsername?: string;
}): GroupFilterResult {
  const { groupCfg, senderId, botUsername } = params;
  let text = params.text;

  // No config for this group — block by default
  if (!groupCfg) {
    return { allowed: false, text };
  }

  // Explicitly disabled
  if (groupCfg.enabled === false) {
    return { allowed: false, text };
  }

  // requireMention check (default: true if not specified)
  const mentionRequired = groupCfg.requireMention !== false;
  if (mentionRequired && botUsername) {
    const mentionPattern = new RegExp(`@${botUsername}`, "gi");
    if (!mentionPattern.test(text)) {
      return { allowed: false, text };
    }
    // Strip the @mention from text
    text = text.replace(mentionPattern, "").trim();
  }

  // allowFrom check
  const allowFrom = groupCfg.allowFrom;
  if (allowFrom && allowFrom !== "*") {
    // It's an array of allowed sender IDs
    if (Array.isArray(allowFrom) && !allowFrom.includes("*") && !allowFrom.includes(senderId)) {
      return { allowed: false, text };
    }
  }

  return { allowed: true, text };
}

/**
 * Resolve group config for a given chat ID.
 * Checks exact match first, then wildcard "*".
 */
export function resolveGroupConfig(
  groups: Record<string, TelegramGroupConfig> | undefined,
  chatId: string,
): TelegramGroupConfig | undefined {
  if (!groups) return undefined;
  return groups[chatId] ?? groups["*"];
}
