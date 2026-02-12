/**
 * Lark SDK client creation and caching.
 */
import * as Lark from "@larksuiteoapi/node-sdk";
import type { FeishuChannelConfig } from "./types.ts";

const clientCache = new Map<string, Lark.Client>();

function resolveDomain(domain?: string): Lark.Domain | string {
  if (domain === "lark") return Lark.Domain.Lark;
  if (!domain || domain === "feishu") return Lark.Domain.Feishu;
  return domain.replace(/\/+$/, "");
}

export function createFeishuClient(cfg: FeishuChannelConfig): Lark.Client {
  const key = `${cfg.appId}:${cfg.domain ?? "feishu"}`;
  const cached = clientCache.get(key);
  if (cached) return cached;

  const client = new Lark.Client({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveDomain(cfg.domain),
  });
  clientCache.set(key, client);
  return client;
}

export function createFeishuWSClient(cfg: FeishuChannelConfig): Lark.WSClient {
  return new Lark.WSClient({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    domain: resolveDomain(cfg.domain),
    loggerLevel: Lark.LoggerLevel.info,
  });
}

export function createEventDispatcher(cfg: FeishuChannelConfig): Lark.EventDispatcher {
  return new Lark.EventDispatcher({});
}

export function clearClientCache(): void {
  clientCache.clear();
}
