/**
 * Feishu outbound: send text messages via post format (supports markdown).
 */
import type * as Lark from "@larksuiteoapi/node-sdk";

/**
 * Resolve receive_id_type from target ID prefix.
 * oc_ → chat_id, ou_ → open_id, on_ → union_id
 */
export function resolveReceiveIdType(id: string): "chat_id" | "open_id" | "union_id" {
  if (id.startsWith("oc_")) return "chat_id";
  if (id.startsWith("ou_")) return "open_id";
  if (id.startsWith("on_")) return "union_id";
  return "chat_id";
}

/**
 * Send text as post format (supports markdown tag).
 */
export async function sendFeishuText(params: {
  client: Lark.Client;
  to: string;
  text: string;
  replyTo?: string;
}): Promise<{ messageId: string }> {
  const { client, to, text, replyTo } = params;

  const content = JSON.stringify({
    zh_cn: {
      content: [[{ tag: "md", text }]],
    },
  });

  if (replyTo) {
    const response = await client.im.message.reply({
      path: { message_id: replyTo },
      data: { content, msg_type: "post" },
    });
    if (response.code !== 0) {
      throw new Error(`Feishu reply failed: ${response.msg || `code ${response.code}`}`);
    }
    return { messageId: response.data?.message_id ?? "unknown" };
  }

  const response = await client.im.message.create({
    params: { receive_id_type: resolveReceiveIdType(to) },
    data: { receive_id: to, content, msg_type: "post" },
  });
  if (response.code !== 0) {
    throw new Error(`Feishu send failed: ${response.msg || `code ${response.code}`}`);
  }
  return { messageId: response.data?.message_id ?? "unknown" };
}

/**
 * Chunk text by length limit.
 */
export function chunkText(text: string, limit: number = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks;
}

// ── Interactive Card ───────────────────────────────────────────────────────

/**
 * Build a Feishu interactive card with markdown content (schema 2.0).
 */
export function buildMarkdownCard(text: string): Record<string, unknown> {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true },
    body: {
      elements: [{ tag: "markdown", content: text }],
    },
  };
}

/**
 * Send text as an interactive card (renders markdown properly).
 */
export async function sendFeishuCard(params: {
  client: Lark.Client;
  to: string;
  text: string;
  replyTo?: string;
}): Promise<{ messageId: string }> {
  const { client, to, text, replyTo } = params;
  const content = JSON.stringify(buildMarkdownCard(text));

  if (replyTo) {
    const response = await client.im.message.reply({
      path: { message_id: replyTo },
      data: { content, msg_type: "interactive" },
    });
    if (response.code !== 0) {
      throw new Error(`Feishu card reply failed: ${response.msg || `code ${response.code}`}`);
    }
    return { messageId: response.data?.message_id ?? "unknown" };
  }

  const response = await client.im.message.create({
    params: { receive_id_type: resolveReceiveIdType(to) },
    data: { receive_id: to, content, msg_type: "interactive" },
  });
  if (response.code !== 0) {
    throw new Error(`Feishu card send failed: ${response.msg || `code ${response.code}`}`);
  }
  return { messageId: response.data?.message_id ?? "unknown" };
}

/**
 * Update an existing card message (within 24h).
 */
export async function updateFeishuCard(params: {
  client: Lark.Client;
  messageId: string;
  text: string;
}): Promise<void> {
  const { client, messageId, text } = params;
  const content = JSON.stringify(buildMarkdownCard(text));

  const response = await client.im.message.patch({
    path: { message_id: messageId },
    data: { content },
  });
  if (response.code !== 0) {
    throw new Error(`Feishu card update failed: ${response.msg || `code ${response.code}`}`);
  }
}
