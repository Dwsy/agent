import type { MessageActionResult, ReadHistoryResult } from "../../types.ts";
import type { WechatPluginRuntime } from "./types.ts";

/**
 * Weixin does not support message editing.
 * This is a placeholder that returns an error.
 */
export async function editWechatOutbound(): Promise<MessageActionResult> {
  return {
    ok: false,
    error: "WeChat does not support message editing",
  };
}

/**
 * Weixin does not support message deletion.
 * This is a placeholder that returns an error.
 */
export async function deleteWechatOutbound(
  runtime: WechatPluginRuntime,
  target: string,
  messageId: string
): Promise<MessageActionResult> {
  runtime.api.logger.warn(
    `deleteWechatOutbound: not supported, target=${target} messageId=${messageId}`
  );
  return {
    ok: false,
    error: "WeChat does not support message deletion",
  };
}

/**
 * Weixin does not support reading history.
 * This is a placeholder that returns an error.
 */
export async function readWechatHistory(): Promise<ReadHistoryResult> {
  return {
    ok: false,
    error: "WeChat does not support reading message history",
  };
}

/**
 * Weixin does not support reactions.
 * This is a placeholder that returns an error.
 */
export async function reactWechatMessage(
  runtime: WechatPluginRuntime,
  target: string,
  messageId: string,
  emoji: string
): Promise<MessageActionResult> {
  runtime.api.logger.warn(
    `reactWechatMessage: not supported, target=${target} messageId=${messageId} emoji=${emoji}`
  );
  return {
    ok: false,
    error: "WeChat does not support message reactions",
  };
}

/**
 * Weixin does not support pinning messages.
 * This is a placeholder that returns an error.
 */
export async function pinWechatMessage(
  runtime: WechatPluginRuntime,
  target: string,
  messageId: string
): Promise<MessageActionResult> {
  runtime.api.logger.warn(
    `pinWechatMessage: not supported, target=${target} messageId=${messageId}`
  );
  return {
    ok: false,
    error: "WeChat does not support pinning messages",
  };
}
