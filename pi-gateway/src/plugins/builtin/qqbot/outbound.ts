import { splitMessage } from "../../../core/utils.ts";
import type { InlineKeyboardMarkup, MediaSendOptions, SendOptions } from "../../types.ts";
import type { QqbotKeyboardButton, QqbotKeyboardPayload, QqbotPluginRuntime, QqbotTarget, QqbotSendMeta } from "./types.ts";
import { sendQqbotMessage, type OutboundMeta } from "./api.ts";
import { normalizeMediaTags } from "./utils/media-tags.ts";
import { filterInternalMarkers } from "./utils/text-parsing.ts";

export const QQBOT_PLATFORM_TEXT_LIMIT = 1500;
export const QQBOT_NATIVE_STREAM_CHUNK_CHARS = 50;

function splitQqbotStreamByLines(text: string, maxChars = QQBOT_NATIVE_STREAM_CHUNK_CHARS): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (let i = 0; i < lines.length; i++) {
    const piece = i < lines.length - 1 ? `${lines[i]}\n` : lines[i] || "";
    if (current.length + piece.length <= maxChars) {
      current += piece;
      continue;
    }
    if (current) {
      if (!current.endsWith("\n")) current += "\n";
      chunks.push(current);
    }
    current = piece;
  }

  if (current) {
    if (!current.endsWith("\n")) current += "\n";
    chunks.push(current);
  }
  return chunks.length ? chunks : ["\n"];
}

export function encodeQqbotTarget(target: QqbotTarget): string {
  const parts = [target.peerType, target.id];
  if (target.guildId) parts.push(`guild=${target.guildId}`);
  if (target.channelId) parts.push(`channel=${target.channelId}`);
  if (target.msgId) parts.push(`msg=${target.msgId}`);
  if (target.eventId) parts.push(`event=${target.eventId}`);
  if (typeof target.msgSeq === "number") parts.push(`seq=${target.msgSeq}`);
  return parts.join("|");
}

export function parseQqbotTarget(raw: string): QqbotTarget {
  const [peerType, id, ...rest] = raw.split("|");
  const target: QqbotTarget = { peerType: (peerType as QqbotTarget["peerType"]) || "c2c", id };
  for (const token of rest) {
    const [key, value] = token.split("=");
    if (!value) continue;
    if (key === "guild") target.guildId = value;
    else if (key === "channel") target.channelId = value;
    else if (key === "msg") target.msgId = value;
    else if (key === "event") target.eventId = value;
    else if (key === "seq") target.msgSeq = Number.parseInt(value, 10) || undefined;
  }
  return target;
}

export function encodeBaseQqbotTarget(target: QqbotTarget): string {
  return encodeQqbotTarget({ ...target, msgId: undefined, eventId: undefined, msgSeq: undefined });
}

export function mergeSendMeta(target: QqbotTarget, meta?: QqbotSendMeta): QqbotTarget {
  if (!meta) return target;
  return {
    ...target,
    msgId: meta.msgId ?? target.msgId,
    eventId: meta.eventId ?? target.eventId,
    msgSeq: meta.msgSeq ?? target.msgSeq,
  };
}

export function normalizeQqbotTarget(target: QqbotTarget): QqbotTarget {
  const passive = Boolean(target.msgId || target.eventId);
  return {
    ...target,
    msgSeq: passive ? target.msgSeq ?? 1 : undefined,
  };
}

export function getQqbotTextChunkLimit(runtime: QqbotPluginRuntime): number {
  const configured = Number(runtime.channelCfg.textChunkLimit ?? QQBOT_PLATFORM_TEXT_LIMIT);
  if (!Number.isFinite(configured) || configured < 1) {
    return QQBOT_PLATFORM_TEXT_LIMIT;
  }
  return Math.min(Math.floor(configured), QQBOT_PLATFORM_TEXT_LIMIT);
}

