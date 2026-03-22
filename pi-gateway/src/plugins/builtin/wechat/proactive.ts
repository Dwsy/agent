/**
 * 主动消息 — WeChat
 *
 * 支持向已知用户主动发送消息（不等待用户触发）。
 */
import type { WechatAccountRuntime } from "./types.ts";
import { sendWechatText } from "./outbound.ts";
import { getWechatKnownUsers } from "./known-users.ts";

export interface ProactiveSendOptions {
  to: string;
  text: string;
}

export interface ProactiveSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 主动发送消息给指定用户
 */
export async function sendProactiveWechatMessage(
  runtime: WechatAccountRuntime,
  options: ProactiveSendOptions
): Promise<ProactiveSendResult> {
  try {
    const result = await sendWechatText(runtime, `c2c|${options.to}`, options.text);
    if (!result.ok) {
      return { success: false, error: result.error };
    }
    return { success: true, messageId: result.messageId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 广播消息给所有已知用户
 */
export async function broadcastWechatMessage(
  runtime: WechatAccountRuntime,
  text: string,
  accountId?: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const users = getWechatKnownUsers(accountId ?? runtime.accountId);
  const c2cUsers = users.filter(u => u.type === "c2c");
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const user of c2cUsers) {
    const result = await sendProactiveWechatMessage(runtime, {
      to: user.openid,
      text,
    });
    if (result.success) {
      sent++;
    } else {
      failed++;
      if (result.error) errors.push(`${user.openid}: ${result.error}`);
    }
  }

  return { sent, failed, errors };
}
