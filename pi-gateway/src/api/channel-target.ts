import type { SessionState } from "../core/types.ts";
import type { ChannelPlugin } from "../plugins/types.ts";

/**
 * Resolve outbound channel target from session state.
 *
 * Default behavior is plain chatId.
 * Channel-specific formatting is delegated to channel plugin.resolveTarget().
 */
export function resolveChannelTarget(
  channelPlugin: ChannelPlugin | undefined,
  chatId: string,
  sessionKey?: string,
  session?: SessionState,
): string {
  if (channelPlugin?.resolveTarget) {
    return channelPlugin.resolveTarget({ chatId, sessionKey, session });
  }
  return chatId;
}
