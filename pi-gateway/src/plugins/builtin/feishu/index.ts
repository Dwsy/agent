/**
 * Feishu channel plugin entry — register with pi-gateway.
 */
import type { ChannelPlugin, GatewayPluginApi, MessageSendResult, ChannelSecurityAdapter } from "../../types.ts";
import type { DmPolicy } from "../../../security/allowlist.ts";
import type { FeishuChannelConfig, FeishuPluginRuntime } from "./types.ts";
import { createFeishuClient, createFeishuWSClient, createEventDispatcher, clearClientCache } from "./client.ts";
import { registerFeishuEvents } from "./bot.ts";
import { sendFeishuText, sendFeishuCard, chunkText, resolveReceiveIdType } from "./send.ts";
import { sendFeishuMedia } from "./media.ts";
import type * as Lark from "@larksuiteoapi/node-sdk";

let runtime: FeishuPluginRuntime | null = null;
let wsClient: Lark.WSClient | null = null;

const feishuPlugin: ChannelPlugin = {
  id: "feishu",
  meta: {
    label: "Feishu",
    blurb: "飞书/Lark enterprise messaging (WebSocket)",
  },
  capabilities: {
    direct: true,
    group: true,
    media: true,
  },
  outbound: {
    maxLength: 4000,
    async sendText(target: string, text: string): Promise<MessageSendResult> {
      if (!runtime) return { ok: false, error: "Feishu not initialized" };
      try {
        const chunks = chunkText(text, runtime.channelCfg.textChunkLimit ?? 4000);
        let lastMessageId: string | undefined;
        for (const chunk of chunks) {
          const result = await sendFeishuCard({ client: runtime.client, to: target, text: chunk });
          lastMessageId = result.messageId;
        }
        return { ok: true, messageId: lastMessageId };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async sendMedia(target: string, filePath: string, opts?) {
      if (!runtime) return { ok: false, error: "Feishu not initialized" };
      try {
        const result = await sendFeishuMedia({
          client: runtime.client,
          to: target,
          filePath,
          caption: opts?.caption,
          skipPathValidation: true,  // API layer already validated
        });
        return { ok: true, messageId: result.messageId };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  },

  async init(api: GatewayPluginApi) {
    const cfg = api.config.channels.feishu as FeishuChannelConfig | undefined;
    if (!cfg?.enabled) {
      api.logger.info("Feishu: disabled or not configured, skipping");
      runtime = null;
      return;
    }

    // Validate required credentials
    if (!cfg.appId || !cfg.appSecret) {
      api.logger.error("Feishu: enabled but missing required config — channels.feishu.appId and channels.feishu.appSecret must be set");
      runtime = null;
      return;
    }

    const client = createFeishuClient(cfg);
    runtime = { api, channelCfg: cfg, client };

    // Wire security adapter from config
    feishuPlugin.security = {
      dmPolicy: (cfg.dmPolicy ?? "open") as DmPolicy,
      dmAllowFrom: cfg.allowFrom,
      supportsPairing: cfg.dmPolicy === "pairing",
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
        api.logger.info(`Feishu: bot identity resolved: ${bot.bot_name ?? "unknown"} (${runtime.botOpenId})`);
      }
    } catch (err) {
      api.logger.info(`Feishu: could not probe bot identity: ${err}`);
    }

    api.logger.info(`Feishu: initialized (domain=${cfg.domain ?? "feishu"}, mode=${cfg.connectionMode ?? "websocket"})`);
  },

  async start() {
    if (!runtime) return;
    const { api, channelCfg } = runtime;

    const mode = channelCfg.connectionMode ?? "websocket";
    if (mode !== "websocket") {
      api.logger.info("Feishu: webhook mode not implemented in v1, skipping start");
      return;
    }

    const dispatcher = createEventDispatcher(channelCfg);
    registerFeishuEvents(dispatcher, runtime);

    wsClient = createFeishuWSClient(channelCfg);
    wsClient.start({ eventDispatcher: dispatcher });
    api.logger.info("Feishu: WebSocket client started");
  },

  async stop() {
    if (wsClient) {
      try { (wsClient as any).close?.(); } catch {}
      wsClient = null;
    }
    runtime = null;
    clearClientCache();
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(feishuPlugin);
}
