import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { WechatAccountRuntime, WechatSendMessageReq, WechatInboundMessage } from "./types.ts";
import { loadConfigRouteTag } from "./accounts.ts";
import { checkSessionActive, getSessionStatus, SESSION_EXPIRED_ERRCODE } from "./session.ts";
import { redactUrl, redactBody, logger } from "./logger.ts";

/**
 * ilink API endpoints.
 */
const ILINK_GETUPDATES = "/ilink/bot/getupdates";
const ILINK_SENDMESSAGE = "/ilink/bot/sendmessage";
const ILINK_GETUPLOADURL = "/ilink/bot/getuploadurl";
const ILINK_GETCONFIG = "/ilink/bot/getconfig";
const ILINK_SENDTYPING = "/ilink/bot/sendtyping";

/**
 * Default request timeout.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Long-poll timeout for getUpdates.
 */
const LONG_POLL_TIMEOUT_MS = 60_000;

/**
 * Config request timeout.
 */
const DEFAULT_CONFIG_TIMEOUT_MS = 10_000;

const CHANNEL_VERSION = (() => {
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
})();

function buildBaseInfo(): { channel_version: string } {
  return { channel_version: CHANNEL_VERSION };
}

/**
 * Generate X-WECHAT-UIN header: random uint32 -> base64.
 */
function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

/**
 * Send an HTTP request to ilink API.
 */
async function ilinkRequest<T>(
  runtime: WechatAccountRuntime | { baseUrl: string; token?: string },
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
    label?: string;
  } = {}
): Promise<T> {
  const { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS, label = path } = opts;
  const baseUrl = runtime.baseUrl;
  const token = runtime.token;

  const url = `${baseUrl}${path}`;

  if ("accountId" in runtime && !checkSessionActive(runtime)) {
    const status = getSessionStatus(runtime.accountId);
    const reason = status.expired
      ? `WeChat session expired for accountId=${runtime.accountId}; please re-login via QR`
      : `WeChat session paused for accountId=${runtime.accountId}; retry after ${Math.ceil(status.remainingPauseMs / 1000)}s`;
    throw new WechatApiError(reason, { errcode: SESSION_EXPIRED_ERRCODE, errmsg: reason });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "AuthorizationType": "ilink_bot_token",
    "X-WECHAT-UIN": randomWechatUin(),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const routeTag = "accountId" in runtime ? loadConfigRouteTag(runtime.accountId) : loadConfigRouteTag();
  if (routeTag) {
    headers["SKRouteTag"] = routeTag;
  }

  logger.debug(`[wechat:api] ${method} ${redactUrl(url)} body=${body ? redactBody(JSON.stringify(body)) : "(none)"}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    logger.debug(`[wechat:api] ${label} status=${res.status} response=${redactBody(text.slice(0, 200))}`);

    if (!res.ok) {
      throw new Error(
        `Weixin API error ${method} ${path}: ${res.status} ${
          typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)
        }`
      );
    }

    return data as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.debug(`[wechat:api] ${label} timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * GetUpdates response from ilink API.
 */
interface GetUpdatesResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WechatInboundMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

export class WechatApiError extends Error {
  ret?: number;
  errcode?: number;
  errmsg?: string;

  constructor(message: string, details?: { ret?: number; errcode?: number; errmsg?: string }) {
    super(message);
    this.name = "WechatApiError";
    this.ret = details?.ret;
    this.errcode = details?.errcode;
    this.errmsg = details?.errmsg;
  }
}

function assertWechatApiOk(
  label: string,
  response: { ret?: number; errcode?: number; errmsg?: string },
): void {
  const ret = response.ret;
  const errcode = response.errcode;
  const errmsg = response.errmsg;

  if ((typeof ret === "number" && ret !== 0) || (typeof errcode === "number" && errcode !== 0)) {
    throw new WechatApiError(
      `Weixin ${label} failed: ret=${ret ?? "undefined"} errcode=${errcode ?? "undefined"} msg=${errmsg ?? ""}`,
      { ret, errcode, errmsg },
    );
  }
}

/**
 * SendMessage response from ilink API.
 */
interface SendMessageResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  data?: {
    msg_id?: string;
    client_id?: string;
  };
}

/**
 * GetConfig response from ilink API.
 */
interface GetConfigResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  typing_ticket?: string;
}

