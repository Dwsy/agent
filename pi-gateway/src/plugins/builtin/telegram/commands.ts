import { resolveSessionKey, resolveAgentId } from "../../../core/session-router.ts";
import type { MessageSource } from "../../../core/types.ts";
import { escapeHtml, markdownToTelegramHtml } from "./format.ts";
import {
  buildModelsKeyboard,
  buildProviderKeyboard,
  groupModelsByProvider,
  parseModelCallbackData,
} from "./model-buttons.ts";
import { parseMediaCommandArgs, sendTelegramMedia } from "./media-send.ts";
import type { TelegramAccountRuntime, TelegramContext, TelegramPluginRuntime } from "./types.ts";

type SessionMessageMode = "steer" | "follow-up" | "interrupt";

// Gateway 本地命令列表
const LOCAL_COMMANDS = [
  { command: "help", description: "显示帮助" },
  { command: "new", description: "重置会话" },
  { command: "stop", description: "中断当前输出" },
  { command: "model", description: "查看/切换模型" },
  { command: "status", description: "查看会话状态" },
  { command: "context", description: "上下文使用情况" },
  { command: "queue", description: "会话并发策略" },
  { command: "role", description: "切换/查看角色" },
  { command: "cron", description: "定时任务管理" },
  { command: "skills", description: "查看/调用技能" },
  { command: "media", description: "媒体发送说明" },
  { command: "photo", description: "发送图片" },
  { command: "audio", description: "发送音频" },
  { command: "refresh", description: "刷新命令列表" },
];

// Prefixes to collapse into grouped commands (not registered individually)
const GROUPED_PREFIXES = ["skill:"];

// 缓存 pi 原生命令
let cachedPiCommands: { name: string; description?: string }[] = [];

/** 刷新 pi 命令并重新注册到 Telegram */
export async function refreshPiCommands(account: TelegramAccountRuntime, config?: { agents?: { list: { id: string }[] } }): Promise<number | null> {
  const tempSessionKey = `telegram:${account.accountId}:__init__`;
  const piCommands = await account.api.getPiCommands(tempSessionKey).catch((err) => {
    account.api.logger.error(`[telegram:${account.accountId}] getPiCommands failed: ${String(err)}`);
    return null;
  });
  if (piCommands === null) return null; // distinguish "failed" from "no commands"
  cachedPiCommands = piCommands;
  const agentIds = (config?.agents?.list ?? []).map(a => a.id).filter(id => id !== "main");
  await registerNativeCommands(account, piCommands, agentIds.length > 0 ? agentIds : undefined);
  return piCommands.length;
}

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
      "/stop — 中断当前输出",
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

