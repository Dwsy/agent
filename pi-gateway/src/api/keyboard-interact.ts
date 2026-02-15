/**
 * Keyboard Interaction API — lets the AI agent send inline keyboards to users
 * and wait for their selection.
 *
 * Flow:
 *   1. Agent tool calls POST /api/keyboard
 *   2. Gateway sends inline keyboard to the chat via channel outbound
 *   3. User clicks a button → callback_query resolves the pending request
 *   4. Response returns the selected option to the agent
 *
 * POST /api/keyboard
 * Body: {
 *   token: string,
 *   pid?: number,
 *   sessionKey?: string,
 *   title: string,
 *   options: Array<{ id: string, text: string }>,
 *   columns?: number,        // buttons per row (default: 1)
 *   timeout?: number,        // ms to wait (default: 120000)
 * }
 */

import type { Config } from "../core/config.ts";
import type { SessionKey, Logger } from "../core/types.ts";
import type { RpcPool } from "../core/rpc-pool.ts";
import type { PluginRegistryState } from "../plugins/loader.ts";
import type { SessionStore } from "../core/session-store.ts";
import { getGatewayInternalToken } from "./media-send.ts";

// ============================================================================
// Types
// ============================================================================

export interface KeyboardOption {
  id: string;
  text: string;
}

export interface KeyboardResult {
  ok: boolean;
  selected?: KeyboardOption;
  messageId?: number;
  error?: string;
}

