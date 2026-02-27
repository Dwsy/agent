import { resolveSessionKey, resolveAgentId } from "../../../core/session-router.ts";
import type { SessionStats, RpcState } from "../../../core/interface/plugins/types.ts";
import { isSenderAllowed, type DmPolicy } from "../../../security/allowlist.ts";
import { escapeHtml, markdownToTelegramHtml } from "./format.ts";
import { parseMediaCommandArgs, sendTelegramMedia } from "./media-send.ts";
import { registerModelCommand, registerCallbackHandler } from "./model-selector.ts";
import { onCallback } from "./callback-router.ts";
import { collectSysInfo } from "./sysinfo.ts";
import { getConciseStateManager, getConciseConfigDefault } from "../concise-mode/index.ts";
import { toSource, timeSince } from "./helpers.ts";
import type { TelegramAccountRuntime, TelegramContext, TelegramPluginRuntime } from "./types.ts";

type SessionMessageMode = "steer" | "follow-up" | "interrupt";

// Gateway 本地命令列表
const LOCAL_COMMANDS = [
  { command: "help", description: "显示帮助" },
  { command: "new", description: "重置会话" },
  { command: "stop", description: "中断当前输出" },
  { command: "model", description: "查看/切换模型" },
  { command: "think", description: "设置思考等级" },
  { command: "compact", description: "压缩上下文" },
  { command: "status", description: "查看会话状态" },
  { command: "context", description: "上下文使用情况" },
  { command: "queue", description: "会话并发策略" },
  { command: "whoami", description: "查看发送者信息" },
  { command: "bash", description: "执行 shell 命令" },
  { command: "config", description: "查看运行配置" },
  { command: "restart", description: "重启 gateway" },
  { command: "sys", description: "系统状态" },
  // { command: "role", description: "切换/查看角色" },
  { command: "cron", description: "定时任务管理" },
  { command: "skills", description: "查看/调用技能" },
  { command: "sessions", description: "查看所有会话" },
  { command: "resume", description: "恢复指定会话" },
  { command: "concise", description: "简洁模式开关" },
  { command: "refresh", description: "刷新命令列表" },
  { command: "reload_session", description: "重载 agent 运行时" },
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

/** Check if sender is in allowFrom list (for privileged commands like /bash, /config, /restart). */
export function isAuthorizedSender(senderId: string, account: TelegramAccountRuntime): boolean {
  const policy: DmPolicy = account.cfg.dmPolicy ?? "pairing";
  return isSenderAllowed("telegram", senderId, policy, account.cfg.allowFrom, account.accountId);
}

const BASH_OUTPUT_LIMIT = 4096;
const BASH_TIMEOUT_MS = 30_000;

/** Execute a shell command and reply with output. */
export async function executeBashCommand(ctx: any, cmd: string, runtime: TelegramPluginRuntime, accountId: string): Promise<void> {
  runtime.api.logger.info(`[bash] Executing: ${cmd.slice(0, 200)}`);

  // Resolve session key to get the correct working directory
  const source = toSource(accountId, ctx as TelegramContext);
  const sessionKey = resolveSessionKey(source, runtime.api.config);
  const rpc = runtime.api.rpcPool?.getForSession(sessionKey);
  const cwd = rpc?.cwd ?? process.cwd();

  runtime.api.logger.info(`[bash] Working directory: ${cwd}`);

  try {
    const proc = Bun.spawn(["sh", "-c", cmd], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, TERM: "dumb" },
    });

    const timer = setTimeout(() => proc.kill(), BASH_TIMEOUT_MS);
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    clearTimeout(timer);
    await proc.exited;

    const code = proc.exitCode ?? -1;
    let output = (stdout + (stderr ? `\n--- stderr ---\n${stderr}` : "")).trim();
    if (output.length > BASH_OUTPUT_LIMIT) {
      output = output.slice(0, BASH_OUTPUT_LIMIT) + "\n…(truncated)";
    }

    const header = code === 0 ? "✅" : `⚠️ exit ${code}`;
    const body = output ? `<pre>${escapeHtml(output)}</pre>` : "<i>(no output)</i>";
    await ctx.reply(`${header}\n${body}`, { parse_mode: "HTML" });
  } catch (err: any) {
    await ctx.reply(`❌ ${escapeHtml(err?.message ?? String(err))}`);
  }
}

