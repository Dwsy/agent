import type { WechatChannelConfig } from "./types.ts";

/**
 * Default ilink API base URL.
 */
export const DEFAULT_ILINK_BASE_URL = "https://ilinkai.weixin.qq.com";

/**
 * Default CDN base URL for media upload/download.
 */
export const DEFAULT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

/**
 * Resolve Weixin channel configuration with defaults.
 */
export function resolveWechatConfig(
  raw: WechatChannelConfig | undefined
): WechatChannelConfig {
  const cfg: WechatChannelConfig = {
    enabled: raw?.enabled ?? false,
    accountId: raw?.accountId?.trim() || undefined,
    baseUrl: raw?.baseUrl?.trim() || DEFAULT_ILINK_BASE_URL,
    cdnBaseUrl: raw?.cdnBaseUrl?.trim() || DEFAULT_CDN_BASE_URL,
    token: raw?.token?.trim() || undefined,
    dmPolicy: raw?.dmPolicy ?? "pairing",
    allowFrom: raw?.allowFrom ?? [],
    role: raw?.role?.trim() || undefined,
    model: raw?.model?.trim() || undefined,
    thinkingLevel: raw?.thinkingLevel,
    textChunkLimit: raw?.textChunkLimit ?? 4000,
    streaming: {
      enabled: raw?.streaming?.enabled ?? true,
      editThrottleMs: raw?.streaming?.editThrottleMs ?? 1200,
      streamStartChars: raw?.streaming?.streamStartChars ?? 80,
    },
    accounts: raw?.accounts
      ? Object.fromEntries(
          Object.entries(raw.accounts).map(([id, account]) => [
            id,
            {
              ...account,
              name: account.name?.trim() || undefined,
              token: account.token?.trim() || undefined,
              baseUrl: account.baseUrl?.trim() || undefined,
              cdnBaseUrl: account.cdnBaseUrl?.trim() || undefined,
            },
          ]),
        )
      : undefined,
  };
  return cfg;
}

/**
 * Check if Weixin channel has required credentials.
 */
export function hasWechatCredentials(cfg: WechatChannelConfig): boolean {
  return Boolean(cfg.token && cfg.accountId);
}

/**
 * Text chunk limit for Weixin (max ~4000 chars per message).
 */
export const WECHAT_PLATFORM_TEXT_LIMIT = 4000;
