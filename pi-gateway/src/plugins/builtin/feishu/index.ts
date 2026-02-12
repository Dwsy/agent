/**
 * Feishu channel plugin entry — register with pi-gateway.
 */
import type { ChannelPlugin, GatewayPluginApi } from "../../types.ts";
import type { FeishuChannelConfig, FeishuPluginRuntime } from "./types.ts";
import { createFeishuClient, createFeishuWSClient, createEventDispatcher, clearClientCache } from "./client.ts";
import { registerFeishuEvents } from "./bot.ts";
import { sendFeishuText, chunkText, resolveReceiveIdType } from "./send.ts";
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
    group: false, // v2
    media: false,  // v2
  },
  outbound: {
    maxLength: 4000,
    async sendText(target: string, text: string) {
      if (!runtime) return;
      const chunks = chunkText(text, runtime.channelCfg.textChunkLimit ?? 4000);
      for (const chunk of chunks) {
        await sendFeishuText({ client: runtime.client, to: target, text: chunk });
      }
    },
    async sendMedia(_target: string, _filePath: string) {
      // v2: media upload + send
      return { ok: false, error: "Feishu media not implemented yet" };
    },
  },

  async init(api: GatewayPluginApi) {
    const cfg = api.config.channels.feishu as FeishuChannelConfig | undefined;
    if (!cfg?.enabled || !cfg?.appId || !cfg?.appSecret) {
      api.logger.info("Feishu: disabled or not configured, skipping");
      runtime = null;
      return;
    }

    const client = createFeishuClient(cfg);
    runtime = { api, channelCfg: cfg, client };

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
    wsClient = null;
    runtime = null;
    clearClientCache();
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(feishuPlugin);
}
