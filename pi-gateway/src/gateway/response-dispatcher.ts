import type { InboundMessage } from "../core/types.ts";
import type { GatewayContext } from "./types.ts";
import type { CommandResponse } from "./command-types.ts";
import { resolveChannelTarget } from "../api/channel-target.ts";
import { canSendKeyboard } from "../api/channel-capabilities.ts";

export async function dispatchCommandResponse(
  msg: InboundMessage,
  ctx: GatewayContext,
  response: CommandResponse,
): Promise<void> {
  const text = response.text ?? "";
  const channelPlugin = ctx.registry.channels.get(msg.source.channel);
  if (!channelPlugin || !response.keyboard || !canSendKeyboard(channelPlugin)) {
    await msg.respond(text);
    return;
  }

  const session = ctx.sessions.get(msg.sessionKey);
  const target = resolveChannelTarget(channelPlugin, msg.source.chatId, msg.sessionKey, session);
  const result = await channelPlugin.outbound.sendKeyboard(target, text, response.keyboard);
  if (!result.ok) {
    await msg.respond(text || result.error || "Failed to send rich response");
  }
}
