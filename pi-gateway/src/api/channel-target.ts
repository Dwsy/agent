import type { SessionState } from "../core/types.ts";

/**
 * Resolve outbound channel target from session state.
 *
 * - Default: plain chatId
 * - Telegram: "{accountId}:{chatId}[:topic:{topicId}]"
 */
export function resolveChannelTarget(
  channel: string,
  chatId: string,
  sessionKey?: string,
  session?: SessionState,
): string {
  if (channel !== "telegram") return chatId;

  const accountFromKey = sessionKey?.match(/^agent:[^:]+:telegram:account:([^:]+):/)?.[1];
  const accountId = session?.lastAccountId || accountFromKey || "default";
  const topicId = session?.lastTopicId;

  return `${accountId}:${chatId}${topicId ? `:topic:${topicId}` : ""}`;
}
