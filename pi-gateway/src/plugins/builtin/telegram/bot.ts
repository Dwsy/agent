import { Bot } from "grammy";
import { sequentialize } from "@grammyjs/runner";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { applyProxyEnv } from "./proxy.ts";
import { setupTelegramHandlers } from "./handlers.ts";
import { setupTelegramCommands } from "./commands.ts";
import { startPollingWithRetry } from "./monitor.ts";
import { startTelegramWebhook } from "./webhook.ts";
import type { TelegramAccountRuntime, TelegramPluginRuntime, TelegramResolvedAccount } from "./types.ts";

export async function createAccountRuntime(
  runtime: TelegramPluginRuntime,
  account: TelegramResolvedAccount,
): Promise<TelegramAccountRuntime> {
  applyProxyEnv(account.cfg.proxy);

  const bot = new Bot(account.token);
  bot.use(sequentialize((ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return undefined;
    const threadId = (ctx.message as any)?.message_thread_id;
    return threadId ? `${chatId}:${threadId}` : String(chatId);
  }));
  bot.api.config.use(apiThrottler());

  const me = await bot.api.getMe();

  const accountRuntime: TelegramAccountRuntime = {
    accountId: account.accountId,
    token: account.token,
    cfg: account.cfg,
    bot,
    api: runtime.api,
    started: false,
    startMode: account.cfg.webhookUrl ? "webhook" : "polling",
    botId: String(me.id),
    botUsername: me.username ?? undefined,
    debounceMap: new Map(),
    mediaGroupMap: new Map(),
    seenUpdates: new Set(),
    seenCallbacks: new Set(),
    seenEditedEvents: new Set(),
  };

  // 命令先注册，确保 /new 等命令不会被 message handler 重复处理
  await setupTelegramCommands(runtime, accountRuntime);
  await setupTelegramHandlers(runtime, accountRuntime);

  return accountRuntime;
}

export async function startAccountRuntime(
  runtime: TelegramPluginRuntime,
  account: TelegramAccountRuntime,
): Promise<void> {
  if (account.started) return;

  if (account.cfg.webhookUrl) {
    const handle = await startTelegramWebhook({
      bot: account.bot,
      webhookUrl: account.cfg.webhookUrl,
      webhookPath: account.cfg.webhookPath,
      webhookSecret: account.cfg.webhookSecret ?? runtime.channelCfg.webhookSecret,
      logger: runtime.api.logger,
    });
    account.stopWebhook = handle.stop;
    account.startMode = "webhook";
  } else {
    account.stopPolling = await startPollingWithRetry({
      bot: account.bot,
      logger: runtime.api.logger,
    });
    account.startMode = "polling";
  }

  account.started = true;
  runtime.api.logger.info(`[telegram:${account.accountId}] started mode=${account.startMode}`);
}

export async function stopAccountRuntime(
  runtime: TelegramPluginRuntime,
  account: TelegramAccountRuntime,
): Promise<void> {
  if (!account.started) return;

  for (const [, entry] of account.debounceMap) {
    clearTimeout(entry.timer);
  }
  account.debounceMap.clear();

  for (const [, entry] of account.mediaGroupMap) {
    clearTimeout(entry.timer);
  }
  account.mediaGroupMap.clear();

  if (account.stopPolling) {
    await account.stopPolling().catch(() => {});
    account.stopPolling = undefined;
  }

  if (account.stopWebhook) {
    await account.stopWebhook().catch(() => {});
    account.stopWebhook = undefined;
  }

  account.started = false;
  runtime.api.logger.info(`[telegram:${account.accountId}] stopped`);
}
