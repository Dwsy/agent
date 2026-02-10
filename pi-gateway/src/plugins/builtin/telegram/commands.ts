import { resolveSessionKey } from "../../../core/session-router.ts";
import type { MessageSource } from "../../../core/types.ts";
import { markdownToTelegramHtml } from "./format.ts";
import {
  buildModelsKeyboard,
  buildProviderKeyboard,
  groupModelsByProvider,
  parseModelCallbackData,
} from "./model-buttons.ts";
import { parseMediaCommandArgs, sendTelegramMedia } from "./media-send.ts";
import type { TelegramAccountRuntime, TelegramContext, TelegramPluginRuntime } from "./types.ts";

type SessionMessageMode = "steer" | "follow-up" | "interrupt";

function toChatType(chatType?: string): "dm" | "group" {
  return chatType === "private" ? "dm" : "group";
}

function toSource(accountId: string, ctx: TelegramContext): MessageSource {
  return {
    channel: "telegram",
    accountId,
    chatType: toChatType(ctx.chat?.type),
    chatId: String(ctx.chat?.id ?? ""),
    topicId: (ctx.message as any)?.message_thread_id
      ? String((ctx.message as any).message_thread_id)
      : undefined,
    senderId: String(ctx.from?.id ?? "unknown"),
    senderName: ctx.from?.username ?? ctx.from?.first_name,
  };
}

function helpPage(page: number): { text: string; keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } {
  const pages = [
    [
      "<b>Telegram Commands (1/2)</b>",
      "",
      "/help — 帮助",
      "/new — 重置会话",
      "/status — 查看会话状态",
      "/model — 查看/切换模型",
      "/think &lt;level&gt; — 设置思考等级",
      "/compact — 压缩上下文",
      "/stop — 停止当前会话",
      "/queue [mode] — 会话并发策略",
    ],
    [
      "<b>Telegram Commands (2/2)</b>",
      "",
      "/media — 媒体发送说明",
      "/photo &lt;url|path&gt; [caption] — 发图",
      "/audio &lt;url|path&gt; [caption] — 发音频",
      "",
      "<b>回复中的媒体指令</b>",
      "<code>[photo] https://... | caption</code>",
      "<code>[audio] https://... | caption</code>",
    ],
  ];
  const idx = Math.max(0, Math.min(page - 1, pages.length - 1));
  const prev = Math.max(1, idx);
  const next = Math.min(pages.length, idx + 2);
  return {
    text: pages[idx]!.join("\n"),
    keyboard: {
      inline_keyboard: [[
        { text: "◀", callback_data: `cmd_page:${prev}` },
        { text: `${idx + 1}/${pages.length}`, callback_data: `cmd_page:${idx + 1}` },
        { text: "▶", callback_data: `cmd_page:${next}` },
      ]],
    },
  };
}

async function sendHelp(ctx: TelegramContext, page = 1): Promise<void> {
  const view = helpPage(page);
  await ctx.reply(view.text, {
    parse_mode: "HTML",
    reply_markup: view.keyboard,
  });
}

async function registerNativeCommands(account: TelegramAccountRuntime): Promise<void> {
  const cfg = account.cfg.commands;
  if (cfg?.native === false) return;

  await account.bot.api.setMyCommands([
    { command: "help", description: "显示帮助" },
    { command: "new", description: "重置会话" },
    { command: "status", description: "查看会话状态" },
    { command: "model", description: "切换模型" },
    { command: "think", description: "设置思考等级" },
    { command: "compact", description: "压缩上下文" },
    { command: "stop", description: "停止当前会话" },
    { command: "queue", description: "会话并发策略" },
    { command: "media", description: "媒体发送说明" },
    { command: "photo", description: "发送图片" },
    { command: "audio", description: "发送音频" },
  ]).catch((err) => {
    account.api.logger.warn(`[telegram:${account.accountId}] setMyCommands failed: ${String(err)}`);
  });
}

function normalizeSessionMessageMode(value: string): SessionMessageMode | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "steer") return "steer";
  if (normalized === "follow-up" || normalized === "followup") return "follow-up";
  if (normalized === "interrupt") return "interrupt";
  return null;
}

function resolveConfiguredSessionMode(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime): SessionMessageMode {
  const accountMode = normalizeSessionMessageMode(String(account.cfg.messageMode ?? ""));
  if (accountMode) return accountMode;
  const topMode = normalizeSessionMessageMode(String(runtime.channelCfg.messageMode ?? ""));
  return topMode ?? "steer";
}

async function renderModelProviders(account: TelegramAccountRuntime, sessionKey: string, ctx: TelegramContext): Promise<void> {
  const models = await account.api.getAvailableModels(sessionKey);
  const grouped = groupModelsByProvider(models);
  const providers = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  if (providers.length === 0) {
    await ctx.reply("当前无可用模型。", { parse_mode: "HTML" });
    return;
  }
  await ctx.reply("选择 Provider：", {
    reply_markup: { inline_keyboard: buildProviderKeyboard(providers) },
  });
}

