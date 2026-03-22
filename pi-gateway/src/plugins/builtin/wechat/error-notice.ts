/**
 * Send a plain-text error notice back to the user.
 * Fire-and-forget: errors are logged but never thrown, so callers stay unaffected.
 * No-op when contextToken is absent (we have no conversation reference to reply into).
 */
import type { WechatAccountRuntime } from "./types.ts";
import { sendWechatText } from "./outbound.ts";
import { logger } from "./logger.ts";

export interface WechatErrorNoticeParams {
  runtime: WechatAccountRuntime;
  to: string;
  contextToken: string | undefined;
  message: string;
}

/**
 * Send an error notification message to the user.
 * This is fire-and-forget — errors are logged but never thrown.
 */
export async function sendWechatErrorNotice(params: WechatErrorNoticeParams): Promise<void> {
  const { runtime, to, contextToken, message } = params;
  if (!contextToken) {
    logger.warn(`sendWechatErrorNotice: no contextToken for to=${to}, cannot notify user`);
    return;
  }
  try {
    await sendWechatText(runtime, `c2c|${to}`, message);
    logger.debug(`sendWechatErrorNotice: sent to=${to}`);
  } catch (err) {
    logger.error(`[wechat] sendWechatErrorNotice failed to=${to}: ${String(err)}`);
  }
}
