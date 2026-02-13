/**
 * Telegram Model Selector — /model command + callback_query handler.
 *
 * Extracted from commands.ts (v3.7) to keep each file < 500 lines.
 */

import { resolveSessionKey, resolveAgentId } from "../../../core/session-router.ts";
import { escapeHtml, markdownToTelegramHtml } from "./format.ts";
import {
  groupModelsByProvider,
  buildProviderKeyboard,
  buildModelsKeyboard,
  parseModelCallbackData,
} from "./model-buttons.ts";
import type {
  TelegramAccountRuntime,
  TelegramContext,
  TelegramPluginRuntime,
} from "./types.ts";
import type { MessageSource } from "../../../core/types.ts";

function toSource(accountId: string, ctx: TelegramContext): MessageSource {
  return {
    channel: "telegram",
    accountId,
    chatType: ctx.chat?.type === "private" ? "dm" : "group",
    chatId: String(ctx.chat?.id ?? ""),
    senderId: String(ctx.from?.id ?? "unknown"),
    senderName: ctx.from?.username ?? ctx.from?.first_name,
  };
}

export async function renderProviderModels(params: {
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  sessionKey: string;
  provider: string;
  page: number;
  callbackMessageId?: number;
}): Promise<void> {
  const models = await params.account.api.getAvailableModels(params.sessionKey);
  const grouped = groupModelsByProvider(models);
  const list = grouped[params.provider] ?? [];
  if (list.length === 0) {
    await params.ctx.reply(`Provider ${params.provider} 没有可用模型。`);
    return;
  }

  const keyboard = buildModelsKeyboard({
    provider: params.provider,
    models: list,
    page: params.page,
  });

  const text = `选择模型 (${params.provider})`;
  if (params.callbackMessageId && params.ctx.chat?.id) {
    await (params.account.bot.api as any).editMessageText(
      String(params.ctx.chat.id),
      params.callbackMessageId,
      text,
      { reply_markup: { inline_keyboard: keyboard.rows } },
    ).catch(async () => {
      await params.ctx.reply(text, { reply_markup: { inline_keyboard: keyboard.rows } });
    });
  } else {
    await params.ctx.reply(text, { reply_markup: { inline_keyboard: keyboard.rows } });
  }
}

/**
 * Register /model command on the bot.
 */
export function registerModelCommand(
  bot: TelegramAccountRuntime["bot"],
  runtime: TelegramPluginRuntime,
  account: TelegramAccountRuntime,
): void {
  bot.command("model", async (ctx: any) => {
    const args = String(ctx.match ?? "").trim();
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);

    if (args && args.includes("/")) {
      const slash = args.indexOf("/");
      const provider = args.slice(0, slash);
      const modelId = args.slice(slash + 1);
      try {
        await runtime.api.setModel(sessionKey, provider, modelId);
        await ctx.reply(`Model: <b>${escapeHtml(provider)}/${escapeHtml(modelId)}</b>`, { parse_mode: "HTML" });
      } catch (err: unknown) {
        await ctx.reply(`Failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    try {
      const models = await runtime.api.getAvailableModels(sessionKey);
      const grouped = groupModelsByProvider(models);
      const providers = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
      if (providers.length === 0) {
        await ctx.reply("没有可用模型。");
        return;
      }
      await ctx.reply("选择 Provider：", {
        reply_markup: { inline_keyboard: buildProviderKeyboard(providers) },
      });
    } catch (err: unknown) {
      await ctx.reply(`Failed to list models: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

/**
 * Register callback_query handler for model selection, help pagination, and skill execution.
 */
export function registerCallbackHandler(
  bot: TelegramAccountRuntime["bot"],
  runtime: TelegramPluginRuntime,
  account: TelegramAccountRuntime,
  helpPage: (page: number) => { text: string; keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } },
): void {
  bot.on("callback_query:data", async (ctx: any) => {
    const callbackQuery = (ctx as TelegramContext).callbackQuery;
    const callbackId = callbackQuery?.id;
    if (!callbackId) return;
    if (account.seenCallbacks.has(callbackId)) {
      await ctx.answerCallbackQuery?.();
      return;
    }
    account.seenCallbacks.add(callbackId);
    if (account.seenCallbacks.size > 2000) {
      const first = account.seenCallbacks.values().next().value;
      if (first) account.seenCallbacks.delete(first);
    }

    const data = String(callbackQuery?.data ?? "").trim();

    if (data.startsWith("cmd_page:")) {
      const page = Math.max(1, Number.parseInt(data.slice("cmd_page:".length), 10) || 1);
      const view = helpPage(page);
      const msg = callbackQuery?.message as any;
      await ctx.answerCallbackQuery?.();
      await (bot.api as any).editMessageText(String(msg.chat.id), msg.message_id, view.text, {
        parse_mode: "HTML",
        reply_markup: view.keyboard,
      }).catch(async () => {
        await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
      });
      return;
    }

    if (data.startsWith("skill_run:")) {
      const skillName = data.slice("skill_run:".length);
      await ctx.answerCallbackQuery?.({ text: `Running /${skillName}...` });
      const source = toSource(account.accountId, ctx as TelegramContext);
      const { agentId, text: routedText } = resolveAgentId(source, `/${skillName}`, runtime.api.config);
      const sessionKey = resolveSessionKey(source, runtime.api.config, agentId);
      const chatId = String(callbackQuery?.message?.chat?.id ?? "");
      await runtime.api.dispatch({
        source,
        sessionKey,
        text: routedText || `/${skillName}`,
        respond: async (text: string) => {
          if (text?.trim()) {
            await bot.api.sendMessage(chatId, markdownToTelegramHtml(text), { parse_mode: "HTML" }).catch(() => {
              bot.api.sendMessage(chatId, text).catch(() => {});
            });
          }
        },
        setTyping: async () => {
          await bot.api.sendChatAction(chatId, "typing").catch(() => {});
        },
      });
      return;
    }

    const parsed = parseModelCallbackData(data);
    if (!parsed) {
      await ctx.answerCallbackQuery?.();
      return;
    }

    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);

    if (parsed.type === "providers" || parsed.type === "back") {
      const models = await runtime.api.getAvailableModels(sessionKey);
      const grouped = groupModelsByProvider(models);
      const providers = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
      const msg = callbackQuery?.message as any;
      await ctx.answerCallbackQuery?.();
      await (bot.api as any).editMessageText(String(msg.chat.id), msg.message_id, "选择 Provider：", {
        reply_markup: { inline_keyboard: buildProviderKeyboard(providers) },
      }).catch(async () => {
        await ctx.reply("选择 Provider：", {
          reply_markup: { inline_keyboard: buildProviderKeyboard(providers) },
        });
      });
      return;
    }

    if (parsed.type === "list") {
      await ctx.answerCallbackQuery?.();
      await renderProviderModels({
        account,
        ctx: ctx as TelegramContext,
        sessionKey,
        provider: parsed.provider,
        page: parsed.page,
        callbackMessageId: (callbackQuery?.message as any)?.message_id,
      });
      return;
    }

    if (parsed.type === "select") {
      await runtime.api.setModel(sessionKey, parsed.provider, parsed.modelId);
      await ctx.answerCallbackQuery?.({ text: `已切换到 ${parsed.provider}/${parsed.modelId}` });
      const message = `Model: <b>${parsed.provider}/${parsed.modelId}</b>`;
      await ctx.reply(markdownToTelegramHtml(message), { parse_mode: "HTML" });
    }
  });
}