export function chunkQqbotText(text: string, limit: number = QQBOT_PLATFORM_TEXT_LIMIT): string[] {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : QQBOT_PLATFORM_TEXT_LIMIT;
  if (text.length <= normalizedLimit) return [text];
  if (normalizedLimit <= 80) {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += normalizedLimit) {
      chunks.push(text.slice(i, i + normalizedLimit));
    }
    return chunks;
  }
  return splitMessage(text, normalizedLimit);
}

function resolvePassiveMeta(runtime: QqbotPluginRuntime, target: QqbotTarget, opts?: SendOptions): QqbotSendMeta | undefined {
  const state = runtime.replyState.get(encodeBaseQqbotTarget(target));
  const meta = (opts?.channelMeta as Record<string, unknown> | undefined) ?? {};
  const msgId = typeof meta.msgId === "string" ? meta.msgId : state?.msgId;
  const eventId = typeof meta.eventId === "string" ? meta.eventId : state?.eventId;
  const hasPassiveMeta = Boolean(msgId || eventId);
  return {
    msgId,
    eventId,
    msgSeq: typeof meta.msgSeq === "number" ? meta.msgSeq : hasPassiveMeta ? (state?.msgSeq ?? target.msgSeq ?? 1) : undefined,
    passive: typeof meta.passive === "boolean" ? meta.passive : state?.passive,
  };
}

export function resolveQqbotSendTarget(runtime: QqbotPluginRuntime, rawTarget: string, opts?: SendOptions): {
  baseTarget: QqbotTarget;
  target: QqbotTarget;
} {
  const baseTarget = parseQqbotTarget(rawTarget);
  const sendMeta = resolvePassiveMeta(runtime, baseTarget, opts);
  const target = normalizeQqbotTarget(mergeSendMeta(baseTarget, sendMeta));
  return { baseTarget, target };
}

export function ensurePassiveSendAllowed(runtime: QqbotPluginRuntime, target: QqbotTarget): string | null {
  if (!runtime.channelCfg.passiveReplyOnly) return null;
  if (target.msgId || target.eventId) return null;
  return "QQBot passiveReplyOnly enabled: outbound send requires passive reply context";
}

export function rememberQqbotReplyState(runtime: QqbotPluginRuntime, baseTarget: QqbotTarget, target: QqbotTarget): void {
  const passive = Boolean(target.msgId || target.eventId);
  runtime.replyState.set(encodeBaseQqbotTarget(baseTarget), {
    msgId: target.msgId,
    eventId: target.eventId,
    msgSeq: passive ? (target.msgSeq ?? 1) + 1 : undefined,
    passive,
  });
}


function resolveQqbotStreamHints(opts?: SendOptions): {
  enabled: boolean;
  streamId?: string;
  index: number;
  reset: boolean;
  final: boolean;
} {
  const meta = (opts?.channelMeta as Record<string, unknown> | undefined) ?? {};
  const transport = typeof meta.transport === "string" ? meta.transport : undefined;
  const streamMode = typeof opts?.streamMode === "string" ? opts.streamMode : undefined;
  const enabled = transport === "partial" || streamMode === "partial";
  const streamId = typeof meta.streamId === "string"
    ? meta.streamId
    : typeof opts?.streamId === "string"
      ? opts.streamId
      : undefined;
  const index = typeof meta.streamIndex === "number" && Number.isFinite(meta.streamIndex)
    ? Math.max(0, Math.floor(meta.streamIndex))
    : 0;
  const reset = meta.streamReset === true;
  const final = meta.streamFinal === true;
  return { enabled, streamId, index, reset, final };
}

function shouldSkipTextChunking(opts?: SendOptions): boolean {
  const meta = opts?.channelMeta as Record<string, unknown> | undefined;
  return meta?.qqbotSkipChunking === true;
}

