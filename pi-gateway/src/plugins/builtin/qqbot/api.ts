import type { QqbotPluginRuntime, QqbotAuthToken, QqbotFileType, QqbotTarget } from "./types.ts";

const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const QQ_API_BASE = "https://api.sgroup.qq.com";

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

export async function sendQqbotMessage(runtime: QqbotPluginRuntime, target: QqbotTarget, payload: QqbotMessagePayload): Promise<{ id?: string; message?: { id?: string } }> {
  if (target.peerType === "c2c") {
    return qqbotRequest(runtime, `/v2/users/${encodeURIComponent(target.id)}/messages`, { body: payload });
  }
  if (target.peerType === "group") {
    return qqbotRequest(runtime, `/v2/groups/${encodeURIComponent(target.id)}/messages`, { body: payload });
  }
  if (target.peerType === "guild") {
    return qqbotRequest(runtime, `/channels/${encodeURIComponent(target.channelId || target.id)}/messages`, { body: payload });
  }
  return qqbotRequest(runtime, `/dms/${encodeURIComponent(target.guildId || target.id)}/messages`, { body: payload });
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