/** Traverse config by dot-separated path. */
function getConfigPath(config: any, path: string): unknown {
  const parts = path.split(".");
  let current: any = config;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

/** JSON replacer that redacts sensitive values. */
function redactSensitive(key: string, value: unknown): unknown {
  const lower = key.toLowerCase();
  if (lower.includes("token") || lower.includes("secret") || lower.includes("password") || lower.includes("apikey") || lower === "bottoken") {
    return typeof value === "string" && value.length > 0 ? "[REDACTED]" : value;
  }
  return value;
}

function helpPage(page: number): { text: string; keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } {
  const pages = [
    [
      "<b>Telegram Commands (1/3)</b>",
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
      "<b>Telegram Commands (2/3)</b>",
      "",
      "/context — 上下文详情",
      "/whoami — 查看发送者信息",
      "/cron — 定时任务管理",
      "/skills — 查看/调用技能",
      "/sessions — 查看所有会话",
      "/resume — 恢复指定会话",
      "/refresh — 刷新命令列表",
      "/reload_session — 重载 agent 运行时",
    ],
    [
      "<b>Admin Commands (3/3)</b>",
      "",
      "/bash &lt;cmd&gt; — 执行 shell 命令",
      "/config [section] — 查看运行配置",
      "/restart — 重启 gateway",
      "/sys — 系统状态",
      "",
      "<i>需要 allowFrom 授权</i>",
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
    // game filter
    .filter(cmd => !cmd.name.startsWith("game:"))
      .filter(cmd => !GROUPED_PREFIXES.some(p => cmd.name.replace(/^\//, "").startsWith(p))) // skip grouped commands (shown via inline keyboard)
      .map(cmd => (
        {
        command: `pi_${cmd.name.replace(/^\//, "")}`, // pi_role, pi_compact, etc.
        description: cmd.description ?? `pi: ${cmd.name}`,
      })),
  ];
  console.log(allCommands.map(cmd => cmd.command).join(","));

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

// renderModelProviders + renderProviderModels → model-selector.ts

// ============================================================================
// Concise mode — shared UI builder + callback registration
// ============================================================================

function buildConciseView(sessionKey: string): { text: string; keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } {
  const manager = getConciseStateManager();
  const configDefault = getConciseConfigDefault();
  const effective = manager?.getEffectiveState(sessionKey, configDefault) ?? configDefault;
  const override = manager?.getSessionOverride(sessionKey);
  const src = override !== undefined ? "override" : "config";
  return {
    text: `<b>简洁模式</b>: ${effective ? "✅ ON" : "⭕ OFF"} <i>(${src})</i>`,
    keyboard: {
      inline_keyboard: [[
        { text: effective ? "✅ ON" : "ON", callback_data: "csm:on" },
        { text: effective ? "OFF" : "⭕ OFF", callback_data: "csm:off" },
        { text: "🔄 Default", callback_data: "csm:reset" },
      ]],
    },
  };
}

// Register csm:* callback via callback-router (called once at module load)
onCallback("csm:", async ({ data, ctx, bot, runtime, account, callbackQuery }) => {
  const source = toSource(account.accountId, ctx);
  const sessionKey = resolveSessionKey(source, runtime.api.config);
  const manager = getConciseStateManager();

  if (data === "csm:on") {
    manager?.setSessionOverride(sessionKey, true);
    await ctx.answerCallbackQuery?.({ text: "Concise ON" });
  } else if (data === "csm:off") {
    manager?.setSessionOverride(sessionKey, false);
    await ctx.answerCallbackQuery?.({ text: "Concise OFF" });
  } else if (data === "csm:reset") {
    manager?.clearSessionOverride(sessionKey);
    await ctx.answerCallbackQuery?.({ text: "Reset to config default" });
  } else {
    await ctx.answerCallbackQuery?.();
    return;
  }

  const view = buildConciseView(sessionKey);
  const msg = callbackQuery?.message as any;
  if (msg?.chat?.id && msg?.message_id) {
    await (bot.api as any).editMessageText(String(msg.chat.id), msg.message_id, view.text, {
      parse_mode: "HTML",
      reply_markup: view.keyboard,
    }).catch(() => {});
  }
});

// ============================================================================
// Help pagination callback
// ============================================================================

onCallback("cmd_page:", async ({ data, ctx, bot, callbackQuery }) => {
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
});

// ============================================================================
// Role keyboard callbacks
// ============================================================================

onCallback("role:", async ({ data, ctx, runtime, account }) => {
  const source = toSource(account.accountId, ctx);
  const sessionKey = resolveSessionKey(source, runtime.api.config);

  if (data.startsWith("role:set:")) {
    const role = data.slice("role:set:".length).trim();
    const ok = await runtime.api.setSessionRole(sessionKey, role);
    await ctx.answerCallbackQuery?.({ text: ok ? `Switched: ${role}` : "Switch failed" });
    if (ok) {
      await ctx.reply(`✅ Role switched to: <b>${role}</b>`, { parse_mode: "HTML" });
    }
    return;
  }

  if (data.startsWith("role:del:")) {
    const role = data.slice("role:del:".length).trim();
    const deleted = await runtime.api.deleteRole(role);
    await ctx.answerCallbackQuery?.({ text: deleted.ok ? `Deleted: ${role}` : "Delete failed" });
    if (deleted.ok) {
      await ctx.reply(`🗑 Role deleted: <b>${role}</b>`, { parse_mode: "HTML" });
    } else {
      await ctx.reply(`❌ Failed to delete role <b>${role}</b>: ${deleted.error ?? "unknown error"}`, { parse_mode: "HTML" });
    }
    return;
  }

  if (data === "role:hint:create") {
    await ctx.answerCallbackQuery?.({ text: "Use /role create <name>" });
    await ctx.reply("Use <code>/role create &lt;name&gt;</code> to create role.", { parse_mode: "HTML" });
    return;
  }

  if (data === "role:hint:delete") {
    await ctx.answerCallbackQuery?.({ text: "Use /role delete <name>" });
    await ctx.reply("Use <code>/role delete &lt;name&gt;</code> to delete role.", { parse_mode: "HTML" });
    return;
  }

  await ctx.answerCallbackQuery?.();
});

// ============================================================================
// Skill execution callback
// ============================================================================

onCallback("skill_run:", async ({ data, ctx, bot, runtime, account, callbackQuery }) => {
  const skillName = data.slice("skill_run:".length);
  await ctx.answerCallbackQuery?.({ text: `Running /${skillName}...` });
  const source = toSource(account.accountId, ctx);
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
});

// ============================================================================
// Resume session callbacks
// ============================================================================

const RESUME_PAGE_SIZE = 5;

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

function buildResumeView(
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

// Register all rsm:* prefixes
for (const prefix of ["rsm_pg:", "rsm_see:", "rsm:"]) {
  onCallback(prefix, async ({ data, ctx, bot, runtime, account, callbackQuery }) => {
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
      await ctx.answerCallbackQuery?.();
      await (bot.api as any).editMessageText(chatId, messageId, view.text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: view.rows },
      }).catch(() => {});
      return;
    }

    // Preview
    if (data.startsWith("rsm_see:")) {
      const idx = parseInt(data.slice("rsm_see:".length), 10);
      const target = sessions[idx];
      if (!target) {
        await ctx.answerCallbackQuery?.({ text: "Session not found" });
        return;
      }
      const firstMsg = getFirstUserMessage(runtime.api, target.sessionKey);
      const preview = firstMsg
        ? `💬 <b>First message:</b>\n<blockquote>${escapeHtml(firstMsg)}</blockquote>`
        : `<i>No messages recorded</i>`;
      const msgs = target.messageCount ?? 0;
      const ago = target.lastActivity ? timeSince(target.lastActivity) : "?";
      const text = `<b>Session ${idx + 1}</b>\n<code>${escapeHtml(target.sessionKey)}</code>\n${msgs} msgs · ${ago} ago\n\n${preview}`;
      await ctx.answerCallbackQuery?.();
      await (bot.api as any).editMessageText(chatId, messageId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "▶ Resume", callback_data: `rsm:${idx}` },
            { text: "◀ Back", callback_data: `rsm_pg:${Math.floor(idx / RESUME_PAGE_SIZE) + 1}` },
          ]],
        },
      }).catch(() => {});
      return;
    }

    // Resume
    if (data.startsWith("rsm:")) {
      const idx = parseInt(data.slice("rsm:".length), 10);
      const target = sessions[idx];
      if (!target) {
        await ctx.answerCallbackQuery?.({ text: "Session not found" });
        return;
      }
      if (target.sessionKey === currentKey) {
        await ctx.answerCallbackQuery?.({ text: "Already active" });
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
      } catch { /* RPC not yet bound */ }

      const msgs = target.messageCount ?? 0;
      const ago = target.lastActivity ? timeSince(target.lastActivity) : "?";
      await ctx.answerCallbackQuery?.({ text: "Switched!" });
      await (bot.api as any).editMessageText(
        chatId, messageId,
        `✅ Switched to <code>${escapeHtml(target.sessionKey)}</code>\n<b>Messages:</b> ${msgs}\n<b>Last active:</b> ${ago} ago${extra}`,
        { parse_mode: "HTML" },
      ).catch(() => {});
    }
  });
}