export function guessFileType(opts: MediaSendOptions | undefined, filePath: string): 1 | 2 | 3 | 4 {
  if (opts?.type === "photo") return 1;
  if (opts?.type === "video") return 2;
  if (opts?.type === "audio") return 3;
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return 1;
  if (["mp4", "mov", "webm"].includes(ext)) return 2;
  if (["mp3", "wav", "silk", "amr", "ogg"].includes(ext)) return 3;
  return 4;
}

export async function sendQqbotText(runtime: QqbotPluginRuntime, rawTarget: string, text: string, opts?: SendOptions): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    // 预处理：修正 AI 模型生成的畸形媒体标签，过滤内部标记
    const cleaned = filterInternalMarkers(normalizeMediaTags(text));

    const resolved = resolveQqbotSendTarget(runtime, rawTarget, opts);
    const { baseTarget } = resolved;
    let { target } = resolved;
    const passiveError = ensurePassiveSendAllowed(runtime, target);
    if (passiveError) return { ok: false, error: passiveError };

    const streamHints = resolveQqbotStreamHints(opts);
    if (streamHints.enabled) {
      const payload: Record<string, unknown> = {
        msg_type: 2,
        markdown: { content: cleaned },
        msg_seq: typeof target.msgSeq === "number" ? target.msgSeq : 1,
        stream: {
          state: streamHints.final ? 10 : 1,
          id: streamHints.streamId ?? null,
          index: streamHints.final ? 1 : streamHints.index,
          reset: streamHints.final ? true : streamHints.reset,
        },
      };
      if (target.msgId) payload.msg_id = target.msgId;
      else if (target.eventId) payload.event_id = target.eventId;

      const result = await sendQqbotMessage(runtime, target, payload as any, { text: cleaned });
      const messageId = result?.id || result?.message?.id;
      rememberQqbotReplyState(runtime, baseTarget, target);
      return { ok: true, messageId };
    }

    const chunks = shouldSkipTextChunking(opts) ? [cleaned] : chunkQqbotText(cleaned, getQqbotTextChunkLimit(runtime));
    let messageId: string | undefined;

    for (const chunk of chunks) {
      const payload: Record<string, unknown> = {
        msg_type: 2,
        markdown: { content: chunk },
      };
      if (target.msgId) payload.msg_id = target.msgId;
      else if (target.eventId) payload.event_id = target.eventId;
      if (typeof target.msgSeq === "number") payload.msg_seq = target.msgSeq;
      const result = await sendQqbotMessage(runtime, target, payload, { text: cleaned });
      messageId = result?.id || result?.message?.id;
      rememberQqbotReplyState(runtime, baseTarget, target);
      const nextState = runtime.replyState.get(encodeBaseQqbotTarget(baseTarget));
      target = normalizeQqbotTarget(mergeSendMeta(baseTarget, nextState));
    }

    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}


function truncateButtonText(text: string, fallback: string): string {
  const normalized = text.trim() || fallback;
  return normalized.slice(0, 40);
}

function mapKeyboardButton(button: { text: string; callbackData?: string; callback_data?: string; url?: string }, rowIndex: number, buttonIndex: number): QqbotKeyboardButton {
  const callbackData = typeof button.callbackData === "string"
    ? button.callbackData
    : typeof button.callback_data === "string"
      ? button.callback_data
      : undefined;
  const label = truncateButtonText(button.text, `Option ${rowIndex + 1}-${buttonIndex + 1}`);
  if (button.url) {
    return {
      id: `${rowIndex + 1}-${buttonIndex + 1}`,
      render_data: {
        label,
        visited_label: label,
        style: 1,
      },
      action: {
        type: 0,
        data: button.url,
        unsupport_tips: "当前客户端暂不支持跳转按钮",
        permission: { type: 2 },
      },
    };
  }
  if (!callbackData) {
    throw new Error("QQBot keyboard button requires callbackData/callback_data or url");
  }
  return {
    id: `${rowIndex + 1}-${buttonIndex + 1}`,
    render_data: {
      label,
      visited_label: label,
      style: 1,
    },
    action: {
      type: 1,
      data: callbackData,
      unsupport_tips: "当前客户端暂不支持此按钮",
      permission: { type: 2 },
    },
  };
}

