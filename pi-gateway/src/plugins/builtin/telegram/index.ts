import type {
  ChannelPlugin, GatewayPluginApi, MediaSendOptions, MediaSendResult,
  MessageSendResult, MessageActionResult, ReactionOptions, ChannelStreamingAdapter, ChannelSecurityAdapter,
  StreamPlaceholderOpts, StreamEditOpts,
} from "../../types.ts";
import type { TelegramChannelConfig } from "../../../core/config.ts";
import { resolveDefaultAccountId, resolveTelegramAccounts } from "./accounts.ts";
import { createAccountRuntime, startAccountRuntime, stopAccountRuntime } from "./bot.ts";
import { sendOutboundViaAccount, sendMediaViaAccount, sendReactionViaAccount, editMessageViaAccount, deleteMessageViaAccount, pinMessageViaAccount, readHistoryViaAccount, parseTelegramTarget } from "./outbound.ts";
import { markdownToTelegramHtml } from "./format.ts";
import { recordSentMessage } from "./sent-message-cache.ts";
import type { TelegramPluginRuntime } from "./types.ts";

let runtime: TelegramPluginRuntime | null = null;
let defaultAccountId = "default";

function getRuntime(): TelegramPluginRuntime {
  if (!runtime) throw new Error("Telegram runtime not initialized");
  return runtime;
}

function getDefaultBot() {
  const rt = getRuntime();
  const account = rt.accounts.get(defaultAccountId) ?? Array.from(rt.accounts.values())[0];
  if (!account) throw new Error("No Telegram account available");
  return account.bot;
}

// ── Streaming Adapter ──────────────────────────────────────────────────────

const streamingAdapter: ChannelStreamingAdapter = {
  config: {
    editThrottleMs: 1000,
    streamStartChars: 800,
  },

  async createPlaceholder(target: string, opts?: StreamPlaceholderOpts) {
    const bot = getDefaultBot();
    const parsed = parseTelegramTarget(target, defaultAccountId);
    const text = opts?.text ?? "⠋";
    const sent = await bot.api.sendMessage(parsed.chatId, text, {
      ...(opts?.parseMode === "HTML" ? { parse_mode: "HTML" } : {}),
      ...(opts?.threadId ? { message_thread_id: Number(opts.threadId) } : {}),
      ...(opts?.replyTo ? { reply_to_message_id: Number(opts.replyTo) } : {}),
    });
    recordSentMessage(parsed.chatId, sent.message_id);
    return { messageId: String(sent.message_id) };
  },

  async editMessage(target: string, messageId: string, text: string, opts?: StreamEditOpts) {
    const bot = getDefaultBot();
    const parsed = parseTelegramTarget(target, defaultAccountId);
    try {
      await bot.api.editMessageText(
        parsed.chatId,
        Number(messageId),
        opts?.parseMode === "HTML" ? text : markdownToTelegramHtml(text),
        { parse_mode: "HTML" },
      );
      return true;
    } catch (err: unknown) {
      const tgErr = err as Record<string, unknown> | null;
      if (tgErr?.error_code === 429 || tgErr?.statusCode === 429) return false;
      if (typeof tgErr?.description === 'string' && tgErr.description.includes("message is not modified")) return true;
      return false;
    }
  },

  async setTyping(target: string) {
    const bot = getDefaultBot();
    const parsed = parseTelegramTarget(target, defaultAccountId);
    await bot.api.sendChatAction(parsed.chatId, "typing").catch(() => {});
  },
};

// ── Security Adapter ───────────────────────────────────────────────────────

let securityAdapter: ChannelSecurityAdapter | undefined;

function buildSecurityAdapter(cfg: TelegramChannelConfig): ChannelSecurityAdapter {
  const defaultAccount = cfg.accounts?.[resolveDefaultAccountId(cfg)];
  return {
    dmPolicy: (defaultAccount as any)?.dmPolicy ?? "pairing",
    dmAllowFrom: (defaultAccount as any)?.allowFrom,
    supportsPairing: true,
    accountId: resolveDefaultAccountId(cfg),
  };
}

// ── Plugin ─────────────────────────────────────────────────────────────────

const telegramPlugin: ChannelPlugin = {
  id: "telegram",
  meta: {
    label: "Telegram",
    blurb: "Telegram bot via grammy (multi-account, OpenClaw-aligned)",
  },
  capabilities: {
    direct: true,
    group: true,
    thread: true,
    media: true,
  },
  outbound: {
    maxLength: 4096,
    async sendText(target: string, text: string): Promise<MessageSendResult> {
      const rt = getRuntime();
      return sendOutboundViaAccount({
        runtime: rt,
        defaultAccountId,
        target,
        text,
      });
    },
    async sendMedia(target: string, filePath: string, opts?: MediaSendOptions): Promise<MediaSendResult> {
      const rt = getRuntime();
      return sendMediaViaAccount({
        runtime: rt,
        defaultAccountId,
        target,
        filePath,
        opts,
      });
    },
    async sendReaction(target: string, messageId: string, emoji: string | string[], opts?: ReactionOptions): Promise<MessageActionResult> {
      const rt = getRuntime();
      return sendReactionViaAccount({ runtime: rt, defaultAccountId, target, messageId, emoji, opts });
    },
    async editMessage(target: string, messageId: string, text: string): Promise<MessageActionResult> {
      const rt = getRuntime();
      return editMessageViaAccount({ runtime: rt, defaultAccountId, target, messageId, text });
    },
    async deleteMessage(target: string, messageId: string): Promise<MessageActionResult> {
      const rt = getRuntime();
      return deleteMessageViaAccount({ runtime: rt, defaultAccountId, target, messageId });
    },
    async pinMessage(target: string, messageId: string, unpin?: boolean) {
      const rt = getRuntime();
      return pinMessageViaAccount({ runtime: rt, defaultAccountId, target, messageId, unpin });
    },
    async readHistory(target: string, limit?: number, before?: string) {
      const rt = getRuntime();
      return readHistoryViaAccount({ runtime: rt, defaultAccountId, target, limit, before });
    },
  },

  streaming: streamingAdapter,

  async init(api: GatewayPluginApi) {
    const channelCfg = api.config.channels.telegram as TelegramChannelConfig | undefined;
    if (!channelCfg?.enabled) {
      api.logger.info("Telegram: disabled or not configured, skipping");
      runtime = null;
      return;
    }

    runtime = {
      api,
      channelCfg,
      accounts: new Map(),
    };

    defaultAccountId = resolveDefaultAccountId(channelCfg);
    securityAdapter = buildSecurityAdapter(channelCfg);
    telegramPlugin.security = securityAdapter;

    const resolved = resolveTelegramAccounts(channelCfg);
    if (resolved.length === 0) {
      api.logger.info("Telegram: no enabled account with token, skipping");
      return;
    }

    for (const account of resolved) {
      const accountRuntime = await createAccountRuntime(runtime, account);
      runtime.accounts.set(account.accountId, accountRuntime);
    }

    api.logger.info(`Telegram: initialized accounts=${Array.from(runtime.accounts.keys()).join(",")}`);
  },

  async start() {
    if (!runtime) return;
    for (const account of runtime.accounts.values()) {
      await startAccountRuntime(runtime, account);
    }
  },

  async stop() {
    if (!runtime) return;
    for (const account of runtime.accounts.values()) {
      await stopAccountRuntime(runtime, account);
    }
    runtime.accounts.clear();
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(telegramPlugin);
}