export async function setupTelegramCommands(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime): Promise<void> {
  const bot = account.bot;

  // === 本地命令 ===
  bot.command("new", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    // 获取当前模型信息（reset 前）
    let modelId = "unknown";
    try {
      const rpcState = await runtime.api.getRpcState(sessionKey);
      modelId = (rpcState as RpcState | null)?.model?.id ?? "unknown";
    } catch {
      // ignore errors
    }
    await runtime.api.resetSession(sessionKey);
    await ctx.reply(`Session reset.\n<b>Model:</b> <code>${escapeHtml(modelId)}</code>`, { parse_mode: "HTML" });
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
      const s = stats as SessionStats | null;
      const st = rpcState as RpcState | null;
      const contextWindow = st?.model?.contextWindow ?? 0;
      const inputTokens = s?.tokens?.input ?? 0;
      const fmt = (n: number) => n >= 1_000_000 ? (n/1_000_000).toFixed(1)+"M" : n >= 1_000 ? Math.round(n/1_000)+"k" : String(n);
      const pct = contextWindow > 0 ? ((inputTokens / contextWindow) * 100).toFixed(1) : "?";
      lines.push(`<b>Context:</b> ${pct}% (${fmt(inputTokens)}/${fmt(contextWindow)})`);
      lines.push(`<b>Model:</b> ${st?.model?.id ?? "unknown"}`);
    } catch {
      // Ignore RPC errors - session state already shown above
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

    const s = stats as SessionStats;
    const st = state as RpcState;
    const contextWindow = st.model?.contextWindow ?? 0;
    const totalTokens = s.tokens?.total ?? 0;
    const inputTokens = s.tokens?.input ?? 0;
    const outputTokens = s.tokens?.output ?? 0;
    const cacheRead = s.tokens?.cacheRead ?? 0;
    const cacheWrite = s.tokens?.cacheWrite ?? 0;

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
      `<b>Messages:</b> ${s.totalMessages ?? 0} (👤${s.userMessages ?? 0} 🤖${s.assistantMessages ?? 0} 🔧${s.toolResults ?? 0})`,
      `<b>Tool Calls:</b> ${s.toolCalls ?? 0}`,
      `<b>Model:</b> ${st.model?.id ?? "unknown"}`,
      `<b>Thinking:</b> ${st.thinkingLevel ?? "off"}`,
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

  bot.command("think", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    const arg = String(ctx.match ?? "").trim().toLowerCase();
    const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

    if (!arg) {
      // No arg → cycle to next level
      try {
        const result = await runtime.api.cycleThinkingLevel(sessionKey) as any;
        await ctx.reply(`Thinking: <b>${result?.level ?? "unchanged"}</b>`, { parse_mode: "HTML" });
      } catch {
        await ctx.reply("No active session. Send a message first.");
      }
      return;
    }

    if (!LEVELS.includes(arg)) {
      await ctx.reply(`Invalid level. Use: ${LEVELS.join(", ")}`);
      return;
    }

    try {
      await runtime.api.setThinkingLevel(sessionKey, arg);
      await ctx.reply(`Thinking set to: <b>${arg}</b>`, { parse_mode: "HTML" });
    } catch {
      await ctx.reply("No active session. Send a message first.");
    }
  });

  bot.command("compact", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    const instructions = String(ctx.match ?? "").trim() || undefined;

    try {
      await ctx.reply("⏳ Compacting…");
      await runtime.api.compactSession(sessionKey, instructions);
      await ctx.reply("✅ Context compacted.");
    } catch (err: any) {
      await ctx.reply(`Compact failed: ${err?.message ?? String(err)}`);
    }
  });

  bot.command("whoami", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const lines = [
      `<b>Sender ID:</b> <code>${escapeHtml(source.senderId)}</code>`,
      `<b>Name:</b> ${escapeHtml(source.senderName ?? "unknown")}`,
      `<b>Chat:</b> <code>${escapeHtml(source.chatId)}</code> (${source.chatType})`,
      `<b>Account:</b> ${escapeHtml(account.accountId)}`,
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // --- /bash: execute shell on gateway host (authorized senders only) ---
  bot.command("bash", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    if (!isAuthorizedSender(source.senderId, account)) {
      await ctx.reply("⛔ Unauthorized.");
      return;
    }
    const cmd = String(ctx.match ?? "").trim();
    if (!cmd) {
      await ctx.reply("Usage: /bash <command>");
      return;
    }
    await executeBashCommand(ctx, cmd, runtime, account.accountId);
  });

  // --- /config: read-only config viewer ---
  bot.command("config", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    if (!isAuthorizedSender(source.senderId, account)) {
      await ctx.reply("⛔ Unauthorized.");
      return;
    }
    const path = String(ctx.match ?? "").trim();
    const config = runtime.api.config;

    if (!path) {
      const sections = Object.keys(config).sort();
      const lines = [
        "<b>⚙️ Config Sections</b>",
        "",
        ...sections.map((s) => `• <code>${escapeHtml(s)}</code>`),
        "",
        "Usage: <code>/config &lt;section&gt;</code>",
      ];
      await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
      return;
    }

    const value = getConfigPath(config, path);
    if (value === undefined) {
      await ctx.reply(`Not found: <code>${escapeHtml(path)}</code>`, { parse_mode: "HTML" });
      return;
    }

    const json = JSON.stringify(value, redactSensitive, 2);
    const truncated = json.length > 3800 ? json.slice(0, 3800) + "\n…(truncated)" : json;
    await ctx.reply(`<b>${escapeHtml(path)}</b>\n<pre>${escapeHtml(truncated)}</pre>`, { parse_mode: "HTML" });
  });

  // --- /restart: restart gateway process ---
  bot.command("restart", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    if (!isAuthorizedSender(source.senderId, account)) {
      await ctx.reply("⛔ Unauthorized.");
      return;
    }
    if (!runtime.api.config.gateway.commands?.restart) {
      await ctx.reply("⚠️ /restart is disabled. Set <code>gateway.commands.restart: true</code> to enable.", { parse_mode: "HTML" });
      return;
    }
    await ctx.reply("⚙️ Restarting gateway…");
    // Give Telegram time to deliver the reply before exiting
    setTimeout(() => {
      runtime.api.logger.info("[restart] Gateway restart triggered via /restart command");
      process.kill(process.pid, "SIGUSR1");
      // Fallback: if SIGUSR1 doesn't restart (no supervisor), exit after 2s
      setTimeout(() => process.exit(0), 2000);
    }, 500);
  });

  bot.command("sys", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    if (!isAuthorizedSender(source.senderId, account)) {
      await ctx.reply("⛔ Unauthorized.");
      return;
    }
    const info = await collectSysInfo();
    await ctx.reply(info, { parse_mode: "HTML" });
  });

  bot.command("refresh", async (ctx: any) => {
    const count = await refreshPiCommands(account, runtime.api.config);
    await ctx.reply(`Commands refreshed. ${LOCAL_COMMANDS.length} local + ${count} pi commands registered.`);
  });

  bot.command("reload_session", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    const rpc = runtime.api.rpcPool?.getForSession(sessionKey);
    if (!rpc) {
      await ctx.reply("⚠️ No active RPC session. Send a message first.");
      return;
    }
    try {
      await ctx.reply("⏳ Reloading agent runtime (extensions, skills, prompts, themes)…");
      // pi RPC: send /reload as prompt — triggers native reload mechanism
      await rpc.prompt("/reload");
      await rpc.waitForIdle(30_000);
      await ctx.reply("✅ Agent runtime reloaded.");
    } catch (err: any) {
      await ctx.reply(`❌ Reload failed: ${err?.message ?? String(err)}`);
    }
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

  bot.command("sessions", async (ctx: any) => {
    const sessions = runtime.api.listSessions();
    if (sessions.length === 0) {
      await ctx.reply("No active sessions.");
      return;
    }
    const source = toSource(account.accountId, ctx as TelegramContext);
    const currentKey = resolveSessionKey(source, runtime.api.config);
    const top = sessions.slice(0, 10);
    const lines = top.map((s: any, i: number) => {
      const active = s.sessionKey === currentKey ? " ✅" : "";
      const msgs = s.messageCount ?? 0;
      const ago = s.lastActivity ? timeSince(s.lastActivity) : "?";
      return `<b>${i + 1}.</b> <code>${escapeHtml(s.sessionKey)}</code>${active}\n   ${msgs} msgs · ${ago} ago`;
    });
    await ctx.reply(
      `<b>Sessions (${sessions.length})</b>\n\n${lines.join("\n\n")}`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("concise", async (ctx: any) => {
    const source = toSource(account.accountId, ctx as TelegramContext);
    const sessionKey = resolveSessionKey(source, runtime.api.config);
    const arg = String(ctx.match ?? "").trim().toLowerCase();

    const manager = getConciseStateManager();
    const configDefault = getConciseConfigDefault();

    if (arg === "on") {
      manager?.setSessionOverride(sessionKey, true);
      await ctx.reply("✅ Concise mode: <b>ON</b> (session override)", { parse_mode: "HTML" });
      return;
    }
    if (arg === "off") {
      manager?.setSessionOverride(sessionKey, false);
      await ctx.reply("⭕ Concise mode: <b>OFF</b> (session override)", { parse_mode: "HTML" });
      return;
    }
    if (arg === "reset") {
      manager?.clearSessionOverride(sessionKey);
      const newEffective = manager?.getEffectiveState(sessionKey, configDefault) ?? configDefault;
      await ctx.reply(`🔄 Concise mode: <b>${newEffective ? "ON" : "OFF"}</b> (config default)`, { parse_mode: "HTML" });
      return;
    }
    if (arg === "status") {
      const effective = manager?.getEffectiveState(sessionKey, configDefault) ?? configDefault;
      const override = manager?.getSessionOverride(sessionKey);
      const src = override !== undefined ? "session override" : "config default";
      await ctx.reply(`Concise mode: <b>${effective ? "ON" : "OFF"}</b> (${src})`, { parse_mode: "HTML" });
      return;
    }

    // Default: show status + inline keyboard
    const view = buildConciseView(sessionKey);
    await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
  });

  bot.command("resume", async (ctx: any) => {
    const arg = String(ctx.match ?? "").trim();
    const sessions = runtime.api.listSessions();
    const source = toSource(account.accountId, ctx as TelegramContext);
    const currentKey = resolveSessionKey(source, runtime.api.config);

    // Direct resume by number or key (backward compat)
    if (arg) {
      const idx = parseInt(arg, 10);
      let target: any = null;
      if (!isNaN(idx) && idx >= 1 && idx <= sessions.length) {
        target = sessions[idx - 1];
      } else {
        target = sessions.find((s: any) => s.sessionKey === arg);
      }
      if (!target) {
        await ctx.reply(`Session not found: ${escapeHtml(arg)}`, { parse_mode: "HTML" });
        return;
      }
      if (target.sessionKey === currentKey) {
        await ctx.reply("Already on this session.");
        return;
      }
      runtime.api.releaseSession(currentKey);
      const msgs = target.messageCount ?? 0;
      const ago = target.lastActivity ? timeSince(target.lastActivity) : "?";
      await ctx.reply(
        `✅ Switched to <code>${escapeHtml(target.sessionKey)}</code>\n<b>Messages:</b> ${msgs} · ${ago} ago`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // No arg — show interactive keyboard
    if (sessions.length === 0) {
      await ctx.reply("No sessions to resume.");
      return;
    }

    const view = buildResumeView(sessions, currentKey, 1);
    await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: { inline_keyboard: view.rows } });
  });

  // /model + callback_query:data → model-selector.ts
  registerModelCommand(bot, runtime, account);
  registerCallbackHandler(bot, runtime, account);

  // 初始化时尝试获取 pi 命令，如果 RPC 还没连接则只注册本地命令
  // 用户可以稍后用 /refresh 手动刷新
  await refreshPiCommands(account, runtime.api.config);
}