export function toQqbotKeyboard(markup: InlineKeyboardMarkup): QqbotKeyboardPayload {
  const rows = (markup.inline_keyboard ?? []).slice(0, 5).map((row, rowIndex) => ({
    buttons: row.slice(0, 5).map((button, buttonIndex) => mapKeyboardButton(button as any, rowIndex, buttonIndex)),
  }));
  if (rows.length === 0) {
    throw new Error("QQBot keyboard requires at least one button");
  }
  return {
    content: { rows },
  };
}


export async function sendQqbotNativeStream(
  runtime: QqbotPluginRuntime,
  rawTarget: string,
  text: string,
  opts?: SendOptions,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const resolved = resolveQqbotSendTarget(runtime, rawTarget, opts);
    const { baseTarget } = resolved;
    const target = resolved.target;
    const passiveError = ensurePassiveSendAllowed(runtime, target);
    if (passiveError) return { ok: false, error: passiveError };

    const chunks = splitQqbotStreamByLines(text, QQBOT_NATIVE_STREAM_CHUNK_CHARS);
    let streamId: string | undefined;
    let messageId: string | undefined;
    let msgSeq = typeof target.msgSeq === "number" ? target.msgSeq : 1;

    for (let i = 0; i < chunks.length; i++) {
      const payload: Record<string, unknown> = {
        msg_type: 2,
        markdown: { content: chunks[i] },
        msg_seq: msgSeq,
        stream: {
          state: 1,
          id: streamId ?? null,
          index: i,
          reset: false,
        },
      };
      if (target.msgId) payload.msg_id = target.msgId;
      else if (target.eventId) payload.event_id = target.eventId;

      const result = await sendQqbotMessage(runtime, target, payload as any, { text });
      messageId = result?.id || result?.message?.id || messageId;
      streamId = result?.id || result?.message?.id || streamId;
      msgSeq += 1;
    }

    const finalPayload: Record<string, unknown> = {
      msg_type: 2,
      markdown: { content: text },
      msg_seq: msgSeq,
      stream: {
        state: 10,
        id: streamId ?? null,
        index: 1,
        reset: true,
      },
    };
    if (target.msgId) finalPayload.msg_id = target.msgId;
    else if (target.eventId) finalPayload.event_id = target.eventId;

    const finalResult = await sendQqbotMessage(runtime, target, finalPayload as any, { text });
    messageId = finalResult?.id || finalResult?.message?.id || messageId;
    rememberQqbotReplyState(runtime, baseTarget, { ...target, msgSeq });
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendQqbotKeyboard(
  runtime: QqbotPluginRuntime,
  rawTarget: string,
  text: string,
  keyboard: InlineKeyboardMarkup,
  opts?: SendOptions,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const resolved = resolveQqbotSendTarget(runtime, rawTarget, opts);
    const { baseTarget } = resolved;
    const target = resolved.target;
    const passiveError = ensurePassiveSendAllowed(runtime, target);
    if (passiveError) return { ok: false, error: passiveError };

    const cleaned = filterInternalMarkers(normalizeMediaTags(text));
    const markdownText = cleaned.trim();
    if (!markdownText) {
      return { ok: false, error: "QQBot keyboard requires non-empty markdown text" };
    }

    const payload: Record<string, unknown> = {
      msg_type: 2,
      markdown: { content: markdownText },
      keyboard: toQqbotKeyboard(keyboard),
    };
    if (target.msgId) payload.msg_id = target.msgId;
    else if (target.eventId) payload.event_id = target.eventId;
    if (typeof target.msgSeq === "number") payload.msg_seq = target.msgSeq;

    const result = await sendQqbotMessage(runtime, target, payload, { text: markdownText });
    rememberQqbotReplyState(runtime, baseTarget, target);
    return { ok: true, messageId: result?.id || result?.message?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
