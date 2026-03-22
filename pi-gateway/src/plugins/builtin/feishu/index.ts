/**
 * Feishu channel plugin entry — multi-account architecture.
 *
 * Supports both single-account (legacy) and multi-account modes.
 * Aligned with openclaw architecture.
 */
import type {
  ChannelPlugin,
  GatewayPluginApi,
  MessageSendResult,
  ChannelSecurityAdapter,
  MessageActionResult,
  ReactionOptions,
  ReadHistoryResult,
} from "../../types.ts";
import type { DmPolicy } from "../../../security/allowlist.ts";
import type { FeishuChannelConfig, FeishuPluginRuntime, ResolvedFeishuAccount } from "./types.ts";
import {
  resolveFeishuAccount,
  listEnabledFeishuAccounts,
  resolveDefaultFeishuAccountId,
} from "./accounts.ts";
import {
  createFeishuClient,
  createFeishuWSClient,
  createEventDispatcher,
  clearClientCache,
} from "./client.ts";
import { registerFeishuEvents } from "./bot.ts";
import {
  sendFeishuText,
  sendFeishuCard,
  chunkText,
  resolveReceiveIdType,
  updateFeishuCard,
} from "./send.ts";
import { sendFeishuMedia } from "./media.ts";
import {
  sendFeishuReaction,
  editFeishuMessage,
  deleteFeishuMessage,
  pinFeishuMessage,
  readFeishuHistory,
} from "./actions.ts";
import type * as Lark from "@larksuiteoapi/node-sdk";

// ============================================================================
// Multi-Account Runtime Management
// ============================================================================

const runtimes = new Map<string, FeishuPluginRuntime>();
const wsClients = new Map<string, Lark.WSClient>();
let defaultAccountId: string | null = null;

function getRuntime(accountId?: string): FeishuPluginRuntime | null {
  const id = accountId ?? defaultAccountId;
  if (!id) return null;
  return runtimes.get(id) ?? null;
}

function getDefaultRuntime(): FeishuPluginRuntime {
  const rt = getRuntime();
  if (!rt) throw new Error("Feishu not initialized");
  return rt;
}

// ============================================================================
// Plugin Definition
// ============================================================================

