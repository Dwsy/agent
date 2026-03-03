/**
 * Telegram Model Selector — /model command + callback_query dispatcher.
 *
 * The dispatcher routes callbacks through callback-router.ts first,
 * then falls through to keyboard-interact (infrastructure) and model selection.
 */

import { resolveAgentRoute, resolveSessionKey } from "../../../core/session-router.ts";
import { escapeHtml, markdownToTelegramHtml } from "./format.ts";
import {
  groupModelsByProvider,
  buildProviderKeyboard,
  buildModelSelectionKeyboard,
  buildModelsKeyboard,
  parseModelCallbackData,
  type ModelProviderEntry,
} from "./model-buttons.ts";
import { parseKeyboardCallback, resolveKeyboard } from "../../../api/keyboard-interact.ts";
import { dispatchCallback } from "./callback-router.ts";
import { toSource } from "./helpers.ts";
import type {
  TelegramAccountRuntime,
  TelegramContext,
  TelegramPluginRuntime,
} from "./types.ts";

const SEARCH_RESULT_LIMIT = 12;

function resolveTelegramSessionKey(params: {
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  runtime: TelegramPluginRuntime;
  textHint?: string;
}): string {
  const source = toSource(params.account.accountId, params.ctx);
  const route = resolveAgentRoute(source, params.textHint ?? "", params.runtime.api.config);
  return resolveSessionKey(source, params.runtime.api.config, route.agentId);
}

type ModelSearchResult = {
  total: number;
  items: ModelProviderEntry[];
};

function flattenProviderModels(grouped: Record<string, string[]>): ModelProviderEntry[] {
  const entries: ModelProviderEntry[] = [];
  for (const provider of Object.keys(grouped).sort((a, b) => a.localeCompare(b))) {
    const models = grouped[provider] ?? [];
    for (const modelId of models) {
      entries.push({ provider, modelId });
    }
  }
  return entries;
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[\s_./-]+/g, "");
}

function scoreModelMatch(entry: ModelProviderEntry, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return 0;

  const provider = entry.provider.toLowerCase();
  const modelId = entry.modelId.toLowerCase();
  const full = `${provider}/${modelId}`;

  if (full === query) return 1200;
  if (modelId === query) return 1100;
  if (full.startsWith(query)) return 1000;
  if (modelId.startsWith(query)) return 950;
  if (provider === query) return 900;
  if (provider.startsWith(query)) return 850;
  if (full.includes(query)) return 800;
  if (modelId.includes(query)) return 760;
  if (provider.includes(query)) return 720;

  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return 0;

  const normalizedFull = normalizeSearch(full);
  const normalizedModel = normalizeSearch(modelId);
  const normalizedProvider = normalizeSearch(provider);

  if (normalizedFull.includes(normalizedQuery)) return 680;
  if (normalizedModel.includes(normalizedQuery)) return 640;
  if (normalizedProvider.includes(normalizedQuery)) return 620;

  const tokens = query.split(/[\s/_-]+/).filter(Boolean);
  if (tokens.length > 1) {
    const haystack = `${provider} ${modelId}`;
    const matchedCount = tokens.filter((token) => haystack.includes(token)).length;
    if (matchedCount === tokens.length) return 520 + matchedCount;
  }

  return 0;
}