/**
 * SendTyping request.
 */
interface SendTypingRequest {
  ilink_user_id: string;
  typing_ticket: string;
  status: number;
}

/**
 * GetUploadUrl request.
 */
interface GetUploadUrlRequest {
  filekey: string;
  media_type: number;
  to_user_id: string;
  rawsize: number;
  rawfilemd5: string;
  filesize: number;
  no_need_thumb?: boolean;
  aeskey: string;
  thumb_rawsize?: number;
  thumb_rawfilemd5?: string;
  thumb_filesize?: number;
}

/**
 * GetUploadUrl response.
 */
interface GetUploadUrlResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  upload_param?: string;
  thumb_upload_param?: string;
}

/**
 * Long-poll for new messages from ilink API.
 */
export async function fetchWechatUpdates(
  runtime: WechatAccountRuntime
): Promise<{ messages: WechatInboundMessage[]; getUpdatesBuf?: string; longpollingTimeoutMs?: number }> {
  const response = await ilinkRequest<GetUpdatesResponse>(runtime, ILINK_GETUPDATES, {
    method: "POST",
    body: { get_updates_buf: runtime.syncBuf ?? "", base_info: buildBaseInfo() },
    timeoutMs: LONG_POLL_TIMEOUT_MS + 10_000,
    label: "getUpdates",
  });

  assertWechatApiOk("getUpdates", response);

  return {
    messages: response.msgs ?? [],
    getUpdatesBuf: response.get_updates_buf,
    longpollingTimeoutMs: response.longpolling_timeout_ms,
  };
}

/**
 * Send a message via ilink sendMessage API.
 */
export async function sendWechatMessage(
  runtime: WechatAccountRuntime,
  req: WechatSendMessageReq
): Promise<{ messageId: string }> {
  if (!req.msg.context_token) {
    logger.warn("sendWechatMessage: context_token missing, message may not associate with conversation");
  }

  const response = await ilinkRequest<SendMessageResponse>(runtime, ILINK_SENDMESSAGE, {
    method: "POST",
    body: { ...req, base_info: buildBaseInfo() },
    label: "sendMessage",
  });

  assertWechatApiOk("sendMessage", response);

  return {
    messageId: response.data?.msg_id || response.data?.client_id || req.msg.client_id,
  };
}

/**
 * Get bot config including typing_ticket.
 */
export async function getWechatConfig(
  runtime: WechatAccountRuntime,
  ilinkUserId: string,
  contextToken?: string
): Promise<{ typingTicket?: string }> {
  const response = await ilinkRequest<GetConfigResponse>(runtime, ILINK_GETCONFIG, {
    method: "POST",
    body: {
      ilink_user_id: ilinkUserId,
      context_token: contextToken,
      base_info: buildBaseInfo(),
    },
    timeoutMs: DEFAULT_CONFIG_TIMEOUT_MS,
    label: "getConfig",
  });

  assertWechatApiOk("getConfig", response);

  return {
    typingTicket: response.typing_ticket,
  };
}

/**
 * Send typing indicator.
 */
export async function sendWechatTyping(
  runtime: WechatAccountRuntime,
  req: SendTypingRequest
): Promise<void> {
  const response = await ilinkRequest<{ ret?: number; errcode?: number; errmsg?: string }>(runtime, ILINK_SENDTYPING, {
    method: "POST",
    body: { ...req, base_info: buildBaseInfo() },
    timeoutMs: DEFAULT_CONFIG_TIMEOUT_MS,
    label: "sendTyping",
  });
  assertWechatApiOk("sendTyping", response);
}

/**
 * Get CDN upload URL.
 */
export async function getWechatUploadUrl(
  runtime: WechatAccountRuntime,
  req: GetUploadUrlRequest
): Promise<{ uploadParam: string; thumbUploadParam?: string }> {
  const response = await ilinkRequest<GetUploadUrlResponse>(runtime, ILINK_GETUPLOADURL, {
    method: "POST",
    body: { ...req, base_info: buildBaseInfo() },
    label: "getUploadUrl",
  });

  assertWechatApiOk("getUploadUrl", response);

  return {
    uploadParam: response.upload_param ?? "",
    thumbUploadParam: response.thumb_upload_param,
  };
}

/**
 * Generate a unique client ID for message tracking.
 */
export function generateClientId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "wechat-";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
