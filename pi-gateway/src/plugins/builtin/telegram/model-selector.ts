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
import { parseKeyboardCallback, resolveKeyboard } from "../../../api/keyboard-interact.ts";
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

    // Keyboard interaction (kb:requestId:optionId)
    const kbParsed = parseKeyboardCallback(data);
    if (kbParsed) {
      const resolved = resolveKeyboard(kbParsed.requestId, kbParsed.optionId);
      await ctx.answerCallbackQuery?.(resolved ? { text: "✅" } : { text: "Expired" });
      return;
    }

    // Resume session callbacks (rsm:idx, rsm_see:idx, rsm_pg:page)
    if (data.startsWith("rsm:") || data.startsWith("rsm_see:") || data.startsWith("rsm_pg:")) {
      await handleResumeCallback(data, ctx as TelegramContext, bot, runtime, account, callbackQuery);
      return;
    }

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

// ============================================================================
// Resume session callback handler
// ============================================================================

const RESUME_PAGE_SIZE = 5;

function timeSince(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function getFirstUserMessage(api: TelegramPluginRuntime["api"], sessionKey: string): string | null {
  try {
    const entries = api.readTranscript(sessionKey, 200);
    const first = entries.find((e: any) => e.cat === "prompt" && e.type === "user_message");
    if (!first?.data?.text) return null;
    const text = String(first.data.text);
    return text.length > 200 ? text.slice(0, 200) + "…" : text;
  } catch {
    return null;
  }
}

export function buildResumeView(
  sessions: any[],
  currentKey: string,
  page: number,
): { text: string; rows: Array<Array<{ text: string; callback_data: string }>> } {
  const totalPages = Math.max(1, Math.ceil(sessions.length / RESUME_PAGE_SIZE));
  page = Math.max(1, Math.min(page, totalPages));
  const start = (page - 1) * RESUME_PAGE_SIZE;
  const slice = sessions.slice(start, start + RESUME_PAGE_SIZE);

  const lines = slice.map((s: any, i: number) => {
    const idx = start + i + 1;
    const active = s.sessionKey === currentKey ? " ✅" : "";
    const msgs = s.messageCount ?? 0;
    const ago = s.lastActivity ? timeSince(s.lastActivity) : "?";
    return `<b>${idx}.</b> <code>${escapeHtml(s.sessionKey)}</code>${active}\n   ${msgs} msgs · ${ago} ago`;
  });

  const text = `<b>Sessions (${sessions.length})</b>\n\n${lines.join("\n\n")}\n\n<i>▶ resume · 👁 preview</i>`;

  const rows: Array<Array<{ text: string; callback_data: string }>> = slice.map((_s: any, i: number) => {
    const idx = start + i;
    return [
      { text: `▶ ${start + i + 1}`, callback_data: `rsm:${idx}` },
      { text: "👁", callback_data: `rsm_see:${idx}` },
    ];
  });

  if (totalPages > 1) {
    rows.push([
      { text: "◀", callback_data: `rsm_pg:${Math.max(1, page - 1)}` },
      { text: `${page}/${totalPages}`, callback_data: `rsm_pg:${page}` },
      { text: "▶", callback_data: `rsm_pg:${Math.min(totalPages, page + 1)}` },
    ]);
  }

  return { text, rows };
}

async function handleResumeCallback(
  data: string,
  ctx: TelegramContext,
  bot: TelegramAccountRuntime["bot"],
  runtime: TelegramPluginRuntime,
  account: TelegramAccountRuntime,
  callbackQuery: any,
): Promise<void> {
  const msg = callbackQuery?.message as any;
  const chatId = String(msg?.chat?.id ?? "");
  const messageId = msg?.message_id;

  const sessions = runtime.api.listSessions();
  const source = toSource(account.accountId, ctx);
  const currentKey = resolveSessionKey(source, runtime.api.config);

  // Pagination
  if (data.startsWith("rsm_pg:")) {
    const page = Math.max(1, parseInt(data.slice("rsm_pg:".length), 10) || 1);
    const view = buildResumeView(sessions, currentKey, page);
    await (ctx as any).answerCallbackQuery?.();
    await (bot.api as any).editMessageText(chatId, messageId, view.text, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: view.rows },
    }).catch(() => {});
    return;
  }

  // See — show first user message
  if (data.startsWith("rsm_see:")) {
    const idx = parseInt(data.slice("rsm_see:".length), 10);
    const target = sessions[idx];
    if (!target) {
      await (ctx as any).answerCallbackQuery?.({ text: "Session not found" });
      return;
    }

    const firstMsg = getFirstUserMessage(runtime.api, target.sessionKey);
    const preview = firstMsg
      ? `💬 <b>First message:</b>\n<blockquote>${escapeHtml(firstMsg)}</blockquote>`
      : `<i>No messages recorded</i>`;

    const msgs = target.messageCount ?? 0;
    const ago = target.lastActivity ? timeSince(target.lastActivity) : "?";

    const text = `<b>Session ${idx + 1}</b>\n<code>${escapeHtml(target.sessionKey)}</code>\n${msgs} msgs · ${ago} ago\n\n${preview}`;

    await (ctx as any).answerCallbackQuery?.();
    await (bot.api as any).editMessageText(chatId, messageId, text, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "▶ Resume", callback_data: `rsm:${idx}` },
            { text: "◀ Back", callback_data: `rsm_pg:${Math.floor(idx / RESUME_PAGE_SIZE) + 1}` },
          ],
        ],
      },
    }).catch(() => {});
    return;
  }

  // Resume
  if (data.startsWith("rsm:")) {
    const idx = parseInt(data.slice("rsm:".length), 10);
    const target = sessions[idx];
    if (!target) {
      await (ctx as any).answerCallbackQuery?.({ text: "Session not found" });
      return;
    }

    if (target.sessionKey === currentKey) {
      await (ctx as any).answerCallbackQuery?.({ text: "Already active" });
      return;
    }

    runtime.api.releaseSession(currentKey);

    let extra = "";
    try {
      const [stats, rpcState] = await Promise.all([
        runtime.api.getSessionStats(target.sessionKey),
        runtime.api.getRpcState(target.sessionKey),
      ]);
      const s = stats as any;
      const st = rpcState as any;
      const contextWindow = st?.model?.contextWindow ?? 0;
      const inputTokens = s?.tokens?.input ?? 0;
      const pct = contextWindow > 0 ? ((inputTokens / contextWindow) * 100).toFixed(1) : "?";
      const model = st?.model?.id ?? "unknown";
      extra = `\n<b>Model:</b> ${model}\n<b>Context:</b> ${pct}%`;
    } catch {
      // RPC not yet bound
    }

    const msgs = target.messageCount ?? 0;
    const ago = target.lastActivity ? timeSince(target.lastActivity) : "?";

    await (ctx as any).answerCallbackQuery?.({ text: "Switched!" });
    await (bot.api as any).editMessageText(
      chatId, messageId,
      `✅ Switched to <code>${escapeHtml(target.sessionKey)}</code>\n<b>Messages:</b> ${msgs}\n<b>Last active:</b> ${ago} ago${extra}`,
      { parse_mode: "HTML" },
    ).catch(() => {});
  }
}
