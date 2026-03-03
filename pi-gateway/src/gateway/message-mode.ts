import type { MessageSource, SessionKey } from "../core/types.ts";
import type { GatewayContext } from "./types.ts";

export type SessionMessageMode = "steer" | "follow-up" | "interrupt";

export function normalizeSessionMessageMode(value: unknown): SessionMessageMode | null {
  return value === "steer" || value === "follow-up" || value === "interrupt"
    ? value
    : null;
}

export function extractChannelAccountId(sessionKey: SessionKey, source: MessageSource): string | undefined {
  if (source.accountId?.trim()) return source.accountId.trim();
  const channel = source.channel;
  const regex = new RegExp(`^agent:[^:]+:${channel}:account:([^:]+):`);
  const matched = String(sessionKey).match(regex);
  return matched?.[1];
}

export function resolveSessionMessageMode(
  sessionKey: SessionKey,
  source: MessageSource,
  ctx: GatewayContext,
): SessionMessageMode {
  const override = ctx.sessionMessageModeOverrides.get(sessionKey);
  if (override) return override;

  const channelCfg = (ctx.config.channels as Record<string, any> | undefined)?.[source.channel] as Record<string, any> | undefined;
  const accountId = extractChannelAccountId(sessionKey, source);
  const accountMode = accountId
    ? normalizeSessionMessageMode(channelCfg?.accounts?.[accountId]?.messageMode)
    : null;
  const channelMode = normalizeSessionMessageMode(channelCfg?.messageMode);
  const agentMode = normalizeSessionMessageMode(ctx.config.agent.messageMode);

  return accountMode ?? channelMode ?? agentMode ?? "steer";
}