async function registerNativeCommands(
  account: TelegramAccountRuntime,
  piCommands: { name: string; description?: string }[],
  agentIds?: string[],
): Promise<void> {
  const cfg = account.cfg.commands;
  if (cfg?.native === false) return;

  // 合并本地命令和 pi 原生命令（pi 命令加 pi_ 前缀区分）
  const allCommands = [
    ...LOCAL_COMMANDS,
    // Agent prefix commands (/{agentId} for multi-agent routing)
    ...(agentIds ?? []).map(id => ({
      command: id.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32),
      description: `Switch to agent: ${id}`,
    })),
    ...piCommands
      .filter(cmd => !GROUPED_PREFIXES.some(p => cmd.name.replace(/^\//, "").startsWith(p))) // skip grouped commands (shown via inline keyboard)
      .map(cmd => ({
        command: `pi_${cmd.name.replace(/^\//, "")}`, // pi_role, pi_compact, etc.
        description: cmd.description ?? `pi: ${cmd.name}`,
      })),
  ];

  // Telegram 命令名只支持小写字母、数字和下划线，最多 32 字符
  const validCommands = allCommands
    .map(cmd => ({
      command: cmd.command.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32),
      description: cmd.description.slice(0, 256),
    }))
    .filter((cmd, idx, arr) => arr.findIndex(c => c.command === cmd.command) === idx) // 去重
    .slice(0, 50); // Telegram setMyCommands 上限 100 条，先用 50 测试

  await account.bot.api.setMyCommands(validCommands).catch((err) => {
    account.api.logger.warn(`[telegram:${account.accountId}] setMyCommands failed: ${String(err)}`);
  });

  const truncated = allCommands.length > 100 ? ` (truncated from ${allCommands.length})` : "";
  account.api.logger.info(`[telegram:${account.accountId}] Registered ${validCommands.length} commands (${LOCAL_COMMANDS.length} local + ${piCommands.length} pi)${truncated}`);
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

  // === 本地命令 ===
  bot.command("new", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    await runtime.api.resetSession(sessionKey);
    await ctx.reply("Session reset.");
  });

  bot.command("stop", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    await runtime.api.abortSession(sessionKey);
    await ctx.reply("⏹ Stopped.");
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

    // Add context usage info
    try {
      const [stats, rpcState] = await Promise.all([
        runtime.api.getSessionStats(sessionKey),
        runtime.api.getRpcState(sessionKey),
      ]);
      const s = stats as any;
      const st = rpcState as any;
      const contextWindow = st?.model?.contextWindow ?? 0;
      const inputTokens = s?.tokens?.input ?? 0;
      const fmt = (n: number) => n >= 1_000_000 ? (n/1_000_000).toFixed(1)+"M" : n >= 1_000 ? Math.round(n/1_000)+"k" : String(n);
      const pct = contextWindow > 0 ? ((inputTokens / contextWindow) * 100).toFixed(1) : "?";
      lines.push(`<b>Context:</b> ${pct}% (${fmt(inputTokens)}/${fmt(contextWindow)})`);
      lines.push(`<b>Model:</b> ${st?.model?.id ?? "unknown"}`);
    } catch {
      // ignore errors
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("context", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);

    const [stats, state] = await Promise.all([
      runtime.api.getSessionStats(sessionKey),
      runtime.api.getRpcState(sessionKey),
    ]).catch((err) => {
      ctx.reply(`Failed to get context stats: ${err?.message ?? String(err)}`);
      return [null, null];
    });

    if (!stats || !state) return;

    const s = stats as any;
    const st = state as any;
    const contextWindow = st?.model?.contextWindow ?? 0;
    const totalTokens = s?.tokens?.total ?? 0;
    const inputTokens = s?.tokens?.input ?? 0;
    const outputTokens = s?.tokens?.output ?? 0;
    const cacheRead = s?.tokens?.cacheRead ?? 0;
    const cacheWrite = s?.tokens?.cacheWrite ?? 0;

    const fmt = (n: number) => n >= 1_000_000 ? (n/1_000_000).toFixed(1)+"M" : n >= 1_000 ? Math.round(n/1_000)+"k" : String(n);

    const percent = contextWindow > 0 ? ((inputTokens / contextWindow) * 100).toFixed(1) : "?";
    const pct = contextWindow > 0 ? Math.min(inputTokens / contextWindow, 1) : 0;
    const barLen = 20;
    const filled = Math.round(pct * barLen);
    const bar = "█".repeat(filled) + "░".repeat(barLen - filled);

    const lines = [
      `<b>📊 Context Usage</b>`,
      `<code>${bar}</code> ${percent}%`,
      ``,
      `<b>Window:</b> ${fmt(contextWindow)} tokens`,
      `<b>Input:</b> ${fmt(inputTokens)}`,
      `<b>Output:</b> ${fmt(outputTokens)}`,
      `<b>Cache R/W:</b> ${fmt(cacheRead)} / ${fmt(cacheWrite)}`,
      `<b>Cost:</b> $${(s?.cost ?? 0).toFixed(4)}`,
      ``,
      `<b>Messages:</b> ${s?.totalMessages ?? 0} (👤${s?.userMessages ?? 0} 🤖${s?.assistantMessages ?? 0} 🔧${s?.toolResults ?? 0})`,
      `<b>Tool Calls:</b> ${s?.toolCalls ?? 0}`,
      `<b>Model:</b> ${st?.model?.id ?? "unknown"}`,
      `<b>Thinking:</b> ${st?.thinkingLevel ?? "off"}`,
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

  bot.command("refresh", async (ctx: any) => {
    const count = await refreshPiCommands(account, runtime.api.config);
    await ctx.reply(`Commands refreshed. ${LOCAL_COMMANDS.length} local + ${count} pi commands registered.`);
  });

  bot.command("skills", async (ctx: any) => {
    const skillCommands = cachedPiCommands.filter(cmd =>
      GROUPED_PREFIXES.some(p => cmd.name.replace(/^\//, "").startsWith(p))
    );
    if (skillCommands.length === 0) {
      await ctx.reply("No skills available.");
      return;
    }
    const buttons = skillCommands.map(cmd => {
      const name = cmd.name.replace(/^\//, "");
      const label = name.replace(/^skill:/, "");
      return [{ text: `📦 ${label}`, callback_data: `skill_run:${name}` }];
    });
    await ctx.reply("<b>Available Skills</b>\n\nSelect a skill to run:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
    });
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

  bot.command("cron", async (ctx: any) => {
    const args = String(ctx.match ?? "").trim();
    const sub = args.split(/\s+/)[0]?.toLowerCase() ?? "";
    const rest = args.slice(sub.length).trim();

    if (!sub || sub === "list") {
      const jobs = runtime.api.cronEngine?.listJobs() ?? [];
      if (jobs.length === 0) {
        await ctx.reply("No cron jobs.");
        return;
      }
      const lines = jobs.map((j: any) => {
        const status = j.paused ? "⏸" : j.enabled === false ? "⛔" : "▶";
        const sched = j.schedule.kind === "cron" ? j.schedule.expr
          : j.schedule.kind === "every" ? `every ${j.schedule.expr}`
          : `at ${j.schedule.expr}`;
        return `${status} <code>${escapeHtml(j.id)}</code> — ${escapeHtml(sched)}\n   ${escapeHtml(j.payload.text.slice(0, 80))}`;
      });
      await ctx.reply(`<b>Cron Jobs (${jobs.length})</b>\n\n${lines.join("\n\n")}`, { parse_mode: "HTML" });
      return;
    }

    if (sub === "pause") {
      if (!rest) { await ctx.reply("Usage: /cron pause <id>"); return; }
      const ok = runtime.api.cronEngine?.pauseJob(rest);
      await ctx.reply(ok ? `⏸ Paused: ${rest}` : `Not found: ${rest}`);
      return;
    }

    if (sub === "resume") {
      if (!rest) { await ctx.reply("Usage: /cron resume <id>"); return; }
      const ok = runtime.api.cronEngine?.resumeJob(rest);
      await ctx.reply(ok ? `▶ Resumed: ${rest}` : `Not found or not paused: ${rest}`);
      return;
    }

    if (sub === "remove") {
      if (!rest) { await ctx.reply("Usage: /cron remove <id>"); return; }
      const ok = runtime.api.cronEngine?.removeJob(rest);
      await ctx.reply(ok ? `🗑 Removed: ${rest}` : `Not found: ${rest}`);
      return;
    }

    if (sub === "run") {
      if (!rest) { await ctx.reply("Usage: /cron run <id>"); return; }
      const ok = runtime.api.cronEngine?.runJob(rest);
      await ctx.reply(ok ? `🚀 Triggered: ${rest}` : `Not found: ${rest}`);
      return;
    }

    await ctx.reply(
      [
        "<b>Cron Commands</b>",
        "",
        "/cron list — 查看所有任务",
        "/cron pause &lt;id&gt; — 暂停任务",
        "/cron resume &lt;id&gt; — 恢复任务",
        "/cron remove &lt;id&gt; — 删除任务",
        "/cron run &lt;id&gt; — 手动触发",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.command("model", async (ctx: any) => {
    const args = String(ctx.match ?? "").trim();
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);

    if (args && args.includes("/")) {
      // Direct switch: /model provider/modelId
      const slash = args.indexOf("/");
      const provider = args.slice(0, slash);
      const modelId = args.slice(slash + 1);
      try {
        await runtime.api.setModel(sessionKey, provider, modelId);
        await ctx.reply(`Model: <b>${escapeHtml(provider)}/${escapeHtml(modelId)}</b>`, { parse_mode: "HTML" });
      } catch (err: any) {
        await ctx.reply(`Failed: ${err?.message ?? String(err)}`);
      }
      return;
    }

    // No args: show provider keyboard
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
    } catch (err: any) {
      await ctx.reply(`Failed to list models: ${err?.message ?? String(err)}`);
    }
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

  // 初始化时尝试获取 pi 命令，如果 RPC 还没连接则只注册本地命令
  // 用户可以稍后用 /refresh 手动刷新
  await refreshPiCommands(account, runtime.api.config);
}