async function renderProviderModels(params: {
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

export async function setupTelegramCommands(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime): Promise<void> {
  const bot = account.bot;

  bot.command("new", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    await runtime.api.resetSession(sessionKey);
    await ctx.reply("Session reset.");
  });

  bot.command("status", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    const state = runtime.api.getSessionState(sessionKey);
    const messageMode = await runtime.api.getSessionMessageMode(sessionKey);
    const configuredMode = resolveConfiguredSessionMode(runtime, account);
    const isOverridden = messageMode !== configuredMode;
    if (!state) {
      await ctx.reply(
        `No active session.\nQueue mode: <b>${messageMode}</b>${isOverridden ? " (override)" : " (config)"}`,
        { parse_mode: "HTML" },
      );
      return;
    }
    const lines = [
      `<b>Session:</b> <code>${sessionKey}</code>`,
      `<b>Role:</b> ${state.role ?? "default"}`,
      `<b>Messages:</b> ${state.messageCount}`,
      `<b>Streaming:</b> ${state.isStreaming}`,
      `<b>Account:</b> ${account.accountId}`,
      `<b>Queue Mode:</b> ${messageMode}${isOverridden ? " (override)" : " (config)"}`,
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("queue", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    const argRaw = String(ctx.match ?? "").trim();

    if (!argRaw) {
      const current = await runtime.api.getSessionMessageMode(sessionKey);
      const configuredMode = resolveConfiguredSessionMode(runtime, account);
      const isOverridden = current !== configuredMode;
      await ctx.reply(
        [
          `<b>Queue Mode:</b> ${current}`,
          `<b>Source:</b> ${isOverridden ? "override" : "config"}`,
          `<b>Usage:</b> <code>/queue steer|follow-up|interrupt</code>`,
        ].join("\n"),
        { parse_mode: "HTML" },
      );
      return;
    }

    const nextMode = normalizeSessionMessageMode(argRaw);
    if (!nextMode) {
      await ctx.reply("Invalid mode. Use: /queue steer|follow-up|interrupt");
      return;
    }

    await runtime.api.setSessionMessageMode(sessionKey, nextMode);
    await ctx.reply(
      `<b>Queue Mode:</b> ${nextMode} <i>(session override, process-local)</i>`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("compact", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    await ctx.reply("Compacting context...");
    await runtime.api.compactSession(sessionKey);
    await ctx.reply("Context compacted.");
  });

  bot.command("stop", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    await runtime.api.abortSession(sessionKey);
    await ctx.reply("Stopped.");
  });

  bot.command("think", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    const level = String(ctx.match ?? "").trim() || "medium";
    const valid = ["off", "minimal", "low", "medium", "high", "xhigh"];
    if (!valid.includes(level)) {
      await ctx.reply(`Invalid level. Use: ${valid.join(", ")}`);
      return;
    }
    await runtime.api.setThinkingLevel(sessionKey, level);
    await ctx.reply(`Thinking: <b>${level}</b>`, { parse_mode: "HTML" });
  });

  bot.command("model", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    const modelStr = String(ctx.match ?? "").trim();
    if (!modelStr) {
      await renderModelProviders(account, sessionKey, ctx as TelegramContext);
      return;
    }

    if (!modelStr.includes("/")) {
      await ctx.reply("Usage: /model provider/modelId");
      return;
    }

    const slash = modelStr.indexOf("/");
    const provider = modelStr.slice(0, slash);
    const modelId = modelStr.slice(slash + 1);
    await runtime.api.setModel(sessionKey, provider, modelId);
    await ctx.reply(`Model: <b>${provider}/${modelId}</b>`, { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx: any) => {
    await sendHelp(ctx as TelegramContext, 1);
  });

  bot.command("media", async (ctx: any) => {
    const lines = [
      "<b>Media Send Options</b>",
      "",
      "/photo &lt;url|path|file://&gt; [caption]",
      "/audio &lt;url|path|file://&gt; [caption]",
      "",
      "<b>Also supported in AI reply:</b>",
      "<code>[photo] https://... | caption</code>",
      "<code>[audio] https://... | caption</code>",
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("photo", async (ctx: any) => {
    const parsed = parseMediaCommandArgs(String(ctx.match ?? ""));
    if (!parsed) {
      await ctx.reply("Usage: /photo <url|path|file://> [caption]");
      return;
    }
    await sendTelegramMedia(bot, String(ctx.chat.id), {
      kind: "photo",
      url: parsed.target,
      caption: parsed.caption,
    }, {
      messageThreadId: (ctx.message as any)?.message_thread_id,
    });
  });

  bot.command("audio", async (ctx: any) => {
    const parsed = parseMediaCommandArgs(String(ctx.match ?? ""));
    if (!parsed) {
      await ctx.reply("Usage: /audio <url|path|file://> [caption]");
      return;
    }
    await sendTelegramMedia(bot, String(ctx.chat.id), {
      kind: "audio",
      url: parsed.target,
      caption: parsed.caption,
    }, {
      messageThreadId: (ctx.message as any)?.message_thread_id,
    });
  });

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

  await registerNativeCommands(account);
}
