import type { TelegramAccountConfig } from "../../../core/config.ts";
import type { TelegramContext } from "./types.ts";

function toEmojiList(items?: Array<{ type: string; emoji?: string }>): string {
  if (!items || items.length === 0) return "none";
  return items
    .map((item) => (item.type === "emoji" ? item.emoji ?? "emoji" : item.type))
    .join(" ");
}

export function buildReactionText(
  cfg: TelegramAccountConfig,
  ctx: TelegramContext,
  botId?: string,
): string | null {
  const level = cfg.reactionLevel ?? "off";
  if (level === "off") return null;

  const reaction = (ctx.update as any)?.message_reaction;
  if (!reaction) return null;

  const notifications = cfg.reactionNotifications ?? "all";
  const userId = String(reaction.user?.id ?? "");
  if (notifications === "off") return null;
  if (notifications === "own" && botId && userId !== botId) return null;

  const oldReactions = toEmojiList(reaction.old_reaction);
  const newReactions = toEmojiList(reaction.new_reaction);
  const actor = reaction.user?.username || reaction.user?.first_name || "someone";

  if (level === "ack") {
    return `[reaction] ${actor} updated reaction`;
  }

  if (level === "minimal") {
    return `[reaction] ${actor}: ${newReactions}`;
  }

  return `[reaction] ${actor} changed reaction from ${oldReactions} to ${newReactions}`;
}
