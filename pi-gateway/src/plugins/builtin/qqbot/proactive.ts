/**
 * 主动消息模块
 *
 * 主动向用户或群组发送消息，支持：
 * 1. 主动发送文本/图片消息
 * 2. 查询已知用户列表
 */
import type { QqbotPluginRuntime } from "./types.ts";
import { ensureAccessToken } from "./api.ts";
import { getKnownUsers } from "./known-users.ts";

/**
 * 主动发送消息选项
 */
export interface ProactiveSendOptions {
  to: string;
  text: string;
  type?: "c2c" | "group";
  accountId?: string;
}

/**
 * 主动发送消息结果
 */
export interface ProactiveSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 主动发送 C2C 消息（用于通知、升级提醒等）
 */
export async function sendProactiveC2CMessage(
  runtime: QqbotPluginRuntime,
  openid: string,
  text: string,
): Promise<ProactiveSendResult> {
  try {
    const auth = await ensureAccessToken(runtime);
    const token = auth.accessToken;
    const endpoint = `https://api.sgroup.qq.com/openimsdk/post/v1/c2c/${openid}`;
    const body = {
      msg_type: 1, // 文本
      content: JSON.stringify({ text }),
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}` };
    }

    const data = await resp.json() as { msg_id?: string };
    return { success: true, messageId: data.msg_id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * 获取已知用户列表
 */
export function listKnownUsersForPlugin(accountId?: string): ReturnType<typeof getKnownUsers> {
  return getKnownUsers(accountId);
}

/**
 * 获取已知用户数
 */
export function getKnownUserCountForPlugin(accountId?: string): number {
  return getKnownUsers(accountId).length;
}