interface PendingKeyboard {
  requestId: string;
  sessionKey: string;
  chatId: string;
  channel: string;
  messageId?: string;
  options: KeyboardOption[];
  resolve: (result: KeyboardResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Pending request store
// ============================================================================

const pending = new Map<string, PendingKeyboard>();

/** Resolve a pending keyboard request (called from callback_query handler). */
export function resolveKeyboard(requestId: string, selectedId: string): boolean {
  const req = pending.get(requestId);
  if (!req) return false;

  const selected = req.options.find(o => o.id === selectedId);
  if (!selected) return false;

  clearTimeout(req.timer);
  pending.delete(requestId);
  req.resolve({ ok: true, selected, messageId: req.messageId ? Number(req.messageId) : undefined });
  return true;
}

/** Cancel a pending keyboard request. */
export function cancelKeyboard(requestId: string): boolean {
  const req = pending.get(requestId);
  if (!req) return false;

  clearTimeout(req.timer);
  pending.delete(requestId);
  req.resolve({ ok: false, error: "cancelled" });
  return true;
}

/** Get pending request info (for callback handler to edit the message). */
export function getPendingRequest(requestId: string): PendingKeyboard | undefined {
  return pending.get(requestId);
}

// ============================================================================
// Callback data encoding
// ============================================================================

const KB_PREFIX = "kb:";

export function encodeKeyboardCallback(requestId: string, optionId: string): string {
  return `${KB_PREFIX}${requestId}:${optionId}`;
}

export function parseKeyboardCallback(data: string): { requestId: string; optionId: string } | null {
  if (!data.startsWith(KB_PREFIX)) return null;
  const rest = data.slice(KB_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  return { requestId: rest.slice(0, sep), optionId: rest.slice(sep + 1) };
}

// ============================================================================
// HTTP handler
// ============================================================================

export interface KeyboardContext {
  config: Config;
  pool: RpcPool;
  registry: PluginRegistryState;
  sessions: SessionStore;
  log: Logger;
}

let reqCounter = 0;

export async function handleKeyboardRequest(
  req: Request,
  ctx: KeyboardContext,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const internalToken = typeof body.token === "string" ? body.token.trim() : "";
  const callerPid = typeof body.pid === "number" ? body.pid : 0;
  let sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
  const title = typeof body.title === "string" ? body.title : "";
  const options = Array.isArray(body.options) ? body.options as KeyboardOption[] : [];
  const columns = typeof body.columns === "number" ? Math.max(1, Math.min(8, body.columns)) : 1;
  const timeoutMs = typeof body.timeout === "number" ? Math.max(5000, Math.min(300000, body.timeout)) : 120000;

  if (!title) return Response.json({ error: "Missing title" }, { status: 400 });
  if (options.length === 0) return Response.json({ error: "Missing options" }, { status: 400 });
  if (options.length > 50) return Response.json({ error: "Too many options (max 50)" }, { status: 400 });

  for (const opt of options) {
    if (!opt.id || !opt.text) {
      return Response.json({ error: "Each option must have id and text" }, { status: 400 });
    }
    // Telegram callback_data limit is 64 bytes; reserve ~10 for prefix
    if (opt.id.length > 50) {
      return Response.json({ error: `Option id too long (max 50 chars): ${opt.id.slice(0, 20)}...` }, { status: 400 });
    }
  }

  // Auth
  if (sessionKey) {
    if (!ctx.pool.getForSession(sessionKey as SessionKey)) {
      return Response.json({ error: "Invalid or inactive session" }, { status: 403 });
    }
  } else if (internalToken) {
    const expected = getGatewayInternalToken(ctx.config);
    if (internalToken !== expected) {
      return Response.json({ error: "Invalid token" }, { status: 403 });
    }
    if (callerPid > 0) {
      const client = ctx.pool.getByPid(callerPid);
      if (client?.sessionKey) {
        sessionKey = client.sessionKey;
      }
    }
  } else {
    return Response.json({ error: "Missing sessionKey or token" }, { status: 400 });
  }

  // Resolve channel + chatId
  const session = sessionKey ? ctx.sessions.get(sessionKey as SessionKey) : undefined;
  const channel = session?.lastChannel || (sessionKey ? sessionKey.split(":")[2] : undefined);
  const chatId = session?.lastChatId;

  if (!channel) return Response.json({ error: "Cannot resolve channel" }, { status: 400 });
  if (!chatId) return Response.json({ error: "Cannot resolve chatId" }, { status: 400 });

  const channelPlugin = ctx.registry.channels.get(channel);
  if (!channelPlugin) return Response.json({ error: `Channel not found: ${channel}` }, { status: 404 });
  if (!channelPlugin.outbound.sendKeyboard) {
    return Response.json({ error: `Channel ${channel} does not support inline keyboards` }, { status: 400 });
  }

  // Generate short request ID (fits in Telegram's 64-byte callback_data limit)
  const requestId = `k${(++reqCounter).toString(36)}`;

  // Build inline keyboard rows
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  let currentRow: Array<{ text: string; callback_data: string }> = [];
  for (const opt of options) {
    currentRow.push({
      text: opt.text,
      callback_data: encodeKeyboardCallback(requestId, opt.id),
    });
    if (currentRow.length >= columns) {
      rows.push(currentRow);
      currentRow = [];
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // Send keyboard via channel outbound
  const sendResult = await channelPlugin.outbound.sendKeyboard(chatId, title, { inline_keyboard: rows });
  if (!sendResult.ok) {
    return Response.json({ error: sendResult.error ?? "Failed to send keyboard" }, { status: 500 });
  }

  const messageId = sendResult.messageId;

  // Wait for user selection (blocking — the tool call hangs until user clicks or timeout)
  const result = await new Promise<KeyboardResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      // Edit message to show timeout
      if (messageId && channelPlugin.outbound.editMessageMarkup) {
        channelPlugin.outbound.editMessageMarkup(chatId, messageId, `⏰ ${title}\n<i>(timed out)</i>`).catch(() => {});
      }
      resolve({ ok: false, error: "timeout" });
    }, timeoutMs);

    pending.set(requestId, {
      requestId,
      sessionKey,
      chatId,
      channel,
      messageId: messageId ?? undefined,
      options,
      resolve,
      timer,
    });
  });

  // Edit message to show selection result (remove keyboard)
  if (result.ok && result.selected && messageId && channelPlugin.outbound.editMessageMarkup) {
    channelPlugin.outbound.editMessageMarkup(
      chatId, messageId,
      `${title}\n\n✅ <b>${result.selected.text}</b>`,
    ).catch(() => {});
  }

  return Response.json(result);
}
