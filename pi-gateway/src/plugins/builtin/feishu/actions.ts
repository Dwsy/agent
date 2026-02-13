/**
 * Feishu message actions: react, edit (patch), delete (recall).
 *
 * Feishu API notes:
 * - Reaction add: client.im.messageReaction.create({ path: { message_id }, data: { reaction_type: { emoji_type } } })
 * - Reaction remove: needs reaction_id — list reactions first, find matching, then delete
 * - Edit: client.im.message.patch({ path: { message_id }, data: { content } }) — card content only, 14-day limit
 * - Delete: client.im.message.delete({ path: { message_id } }) — bot's own messages within 24h
 */
import type * as Lark from "@larksuiteoapi/node-sdk";
import type { MessageActionResult, ReactionOptions, ReadHistoryResult } from "../../types.ts";
import { buildMarkdownCard } from "./send.ts";

export async function sendFeishuReaction(
  client: Lark.Client,
  messageId: string,
  emoji: string | string[],
  opts?: ReactionOptions,
): Promise<MessageActionResult> {
  const emojis = Array.isArray(emoji) ? emoji : [emoji];

  try {
    if (opts?.remove) {
      // List all reactions on this message, then delete matching ones
      const listRes = await client.im.messageReaction.list({
        path: { message_id: messageId },
      });
      if (listRes.code !== 0) {
        return { ok: false, error: `List reactions failed: ${listRes.msg}` };
      }
      const items = (listRes.data as any)?.items ?? [];
      const emojiSet = new Set(emojis);
      for (const item of items) {
        const reactionId = item.reaction_id;
        if (reactionId && emojiSet.has(item.reaction_type?.emoji_type)) {
          await client.im.messageReaction.delete({
            path: { message_id: messageId, reaction_id: reactionId },
          });
        }
      }
    } else {
      for (const e of emojis) {
        const res = await client.im.messageReaction.create({
          path: { message_id: messageId },
          data: { reaction_type: { emoji_type: e } },
        });
        if (res.code !== 0) {
          return { ok: false, error: `Reaction failed: ${res.msg}` };
        }
      }
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function editFeishuMessage(
  client: Lark.Client,
  messageId: string,
  text: string,
): Promise<MessageActionResult> {
  try {
    const content = JSON.stringify(buildMarkdownCard(text));
    const res = await client.im.message.patch({
      path: { message_id: messageId },
      data: { content },
    });
    if (res.code !== 0) {
      return { ok: false, error: `Edit failed: ${res.msg}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteFeishuMessage(
  client: Lark.Client,
  messageId: string,
): Promise<MessageActionResult> {
  try {
    const res = await client.im.message.delete({
      path: { message_id: messageId },
    });
    if (res.code !== 0) {
      return { ok: false, error: `Delete failed: ${res.msg}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pinFeishuMessage(
  client: Lark.Client,
  messageId: string,
  unpin?: boolean,
): Promise<MessageActionResult> {
  try {
    if (unpin) {
      const res = await client.im.pin.delete({
        data: { message_id: messageId },
      });
      if ((res as any).code !== 0) {
        return { ok: false, error: `Unpin failed: ${(res as any).msg}` };
      }
    } else {
      const res = await client.im.pin.create({
        data: { message_id: messageId },
      });
      if ((res as any).code !== 0) {
        return { ok: false, error: `Pin failed: ${(res as any).msg}` };
      }
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function readFeishuHistory(
  client: Lark.Client,
  chatId: string,
  limit?: number,
  before?: string,
): Promise<ReadHistoryResult> {
  try {
    const params: Record<string, unknown> = {
      container_id_type: "chat",
      container_id: chatId,
      page_size: Math.min(limit ?? 20, 50),
      sort_type: "ByCreateTimeDesc",
    };
    if (before) params.start_time = before;

    const res = await client.im.message.list({
      params: params as any,
    });
    if (res.code !== 0) {
      return { ok: false, error: `Read history failed: ${res.msg}` };
    }
    const items = (res.data as any)?.items ?? [];
    const messages = items.map((item: any) => {
      let text = "";
      try {
        const body = JSON.parse(item.body?.content ?? "{}");
        text = body.text ?? body.content ?? item.body?.content ?? "";
      } catch {
        text = item.body?.content ?? "";
      }
      return {
        id: item.message_id ?? "",
        text,
        sender: item.sender?.id ?? "unknown",
        timestamp: Number(item.create_time ?? 0),
      };
    });
    return { ok: true, messages };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
