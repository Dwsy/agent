import type { ChannelPlugin, GatewayPluginApi, MediaSendOptions, MediaSendResult } from "../../types.ts";
import type { TelegramChannelConfig } from "../../../core/config.ts";
import { resolveDefaultAccountId, resolveTelegramAccounts } from "./accounts.ts";
import { createAccountRuntime, startAccountRuntime, stopAccountRuntime } from "./bot.ts";
import { sendOutboundViaAccount, sendMediaViaAccount } from "./handlers.ts";
import type { TelegramPluginRuntime } from "./types.ts";

let runtime: TelegramPluginRuntime | null = null;
let defaultAccountId = "default";

function getRuntime(): TelegramPluginRuntime {
  if (!runtime) throw new Error("Telegram runtime not initialized");
  return runtime;
}

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
    async sendText(target: string, text: string) {
      const rt = getRuntime();
      await sendOutboundViaAccount({
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
  },

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
