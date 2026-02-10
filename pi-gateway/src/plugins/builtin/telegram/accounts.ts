import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { TelegramAccountConfig, TelegramChannelConfig } from "../../../core/config.ts";
import { DEFAULT_ACCOUNT_ID, type TelegramResolvedAccount } from "./types.ts";

function resolveToken(cfg: TelegramAccountConfig): string {
  if (cfg.botToken?.trim()) return cfg.botToken.trim();
  if (cfg.tokenFile?.trim()) {
    const tokenFile = cfg.tokenFile.replace(/^~/, homedir());
    if (existsSync(tokenFile)) {
      const token = readFileSync(tokenFile, "utf-8").trim();
      if (token) return token;
    }
  }
  if (process.env.TELEGRAM_BOT_TOKEN?.trim()) return process.env.TELEGRAM_BOT_TOKEN.trim();
  return "";
}

function mergeAccountConfig(base: TelegramChannelConfig, account?: TelegramAccountConfig): TelegramAccountConfig {
  const {
    accounts: _accounts,
    enabled,
    botToken,
    tokenFile,
    dmPolicy,
    allowFrom,
    groupAllowFrom,
    groupPolicy,
    messageMode,
    role,
    groups,
    mediaMaxMb,
    streamMode,
    replyToMode,
    proxy,
    webhookUrl,
    webhookSecret,
    webhookPath,
    reactionLevel,
    reactionNotifications,
    commands,
    customCommands,
    draftChunk,
    textChunkLimit,
    chunkMode,
    linkPreview,
  } = base;

  const merged: TelegramAccountConfig = {
    enabled,
    botToken,
    tokenFile,
    dmPolicy,
    allowFrom,
    groupAllowFrom,
    groupPolicy,
    messageMode,
    role,
    groups,
    mediaMaxMb,
    streamMode,
    replyToMode,
    proxy,
    webhookUrl,
    webhookSecret,
    webhookPath,
    reactionLevel,
    reactionNotifications,
    commands,
    customCommands,
    draftChunk,
    textChunkLimit,
    chunkMode,
    linkPreview,
    ...(account ?? {}),
  };

  return merged;
}

export function resolveTelegramAccounts(channelCfg: TelegramChannelConfig): TelegramResolvedAccount[] {
  const accountEntries = Object.entries(channelCfg.accounts ?? {});

  if (accountEntries.length === 0) {
    const cfg = mergeAccountConfig(channelCfg);
    const token = resolveToken(cfg);
    if (!token) return [];
    return [{ accountId: DEFAULT_ACCOUNT_ID, enabled: cfg.enabled !== false, token, cfg }];
  }

  const out: TelegramResolvedAccount[] = [];
  for (const [accountId, accountCfg] of accountEntries) {
    if (!accountCfg) continue;
    const cfg = mergeAccountConfig(channelCfg, accountCfg);
    const enabled = channelCfg.enabled !== false && cfg.enabled !== false;
    const token = resolveToken(cfg);
    if (!enabled || !token) continue;
    out.push({ accountId, enabled, token, cfg });
  }

  // Backward compatibility: no explicit default account, but top-level token exists.
  if (!out.some((a) => a.accountId === DEFAULT_ACCOUNT_ID)) {
    const baseCfg = mergeAccountConfig(channelCfg);
    const token = resolveToken(baseCfg);
    if (token && channelCfg.enabled !== false && baseCfg.enabled !== false) {
      out.unshift({ accountId: DEFAULT_ACCOUNT_ID, enabled: true, token, cfg: baseCfg });
    }
  }

  return out;
}

export function resolveDefaultAccountId(channelCfg: TelegramChannelConfig): string {
  const ids = Object.keys(channelCfg.accounts ?? {});
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}
