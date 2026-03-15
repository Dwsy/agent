import type {
  ChannelPlugin,
  GatewayPluginApi,
  MediaSendOptions,
  MediaSendResult,
  MessageActionResult,
  MessageSendResult,
  ReadHistoryResult,
  ChannelSecurityAdapter,
} from "../../types.ts";
import type { QqbotChannelConfig, QqbotPluginRuntime } from "./types.ts";
import { resolveQqbotConfig, hasQqbotCredentials } from "./config.ts";
import { sendQqbotText, sendQqbotKeyboard, encodeQqbotTarget } from "./outbound.ts";
import { sendQqbotMedia } from "./media.ts";
import { createQqbotStreamingAdapter } from "./streaming.ts";
import { deleteQqbotOutbound, editQqbotOutbound, readQqbotHistory } from "./actions.ts";
import { startQqbotGateway, stopQqbotGateway } from "./gateway.ts";
import { handleQqbotEvent } from "./handlers.ts";
import { routeInteractionAction } from "../../../gateway/interaction-router.ts";

let runtime: QqbotPluginRuntime | null = null;

const qqbotPlugin: ChannelPlugin = {
  id: "qqbot",
  resolveTarget({ chatId, sessionKey, session }) {
    const chatType = session?.lastChatType;
    if (chatType === "channel") {
      const guildMatch = sessionKey?.match(/:qqbot:channel:([^:]+):thread:/) || sessionKey?.match(/:qqbot:channel:([^:]+)$/);
      const guildId = guildMatch?.[1];
      return encodeQqbotTarget({
        peerType: guildId ? "dm" : "guild",
        id: guildId || chatId,
        guildId,
        channelId: chatId,
      });
    }
    if (chatType === "group") {
      return encodeQqbotTarget({ peerType: "group", id: chatId });
    }
    return encodeQqbotTarget({ peerType: session?.lastChannel === "qqbot" && session?.lastChatType === "dm" ? "c2c" : "c2c", id: chatId });
  },
  meta: {
    label: "QQBot",
    blurb: "QQ Bot official API channel via HTTP + WebSocket",
    docsUrl: "https://bot.q.qq.com/wiki/",
  },
  capabilities: {
    direct: true,
    group: true,
    thread: false,
    media: true,
    streaming: true,
    security: true,
    reactions: false,
    editable: false,
    deletable: true,
    pinnable: false,
    history: false,
    matrix: {
      messaging: {
        post: true,
        edit: false,
        delete: true,
        fileUpload: "partial",
        streaming: "post-edit",
      },
      richContent: {
        cards: "partial",
        buttons: "partial",
        modals: false,
      },
      conversation: {
        mentions: true,
        reactions: "none",
        dms: true,
        typing: false,
        ephemeral: "none",
      },
      interaction: {
        callbacks: true,
        ack: true,
        messageUpdate: "none",
      },
      history: {
        fetchMessages: "none",
        fetchSingleMessage: "none",
        fetchThreadInfo: "none",
        fetchChannelMessages: "none",
        listThreads: "none",
        fetchChannelInfo: "partial",
        postChannelMessage: "full",
      },
    },
  },
  interactions: {
    async handle(event) {
      if (!runtime) return false;
      // Inject API if not provided by caller
      if (!event.api) {
        (event as any).api = {
          setModel: runtime.api.setModel.bind(runtime.api),
          getAvailableModels: runtime.api.getAvailableModels.bind(runtime.api),
        };
      }
      return routeInteractionAction(event);
    },
  },
  outbound: {
    maxLength: 1500,
    async sendText(target: string, text: string, opts): Promise<MessageSendResult> {
      if (!runtime) return { ok: false, error: "QQBot not initialized" };
      return sendQqbotText(runtime, target, text, opts);
    },
    async sendMedia(target: string, filePath: string, opts?: MediaSendOptions): Promise<MediaSendResult> {
      if (!runtime) return { ok: false, error: "QQBot not initialized" };
      return sendQqbotMedia(runtime, target, filePath, opts);
    },
    async editMessage(): Promise<MessageActionResult> {
      return editQqbotOutbound();
    },
    async deleteMessage(target: string, messageId: string): Promise<MessageActionResult> {
      if (!runtime) return { ok: false, error: "QQBot not initialized" };
      return deleteQqbotOutbound(runtime, target, messageId);
    },
    async readHistory(): Promise<ReadHistoryResult> {
      return readQqbotHistory();
    },
    async sendKeyboard(target: string, text: string, keyboard: import("../../types.ts").InlineKeyboardMarkup): Promise<MessageSendResult> {
      if (!runtime) return { ok: false, error: "QQBot not initialized" };
      return sendQqbotKeyboard(runtime, target, text, keyboard);
    },
  },
  async init(api: GatewayPluginApi) {
    const channelCfg = resolveQqbotConfig(api.config.channels.qqbot as QqbotChannelConfig | undefined);
    if (!channelCfg.enabled) {
      api.logger.info("QQBot: disabled or not configured, skipping");
      runtime = null;
      return;
    }
    runtime = {
      api,
      channelCfg,
      intents: (1 << 25) | (1 << 12) | (1 << 26) | (1 << 30),
      dedup: new Map(),
      replyState: new Map(),
      streamPlaceholders: new Map(),
      seq: null,
      ws: null,
      heartbeatTimer: null,
      reconnectTimer: null,
      disposed: false,
    };
    qqbotPlugin.streaming = createQqbotStreamingAdapter(() => runtime);
    qqbotPlugin.security = {
      dmPolicy: channelCfg.dmPolicy ?? "pairing",
      dmAllowFrom: channelCfg.allowFrom,
      supportsPairing: channelCfg.dmPolicy === "pairing",
      accountId: "default",
    } satisfies ChannelSecurityAdapter;

    if (!hasQqbotCredentials(channelCfg)) {
      api.logger.warn("QQBot: enabled but appId/clientSecret missing");
      return;
    }
    (api as any).dispatchInteraction = async (event: any) => {
      return qqbotPlugin.interactions?.handle(event) ?? false;
    };
    api.logger.info("QQBot: initialized");
  },
  async start() {
    if (!runtime) return;
    await startQqbotGateway(runtime, async (eventType, data) => {
      await handleQqbotEvent(runtime!, eventType, data);
    });
    runtime.api.logger.info("QQBot: gateway started");
  },
  async stop() {
    if (!runtime) return;
    await stopQqbotGateway(runtime);
    runtime.replyState.clear();
    runtime.streamPlaceholders.clear();
    runtime = null;
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(qqbotPlugin);
}
