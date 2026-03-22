import type { QqbotPluginRuntime, QqbotAuthToken, QqbotFileType, QqbotTarget } from "./types.ts";

const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const QQ_API_BASE = "https://api.sgroup.qq.com";

// ============ 出站消息回调钩子 ============

/** 出站消息元信息 */
export interface OutboundMeta {
  text?: string;
  mediaType?: "image" | "voice" | "video" | "file";
  mediaUrl?: string;
  mediaLocalPath?: string;
  ttsText?: string;
}

type OnMessageSentCallback = (refIdx: string, meta: OutboundMeta) => void;
let _onMessageSentHook: OnMessageSentCallback | null = null;

/**
 * 注册出站消息回调
 * 当消息发送成功且 QQ 返回 ref_idx 时，自动回调此函数。
 * 用于在最底层统一缓存 bot 出站消息的 refIdx（用户可引用 bot 的消息）。
 */
export function onMessageSent(callback: OnMessageSentCallback): void {
  _onMessageSentHook = callback;
}

function notifyMessageSent(refIdx: string, meta: OutboundMeta): void {
  if (refIdx && _onMessageSentHook) {
    _onMessageSentHook(refIdx, meta);
  }
}

export interface QqbotRequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

function toQueryString(query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function ensureAccessToken(runtime: QqbotPluginRuntime): Promise<QqbotAuthToken> {
  const now = Date.now();
  if (runtime.token && runtime.token.expiresAt - now > 60_000) {
    return runtime.token;
  }

  const appId = runtime.channelCfg.appId?.trim();
  const clientSecret = runtime.channelCfg.clientSecret?.trim();
  if (!appId || !clientSecret) {
    throw new Error("QQBot credentials missing");
  }

  const res = await fetch(QQ_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId, clientSecret }),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || typeof data.access_token !== "string") {
    throw new Error(`QQBot token fetch failed: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 7200;
  runtime.token = {
    accessToken: data.access_token,
    expiresAt: now + expiresIn * 1000,
  };
  return runtime.token;
}

export async function qqbotRequest<T = any>(runtime: QqbotPluginRuntime, path: string, opts: QqbotRequestOptions = {}): Promise<T> {
  const token = await ensureAccessToken(runtime);
  return qqbotRequestWithToken(token.accessToken, path, opts);
}

async function qqbotRequestWithToken<T = any>(accessToken: string, path: string, opts: QqbotRequestOptions = {}): Promise<T> {
  const query = toQueryString(opts.query);
  const url = `${QQ_API_BASE}${path}${query}`;
  const headers: Record<string, string> = {
    authorization: `QQBot ${accessToken}`,
    ...(opts.headers ?? {}),
  };
  let body: FormData | string | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`QQBot request failed ${opts.method ?? "GET"} ${path}: ${res.status} ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
  }
  return data as T;
}

export async function fetchGatewayUrl(runtime: QqbotPluginRuntime): Promise<string> {
  const data = await qqbotRequest<{ url?: string }>(runtime, "/gateway");
  if (!data?.url) throw new Error("QQBot gateway url missing");
  return data.url;
}

export interface QqbotMessagePayload {
  content?: string;
  msg_id?: string;
  event_id?: string;
  msg_seq?: number;
  msg_type?: number;
  media?: Record<string, unknown>;
  markdown?: Record<string, unknown>;
  keyboard?: Record<string, unknown>;
  stream?: {
    state: 1 | 10;
    id?: string | null;
    index: number;
    reset?: boolean;
  };
  image?: string;
  file_image?: string;
}

export interface QqbotMessageResponse {
  id?: string;
  message?: { id?: string };
  /** 消息索引，用户可引用此消息 */
  ref_idx?: string;
  ext_info?: { ref_idx?: string };
}

