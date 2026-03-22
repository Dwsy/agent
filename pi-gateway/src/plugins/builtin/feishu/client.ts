/**
 * Lark SDK client creation and caching — multi-account support.
 */
import * as Lark from "@larksuiteoapi/node-sdk";
import type { FeishuChannelConfig, ResolvedFeishuAccount, FeishuDomain } from "./types.ts";

// ============================================================================
// Client Cache (multi-account)
// ============================================================================

const clientCache = new Map<string, Lark.Client>();
const wsClientCache = new Map<string, Lark.WSClient>();

function resolveDomain(domain?: string): Lark.Domain | string {
  if (domain === "lark") return Lark.Domain.Lark;
  if (!domain || domain === "feishu") return Lark.Domain.Feishu;
  return domain.replace(/\/+$/, "");
}

function getClientKey(appId: string, domain: FeishuDomain): string {
  return `${appId}:${domain}`;
}

// ============================================================================
// Client Creation
// ============================================================================

/**
 * Create or retrieve a cached Lark Client for an account.
 */
export function createFeishuClient(account: ResolvedFeishuAccount): Lark.Client;
export function createFeishuClient(cfg: FeishuChannelConfig): Lark.Client;
export function createFeishuClient(input: ResolvedFeishuAccount | FeishuChannelConfig): Lark.Client {
  const appId = "accountId" in input ? input.appId : input.appId;
  const domain: FeishuDomain = "accountId" in input ? input.domain : (input.domain ?? "feishu");
  const appSecret = "accountId" in input ? input.appSecret : input.appSecret;

  if (!appId || !appSecret) {
    throw new Error("Feishu appId and appSecret are required");
  }

  const key = getClientKey(appId, domain);
  const cached = clientCache.get(key);
  if (cached) return cached;

  const client = new Lark.Client({
    appId,
    appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveDomain(domain),
  });
  clientCache.set(key, client);
  return client;
}

/**
 * Create or retrieve a cached WebSocket Client for an account.
 */
export function createFeishuWSClient(account: ResolvedFeishuAccount): Lark.WSClient;
export function createFeishuWSClient(cfg: FeishuChannelConfig): Lark.WSClient;
export function createFeishuWSClient(input: ResolvedFeishuAccount | FeishuChannelConfig): Lark.WSClient {
  const appId = "accountId" in input ? input.appId : input.appId;
  const domain: FeishuDomain = "accountId" in input ? input.domain : (input.domain ?? "feishu");
  const appSecret = "accountId" in input ? input.appSecret : input.appSecret;

  if (!appId || !appSecret) {
    throw new Error("Feishu appId and appSecret are required");
  }

  const key = getClientKey(appId, domain);
  const cached = wsClientCache.get(key);
  if (cached) return cached;

  const wsClient = new Lark.WSClient({
    appId,
    appSecret,
    domain: resolveDomain(domain),
    loggerLevel: Lark.LoggerLevel.info,
  });
  wsClientCache.set(key, wsClient);
  return wsClient;
}

/**
 * Create event dispatcher for a config.
 */
export function createEventDispatcher(cfg: FeishuChannelConfig): Lark.EventDispatcher {
  return new Lark.EventDispatcher({});
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Clear a specific client from cache.
 */
export function clearClient(accountId: string, domain: FeishuDomain): void {
  const key = getClientKey(accountId, domain);
  clientCache.delete(key);
  wsClientCache.delete(key);
}

/**
 * Clear all cached clients.
 */
export function clearClientCache(): void {
  clientCache.clear();
  wsClientCache.clear();
}

/**
 * Get all cached account keys.
 */
export function getCachedAccountKeys(): string[] {
  return Array.from(clientCache.keys());
}