function searchModels(entries: ModelProviderEntry[], query: string, limit = SEARCH_RESULT_LIMIT): ModelSearchResult {
  const scored = entries
    .map((entry) => ({ entry, score: scoreModelMatch(entry, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const providerCmp = a.entry.provider.localeCompare(b.entry.provider);
      if (providerCmp !== 0) return providerCmp;
      return a.entry.modelId.localeCompare(b.entry.modelId);
    });

  return {
    total: scored.length,
    items: scored.slice(0, Math.max(1, limit)).map((item) => item.entry),
  };
}

async function setModelAndReply(params: {
  ctx: TelegramContext;
  runtime: TelegramPluginRuntime;
  sessionKey: string;
  provider: string;
  modelId: string;
}): Promise<void> {
  await params.runtime.api.setModel(params.sessionKey, params.provider, params.modelId);
  const sourceLabel = params.sessionKey.includes(":topic:")
    ? "(topic)"
    : params.sessionKey.includes(":group:")
      ? "(group)"
      : params.sessionKey.includes(":dm:")
        ? "(dm)"
        : "";
  await params.ctx.reply(
    `Model${sourceLabel ? ` ${sourceLabel}` : ""}: <b>${escapeHtml(params.provider)}/${escapeHtml(params.modelId)}</b>`,
    { parse_mode: "HTML" },
  );
}

async function replySearchResults(params: {
  ctx: TelegramContext;
  entries: ModelProviderEntry[];
  total: number;
  query: string;
  prefix: string;
}): Promise<void> {
  const keyboardRows = buildModelSelectionKeyboard(params.entries, 2);
  const summary = params.total > params.entries.length
    ? `${params.total} 个结果，展示前 ${params.entries.length} 个`
    : `${params.total} 个结果`;

  await params.ctx.reply(
    `${params.prefix} <b>${escapeHtml(params.query)}</b>：${summary}\n点击按钮切换模型。`,
    { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboardRows } },
  );
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
    columns: 2,
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
    const sessionKey = resolveTelegramSessionKey({
      account,
      ctx: ctx as TelegramContext,
      runtime,
      textHint: args,
    });

    try {
      if (args && args.includes("/")) {
        const slash = args.indexOf("/");
        const provider = args.slice(0, slash).trim();
        const modelId = args.slice(slash + 1).trim();
        if (!provider || !modelId) {
          await ctx.reply("格式错误，请使用 /model provider/modelId");
          return;
        }
        await setModelAndReply({ ctx: ctx as TelegramContext, runtime, sessionKey, provider, modelId });
        return;
      }

      const models = await runtime.api.getAvailableModels(sessionKey);
      const grouped = groupModelsByProvider(models);

      if (args) {
        const result = searchModels(flattenProviderModels(grouped), args);
        if (result.total === 0) {
          await ctx.reply(`没有找到匹配模型：${args}\n试试 /models ${args}`);
          return;
        }
        await replySearchResults({
          ctx: ctx as TelegramContext,
          entries: result.items,
          total: result.total,
          query: args,
          prefix: "搜索",
        });
        return;
      }

      const providers = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
      if (providers.length === 0) {
        await ctx.reply("没有可用模型。");
        return;
      }
      await ctx.reply("选择 Provider：", {
        reply_markup: { inline_keyboard: buildProviderKeyboard(providers, 2) },
      });
    } catch (err: unknown) {
      await ctx.reply(`Failed to list models: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command("models", async (ctx: any) => {
    const args = String(ctx.match ?? "").trim();
    const sessionKey = resolveTelegramSessionKey({
      account,
      ctx: ctx as TelegramContext,
      runtime,
      textHint: args,
    });

    try {
      const models = await runtime.api.getAvailableModels(sessionKey);
      const grouped = groupModelsByProvider(models);
      const entries = flattenProviderModels(grouped);

      if (!args) {
        const providers = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
        if (providers.length === 0) {
          await ctx.reply("没有可用模型。");
          return;
        }
        await ctx.reply(
          "选择 Provider（每行 2 个）：\n或输入 /models <关键词> 搜索模型。",
          { reply_markup: { inline_keyboard: buildProviderKeyboard(providers, 2) } },
        );
        return;
      }

      const result = searchModels(entries, args);
      if (result.total === 0) {
        await ctx.reply(`没有找到匹配模型：${args}`);
        return;
      }

      await replySearchResults({
        ctx: ctx as TelegramContext,
        entries: result.items,
        total: result.total,
        query: args,
        prefix: "搜索",
      });
    } catch (err: unknown) {
      await ctx.reply(`Failed to search models: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command("setmodel", async (ctx: any) => {
    const args = String(ctx.match ?? "").trim();
    if (!args) {
      await ctx.reply("用法：/setmodel provider/modelId 或 /setmodel 关键词");
      return;
    }

    const sessionKey = resolveTelegramSessionKey({
      account,
      ctx: ctx as TelegramContext,
      runtime,
      textHint: args,
    });

    try {
      if (args.includes("/")) {
        const slash = args.indexOf("/");
        const provider = args.slice(0, slash).trim();
        const modelId = args.slice(slash + 1).trim();
        if (!provider || !modelId) {
          await ctx.reply("格式错误，请使用 /setmodel provider/modelId");
          return;
        }
        await setModelAndReply({ ctx: ctx as TelegramContext, runtime, sessionKey, provider, modelId });
        return;
      }

      const models = await runtime.api.getAvailableModels(sessionKey);
      const grouped = groupModelsByProvider(models);
      const entries = flattenProviderModels(grouped);
      const result = searchModels(entries, args);

      if (result.total === 0) {
        await ctx.reply(`没有找到匹配模型：${args}`);
        return;
      }

      if (result.total === 1 && result.items[0]) {
        const hit = result.items[0];
        await setModelAndReply({
          ctx: ctx as TelegramContext,
          runtime,
          sessionKey,
          provider: hit.provider,
          modelId: hit.modelId,
        });
        return;
      }

      await replySearchResults({
        ctx: ctx as TelegramContext,
        entries: result.items,
        total: result.total,
        query: args,
        prefix: "找到多个匹配",
      });
    } catch (err: unknown) {
      await ctx.reply(`Failed to set model: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

/**
 * Central callback_query dispatcher.
 *
 * Routing order:
 * 1. callback-router registry (feature modules: csm, role, rsm, skill_run, cmd_page, …)
 * 2. keyboard-interact (infrastructure: kb:*)
 * 3. Model selection (mdl_* / provider / list / select)
 */
export function registerCallbackHandler(
  bot: TelegramAccountRuntime["bot"],
  runtime: TelegramPluginRuntime,
  account: TelegramAccountRuntime,
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

    // 1. Callback Registry — feature modules register their own handlers
    const handled = await dispatchCallback({
      data,
      ctx: ctx as TelegramContext,
      bot,
      runtime,
      account,
      callbackQuery,
    });
    if (handled) return;

    // 2. Keyboard interaction (infrastructure, not a feature callback)
    const kbParsed = parseKeyboardCallback(data);
    if (kbParsed) {
      const resolved = resolveKeyboard(kbParsed.requestId, kbParsed.optionId);
      await ctx.answerCallbackQuery?.(resolved ? { text: "✅" } : { text: "Expired" });
      return;
    }

    // 3. Model selection callbacks
    const parsed = parseModelCallbackData(data);
    if (!parsed) {
      await ctx.answerCallbackQuery?.();
      return;
    }

    const callbackTextHint = String(callbackQuery?.message?.text ?? callbackQuery?.message?.caption ?? "").trim();
    const sessionKey = resolveTelegramSessionKey({
      account,
      ctx: ctx as TelegramContext,
      runtime,
      textHint: callbackTextHint,
    });

    if (parsed.type === "providers" || parsed.type === "back") {
      const models = await runtime.api.getAvailableModels(sessionKey);
      const grouped = groupModelsByProvider(models);
      const providers = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
      const msg = callbackQuery?.message as any;
      await ctx.answerCallbackQuery?.();
      await (bot.api as any).editMessageText(String(msg.chat.id), msg.message_id, "选择 Provider：", {
        reply_markup: { inline_keyboard: buildProviderKeyboard(providers, 2) },
      }).catch(async () => {
        await ctx.reply("选择 Provider：", {
          reply_markup: { inline_keyboard: buildProviderKeyboard(providers, 2) },
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
      try {
        await runtime.api.setModel(sessionKey, parsed.provider, parsed.modelId);
        await ctx.answerCallbackQuery?.({ text: `已切换到 ${parsed.provider}/${parsed.modelId}` });
        const sourceLabel = sessionKey.includes(":topic:")
          ? "(topic)"
          : sessionKey.includes(":group:")
            ? "(group)"
            : sessionKey.includes(":dm:")
              ? "(dm)"
              : "";
        const message = `Model${sourceLabel ? ` ${sourceLabel}` : ""}: <b>${parsed.provider}/${parsed.modelId}</b>`;
        await ctx.reply(markdownToTelegramHtml(message), { parse_mode: "HTML" });
      } catch (err: unknown) {
        await ctx.answerCallbackQuery?.({ text: "切换失败" });
        await ctx.reply(`Failed to set model: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
}