export async function sendQqbotMessage(
  runtime: QqbotPluginRuntime,
  target: QqbotTarget,
  payload: QqbotMessagePayload,
  meta: OutboundMeta = {},
): Promise<{ id?: string; message?: { id?: string }; ref_idx?: string }> {
  let result: QqbotMessageResponse;
  if (target.peerType === "c2c") {
    result = await qqbotRequest(runtime, `/v2/users/${encodeURIComponent(target.id)}/messages`, { body: payload });
  } else if (target.peerType === "group") {
    result = await qqbotRequest(runtime, `/v2/groups/${encodeURIComponent(target.id)}/messages`, { body: payload });
  } else if (target.peerType === "guild") {
    result = await qqbotRequest(runtime, `/channels/${encodeURIComponent(target.channelId || target.id)}/messages`, { body: payload });
  } else {
    result = await qqbotRequest(runtime, `/dms/${encodeURIComponent(target.guildId || target.id)}/messages`, { body: payload });
  }

  // 捕获 ref_idx 并触发钩子（用户可引用 bot 发出的消息）
  const refIdx = result?.ref_idx || result?.ext_info?.ref_idx;
  if (refIdx) {
    notifyMessageSent(refIdx, meta);
  }

  return { id: result?.id, message: result?.message, ref_idx: refIdx };
}

export async function deleteQqbotMessage(runtime: QqbotPluginRuntime, target: QqbotTarget, messageId: string): Promise<void> {
  if (target.peerType === "c2c") {
    await qqbotRequest(runtime, `/v2/users/${encodeURIComponent(target.id)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
    return;
  }
  if (target.peerType === "group") {
    await qqbotRequest(runtime, `/v2/groups/${encodeURIComponent(target.id)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
    return;
  }
  if (target.peerType === "guild") {
    await qqbotRequest(runtime, `/channels/${encodeURIComponent(target.channelId || target.id)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE", query: { hidetip: false } });
    return;
  }
  await qqbotRequest(runtime, `/dms/${encodeURIComponent(target.guildId || target.id)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE", query: { hidetip: false } });
}

export async function ackQqbotInteraction(runtime: QqbotPluginRuntime, interactionId: string, code: 0 | 1 | 2 | 3 | 4 | 5 = 0): Promise<void> {
  await qqbotRequest(runtime, `/interactions/${encodeURIComponent(interactionId)}`, {
    method: "PUT",
    body: { code },
  });
}

/**
 * 发送 C2C 输入状态通知（"正在输入..."）
 * 仅 C2C 私聊有效，QQ 群聊不支持。
 */
export async function sendC2CInputNotify(runtime: QqbotPluginRuntime, openid: string, msgId?: string): Promise<void> {
  if (!runtime.token) return;
  try {
    const msgSeq = msgId ? 1 : 1; // 简化：始终使用 1
    const payload = {
      msg_type: 6,
      input_notify: {
        input_type: 1,
        ...(msgId ? { msg_id: msgId } : {}),
      },
      ...(msgId ? { msg_id: msgId, msg_seq: msgSeq } : {}),
    };
    await qqbotRequest(runtime, `/v2/users/${encodeURIComponent(openid)}/messages`, { body: payload });
  } catch {
    // 输入状态通知失败不影响主流程，静默忽略
  }
}

export async function uploadQqbotFile(runtime: QqbotPluginRuntime, target: QqbotTarget, filePath: string, fileType: QqbotFileType, srvSendMsg = false): Promise<any> {
  const form = new FormData();
  form.set("file_type", String(fileType));
  form.set("srv_send_msg", srvSendMsg ? "true" : "false");
  form.set("file_data", Bun.file(filePath));

  if (target.peerType === "c2c") {
    return qqbotRequest(runtime, `/v2/users/${encodeURIComponent(target.id)}/files`, { body: form });
  }
  if (target.peerType === "group") {
    return qqbotRequest(runtime, `/v2/groups/${encodeURIComponent(target.id)}/files`, { body: form });
  }
  throw new Error("QQBot media upload is only supported for c2c/group targets");
}
