import type { GatewayPluginApi } from "../../types.ts";
import type {
  WechatAccountRuntime,
  WechatChannelConfig,
  WechatInboundMessage,
  WechatResolvedAccount,
} from "./types.ts";
import { startWechatGateway, stopWechatGateway } from "./gateway.ts";
import { logger } from "./logger.ts";

export interface ActivateWechatAccountParams {
  api: GatewayPluginApi;
  channelCfg: WechatChannelConfig;
  accounts: Map<string, WechatAccountRuntime>;
  defaultAccountId: string;
  account: WechatResolvedAccount;
  onMessage: (msg: WechatInboundMessage) => Promise<void>;
  startGateway?: typeof startWechatGateway;
  stopGateway?: typeof stopWechatGateway;
}

export interface ActivateWechatAccountResult {
  accountRuntime: WechatAccountRuntime;
  defaultAccountId: string;
}

function buildWechatAccountRuntime(
  api: GatewayPluginApi,
  channelCfg: WechatChannelConfig,
  account: WechatResolvedAccount,
): WechatAccountRuntime {
  return {
    api,
    channelCfg,
    accountId: account.accountId,
    token: account.token,
    baseUrl: account.baseUrl,
    cdnBaseUrl: account.cdnBaseUrl,
    name: account.name,
    userId: account.userId,
    dmPolicy: account.dmPolicy,
    allowFrom: account.allowFrom,
    pollTimer: null,
    reconnectTimer: null,
    disposed: false,
    contextTokens: new Map(),
    dedup: new Map(),
    streamPlaceholders: new Map(),
    syncBuf: "",
    syncBufPath: "",
    lastEventAt: undefined,
    lastInboundAt: undefined,
    lastOutboundAt: undefined,
    lastError: undefined,
    typingTicket: undefined,
  };
}

export async function activateWechatAccount(
  params: ActivateWechatAccountParams,
): Promise<ActivateWechatAccountResult> {
  const {
    api,
    channelCfg,
    accounts,
    defaultAccountId,
    account,
    onMessage,
    startGateway = startWechatGateway,
    stopGateway = stopWechatGateway,
  } = params;

  const existing = accounts.get(account.accountId);
  if (existing) {
    await stopGateway(existing);
  }

  const accountRuntime = buildWechatAccountRuntime(api, channelCfg, account);
  accounts.set(account.accountId, accountRuntime);

  const nextDefaultAccountId =
    accounts.size === 1 || !accounts.has(defaultAccountId) || defaultAccountId === "default"
      ? account.accountId
      : defaultAccountId;

  try {
    await startGateway(accountRuntime, onMessage);
  } catch (err) {
    if (existing) {
      accounts.set(account.accountId, existing);
    } else {
      accounts.delete(account.accountId);
    }
    throw err;
  }

  logger.info(`[wechat:runtime] activated accountId=${account.accountId}`);

  return {
    accountRuntime,
    defaultAccountId: nextDefaultAccountId,
  };
}
