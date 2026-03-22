/**
 * Feishu account resolution — multi-account support.
 *
 * Provides:
 * - Account listing and resolution
 * - Credential extraction
 * - Config merging (top-level + account-specific)
 *
 * Aligned with openclaw multi-account architecture.
 */

import type { GatewayContext } from "../../../gateway/types.ts";
import type {
  FeishuChannelConfig,
  FeishuAccountConfig,
  FeishuDomain,
  ResolvedFeishuAccount,
  FeishuAccountSelectionSource,
  DEFAULT_ACCOUNT_ID,
} from "./types.ts";

// ============================================================================
// Account ID Helpers
// ============================================================================

export const DEFAULT_ACCOUNT = "default";

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

// ============================================================================
// Account Listing
// ============================================================================

/**
 * List all configured account IDs from the accounts field.
 */
function listConfiguredAccountIds(cfg: GatewayContext["config"]): string[] {
  const feishuCfg = cfg.channels?.feishu as FeishuChannelConfig | undefined;
  const accounts = feishuCfg?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

/**
 * List all Feishu account IDs.
 * If no accounts are configured, returns ["default"] for backward compatibility.
 */
export function listFeishuAccountIds(cfg: GatewayContext["config"]): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT];
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

/**
 * List all enabled Feishu accounts.
 */
export function listEnabledFeishuAccounts(cfg: GatewayContext["config"]): ResolvedFeishuAccount[] {
  const ids = listFeishuAccountIds(cfg);
  return ids
    .map((id) => resolveFeishuAccount({ cfg, accountId: id }))
    .filter((account) => account.enabled && account.configured);
}

// ============================================================================
// Default Account Resolution
// ============================================================================

/**
 * Resolve the default account selection and its source.
 */
export function resolveDefaultFeishuAccountSelection(cfg: GatewayContext["config"]): {
  accountId: string;
  source: FeishuAccountSelectionSource;
} {
  const feishuCfg = cfg.channels?.feishu as FeishuChannelConfig | undefined;
  const preferredRaw = feishuCfg?.defaultAccount?.trim();
  const preferred = preferredRaw ? normalizeAccountId(preferredRaw) : undefined;

  if (preferred) {
    return {
      accountId: preferred,
      source: "explicit-default",
    };
  }

  const ids = listFeishuAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT)) {
    return {
      accountId: DEFAULT_ACCOUNT,
      source: "mapped-default",
    };
  }

  return {
    accountId: ids[0] ?? DEFAULT_ACCOUNT,
    source: "fallback",
  };
}

/**
 * Resolve the default account ID.
 */
export function resolveDefaultFeishuAccountId(cfg: GatewayContext["config"]): string {
  return resolveDefaultFeishuAccountSelection(cfg).accountId;
}

// ============================================================================
// Config Merging
// ============================================================================

/**
 * Get the raw account-specific config.
 */
function resolveAccountConfig(
  cfg: GatewayContext["config"],
  accountId: string,
): FeishuAccountConfig | undefined {
  const feishuCfg = cfg.channels?.feishu as FeishuChannelConfig | undefined;
  const accounts = feishuCfg?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId];
}

/**
 * Merge top-level config with account-specific config.
 * Account-specific fields override top-level fields.
 */
function mergeFeishuAccountConfig(
  cfg: GatewayContext["config"],
  accountId: string,
): FeishuChannelConfig {
  const feishuCfg = cfg.channels?.feishu as FeishuChannelConfig | undefined;

  // Extract base config (exclude accounts field to avoid recursion)
  const { accounts: _ignored, defaultAccount: _ignoredDefault, ...base } = feishuCfg ?? {};

  // Get account-specific overrides
  const account = resolveAccountConfig(cfg, accountId) ?? {};

  // Merge: account config overrides base config
  return { ...base, ...account } as FeishuChannelConfig;
}

// ============================================================================
// Credential Resolution
// ============================================================================

/**
 * Resolve Feishu credentials from a config.
 */
export function resolveFeishuCredentials(cfg?: FeishuChannelConfig): {
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  domain: FeishuDomain;
} | null {
  const appId = normalizeString(cfg?.appId);
  const appSecret = normalizeString(cfg?.appSecret);

  if (!appId || !appSecret) {
    return null;
  }

  const connectionMode = cfg?.connectionMode ?? "websocket";
  return {
    appId,
    appSecret,
    encryptKey:
      connectionMode === "webhook"
        ? normalizeString(cfg?.encryptKey)
        : normalizeString(cfg?.encryptKey),
    verificationToken: normalizeString(cfg?.verificationToken),
    domain: cfg?.domain ?? "feishu",
  };
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

// ============================================================================
// Account Resolution
// ============================================================================

/**
 * Resolve a complete Feishu account with merged config.
 */
export function resolveFeishuAccount(params: {
  cfg: GatewayContext["config"];
  accountId?: string | null;
}): ResolvedFeishuAccount {
  const { cfg } = params;
  const hasExplicitAccountId =
    typeof params.accountId === "string" && params.accountId.trim() !== "";

  const defaultSelection = hasExplicitAccountId
    ? null
    : resolveDefaultFeishuAccountSelection(cfg);

  const accountId = hasExplicitAccountId
    ? normalizeAccountId(params.accountId as string)
    : defaultSelection!.accountId;

  const selectionSource: FeishuAccountSelectionSource = hasExplicitAccountId
    ? "explicit"
    : defaultSelection!.source;

  // Merge configs
  const mergedConfig = mergeFeishuAccountConfig(cfg, accountId);

  // Resolve credentials from merged config
  const credentials = resolveFeishuCredentials(mergedConfig);

  // Determine enabled/configured status
  const enabled = mergedConfig.enabled !== false;
  const configured = credentials !== null;

  return {
    accountId,
    selectionSource,
    enabled,
    configured,
    name: (mergedConfig as any).name,
    appId: credentials?.appId ?? undefined,
    appSecret: credentials?.appSecret ?? undefined,
    encryptKey: credentials?.encryptKey ?? undefined,
    verificationToken: credentials?.verificationToken,
    domain: credentials?.domain ?? "feishu",
    config: mergedConfig,
  };
}

/**
 * Resolve Feishu credentials for a specific account.
 */
export function resolveFeishuAccountCredentials(params: {
  cfg: GatewayContext["config"];
  accountId?: string | null;
}): {
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  domain: FeishuDomain;
} | null {
  const account = resolveFeishuAccount(params);
  if (!account.configured) {
    return null;
  }
  return {
    appId: account.appId!,
    appSecret: account.appSecret!,
    encryptKey: account.encryptKey,
    verificationToken: account.verificationToken,
    domain: account.domain,
  };
}

// ============================================================================
// Account Validation
// ============================================================================

/**
 * Check if an account is available (enabled and configured).
 */
export function isFeishuAccountAvailable(params: {
  cfg: GatewayContext["config"];
  accountId?: string | null;
}): boolean {
  const account = resolveFeishuAccount(params);
  return account.enabled && account.configured;
}

/**
 * Get all available accounts.
 */
export function getAvailableFeishuAccounts(cfg: GatewayContext["config"]): ResolvedFeishuAccount[] {
  const ids = listFeishuAccountIds(cfg);
  return ids
    .map((id) => resolveFeishuAccount({ cfg, accountId: id }))
    .filter((account) => account.enabled && account.configured);
}