const feishuPlugin: ChannelPlugin = {
  id: "feishu",
  meta: {
    label: "Feishu",
    blurb: "飞书/Lark enterprise messaging (WebSocket)",
  },
  capabilities: {
    direct: true,
    group: true,
    thread: false,
    media: true,
    streaming: true,
    security: true,
    reactions: true,
    editable: true,
    deletable: true,
    pinnable: true,
    history: true,
    matrix: {
      messaging: {
        post: true,
        edit: true,
        delete: true,
        fileUpload: "full",
        streaming: "post-edit",
      },
      richContent: {
        cards: "full",
        buttons: "full",
        modals: false,
      },
      conversation: {
        mentions: true,
        reactions: "full",
        dms: true,
        typing: false,
        ephemeral: "none",
      },
      history: {
        fetchMessages: "full",
        fetchSingleMessage: "none",
        fetchThreadInfo: "partial",
        fetchChannelMessages: "partial",
        listThreads: "none",
        fetchChannelInfo: "partial",
        postChannelMessage: "full",
      },
    },
  },
  outbound: {
    maxLength: 4000,
    async sendText(target: string, text: string): Promise<MessageSendResult> {
      const rt = getDefaultRuntime();
      try {
        const chunks = chunkText(text, rt.channelCfg.textChunkLimit ?? 4000);
        let lastMessageId: string | undefined;
        for (const chunk of chunks) {
          const result = await sendFeishuCard({
            client: rt.client,
            to: target,
            text: chunk,
          });
          lastMessageId = result.messageId;
        }
        return { ok: true, messageId: lastMessageId };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async sendMedia(target: string, filePath: string, opts?) {
      const rt = getDefaultRuntime();
      try {
        const result = await sendFeishuMedia({
          client: rt.client,
          to: target,
          filePath,
          caption: opts?.caption,
          skipPathValidation: true,
        });
        return { ok: true, messageId: result.messageId };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
    async sendReaction(
      target: string,
      messageId: string,
      emoji: string | string[],
      opts?: ReactionOptions,
    ): Promise<MessageActionResult> {
      const rt = getDefaultRuntime();
      return sendFeishuReaction(rt.client, messageId, emoji, opts);
    },
    async editMessage(
      target: string,
      messageId: string,
      text: string,
    ): Promise<MessageActionResult> {
      const rt = getDefaultRuntime();
      return editFeishuMessage(rt.client, messageId, text);
    },
    async deleteMessage(target: string, messageId: string): Promise<MessageActionResult> {
      const rt = getDefaultRuntime();
      return deleteFeishuMessage(rt.client, messageId);
    },
    async pinMessage(
      target: string,
      messageId: string,
      unpin?: boolean,
    ): Promise<MessageActionResult> {
      const rt = getDefaultRuntime();
      return pinFeishuMessage(rt.client, messageId, unpin);
    },
    async readHistory(
      target: string,
      limit?: number,
      before?: string,
    ): Promise<ReadHistoryResult> {
      const rt = getDefaultRuntime();
      return readFeishuHistory(rt.client, target, limit, before);
    },
  },

  async init(api: GatewayPluginApi) {
    const cfg = api.config.channels.feishu as FeishuChannelConfig | undefined;
    if (!cfg?.enabled) {
      api.logger.info("Feishu: disabled or not configured, skipping");
      return;
    }

    // Resolve all enabled accounts
    const accounts = listEnabledFeishuAccounts(api.config);

    if (accounts.length === 0) {
      // Backward compatibility: single-account mode
      const account = resolveFeishuAccount({ cfg: api.config });
      if (!account.configured) {
        api.logger.error(
          "Feishu: enabled but missing required config — channels.feishu.appId and channels.feishu.appSecret must be set",
        );
        return;
      }

      if (!account.enabled) {
        api.logger.info("Feishu: account disabled, skipping");
        return;
      }

      accounts.push(account);
    }

    // Initialize each account
    for (const account of accounts) {
      try {
        const client = createFeishuClient(account);
        const runtime: FeishuPluginRuntime = {
          api,
          channelCfg: account.config,
          client,
          botOpenId: undefined,
          accountId: account.accountId,
        };

        // Probe bot identity
        try {
          const res = await (client as any).request({
            method: "GET",
            url: "/open-apis/bot/v3/info",
            data: {},
          });
          const bot = res?.bot || res?.data?.bot;
          if (bot?.open_id) {
            runtime.botOpenId = bot.open_id;
            api.logger.info(
              `Feishu[${account.accountId}]: bot identity resolved: ${bot.bot_name ?? "unknown"} (${runtime.botOpenId})`,
            );
          }
        } catch (err) {
          api.logger.warn(
            `Feishu[${account.accountId}]: could not probe bot identity: ${err}`,
          );
        }

        runtimes.set(account.accountId, runtime);

        // Set default account
        if (!defaultAccountId) {
          defaultAccountId = account.accountId;
        }

        api.logger.info(
          `Feishu[${account.accountId}]: initialized (domain=${account.domain}, mode=${account.config.connectionMode ?? "websocket"})`,
        );
      } catch (err) {
        api.logger.error(
          `Feishu[${account.accountId}]: failed to initialize: ${err}`,
        );
      }
    }

    // Wire security adapter from default account config
    const defaultAccount = getRuntime();
    if (defaultAccount) {
      const securityConfig = defaultAccount.channelCfg;
      feishuPlugin.security = {
        dmPolicy: (securityConfig.dmPolicy ?? "open") as DmPolicy,
        dmAllowFrom: securityConfig.allowFrom,
        supportsPairing: securityConfig.dmPolicy === "pairing",
      };
    }

    api.logger.info(
      `Feishu: initialized ${runtimes.size} account(s), default=${defaultAccountId}`,
    );
  },

  async start() {
    if (runtimes.size === 0) return;

    for (const [accountId, runtime] of runtimes) {
      const { api, channelCfg } = runtime;
      const mode = channelCfg.connectionMode ?? "websocket";

      if (mode !== "websocket") {
        api.logger.info(`Feishu[${accountId}]: webhook mode not implemented, skipping`);
        continue;
      }

      try {
        const dispatcher = createEventDispatcher(channelCfg);
        registerFeishuEvents(dispatcher, runtime);

        const wsClient = createFeishuWSClient({
          appId: runtime.botOpenId ? channelCfg.appId! : "",
          appSecret: channelCfg.appSecret!,
          domain: channelCfg.domain,
        });
        wsClient.start({ eventDispatcher: dispatcher });
        wsClients.set(accountId, wsClient);

        api.logger.info(`Feishu[${accountId}]: WebSocket client started`);
      } catch (err) {
        api.logger.error(`Feishu[${accountId}]: failed to start: ${err}`);
      }
    }
  },

  async stop() {
    for (const [accountId, wsClient] of wsClients) {
      try {
        (wsClient as any).close?.();
      } catch {}
    }
    wsClients.clear();
    runtimes.clear();
    defaultAccountId = null;
    clearClientCache();
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(feishuPlugin);
}

// ============================================================================
// Exports for Testing / Advanced Use
// ============================================================================

export {
  getRuntime,
  listEnabledFeishuAccounts,
  resolveFeishuAccount,
  resolveDefaultFeishuAccountId,
};
export type { FeishuPluginRuntime, ResolvedFeishuAccount };
