/**
 * WeChat slash commands.
 *
 * Aligned with @tencent-weixin/openclaw-weixin src/messaging/slash-commands.ts.
 *
 * Only WeChat-private commands are handled here. Generic /xxx commands must
 * fall through to the gateway/pi command pipeline.
 */

import type { WechatAccountRuntime } from "./types.ts";
import { getBuiltinCommandCatalog } from "../../../gateway/command-catalog.ts";
import { getSessionStatus } from "./session.ts";
import { logger } from "./logger.ts";
import { toggleWechatDebugMode } from "./debug-mode.ts";

/**
 * Slash command handler context.
 */
export interface SlashCommandContext {
  accountId: string;
  to: string;
  contextToken?: string;
  baseUrl: string;
  token?: string;
  send: (text: string) => Promise<void>;
  log: (msg: string) => void;
  errLog: (msg: string) => void;
  isDebug: () => boolean;
  toggleDebug: () => void;
  getStatus: () => SlashCommandStatus;
  /** 消息接收时间戳（毫秒） */
  receivedAt?: number;
}

/**
 * Slash command status.
 */
export interface SlashCommandStatus {
  accountId: string;
  connected: boolean;
  lastInboundAt?: number;
  lastOutboundAt?: number;
  lastError?: string;
  contextTokensSize: number;
  dedupSize: number;
  syncBufSize: number;
  sessionPaused: boolean;
  sessionExpired: boolean;
  sessionExpiryCount: number;
  sessionPauseRemaining?: number;
}

/**
 * Slash command definition.
 */
export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  handler: (args: string[], ctx: SlashCommandContext) => Promise<void>;
}

const DOLLAR_COMMAND_ALIASES = new Map<string, string>([
  ["帮助", "help"],
  ["新建", "new"],
  ["新会话", "new"],
  ["停止", "stop"],
  ["中断", "stop"],
  ["模型", "model"],
  ["模型列表", "models"],
  ["切模型", "setmodel"],
  ["思考", "think"],
  ["压缩", "compact"],
  ["上下文", "context"],
  ["状态", "status"],
  ["队列", "queue"],
  ["身份", "whoami"],
  ["角色", "role"],
  ["定时", "cron"],
  ["技能", "skills"],
  ["会话", "sessions"],
  ["恢复", "resume"],
  ["简洁", "concise"],
  ["刷新", "refresh"],
  ["重载", "reload_session"],
  ["系统", "sys"],
  ["配置", "config"],
  ["重启", "restart"],
]);

function buildWechatHelpText(): string {
  const sections = [
    "微信命令用法",
    "",
    "在微信里推荐用 $ 触发命令，效果等同 Telegram 的 / 命令。",
    "",
    "常用示例:",
    "$help - 查看这份说明",
    "$new - 新建/重置当前会话",
    "$压缩 - 压缩当前上下文，等同 /compact",
    "$status - 查看当前会话状态",
    "$model provider/model - 切换模型",
    "$role list - 查看角色",
    "$cron list - 查看定时任务",
    "",
    "Telegram 命令替换规则:",
    "把 /xxx 改成 $xxx 即可，例如 /new -> $new、/model -> $model。",
    "中文别名也可用，例如 $压缩、$模型、$状态、$角色。",
    "",
    "可用核心命令:",
  ];

  for (const cmd of getBuiltinCommandCatalog()) {
    const usage = cmd.supportsArgs ? `$${cmd.name} ...` : `$${cmd.name}`;
    sections.push(`${usage} - ${cmd.description}`);
  }

  sections.push(
    "",
    "微信本地诊断:",
    "/wechat-status - 查看微信连接状态",
    "/echo hello - 回显并显示通道耗时",
    "/toggle-debug - 切换微信调试模式",
  );

  return sections.join("\n");
}

export function normalizeWechatCommandText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("$")) return text;

  const match = trimmed.match(/^\$([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return text;

  const rawName = match[1] ?? "";
  const args = match[2]?.trim() ?? "";
  const lowerName = rawName.toLowerCase();
  const aliased = DOLLAR_COMMAND_ALIASES.get(lowerName) ?? DOLLAR_COMMAND_ALIASES.get(rawName);
  const commandName = aliased ?? (/^[a-z][a-z0-9._-]*$/i.test(rawName) ? lowerName : "");

  if (!commandName) return text;
  return `/${commandName}${args ? ` ${args}` : ""}`;
}

/**
 * Available slash commands.
 */
const COMMANDS: SlashCommand[] = [
  {
    name: "/help",
    description: "显示微信命令用法",
    handler: async (_args, ctx) => {
      await ctx.send(buildWechatHelpText());
    },
  },
  {
    name: "/echo",
    description: "Echo back arguments（显示调试计时）",
    handler: async (args, ctx) => {
      const message = args.join(" ").trim();
      if (message) {
        await ctx.send(message);
      }
      const receivedAt = ctx.receivedAt ?? 0;
      const lines = [
        "⏱ 通道耗时",
        `├ 接收时间: ${receivedAt > 0 ? new Date(receivedAt).toISOString() : "N/A"}`,
        `└ 处理耗时: ${receivedAt > 0 ? `${Date.now() - receivedAt}ms` : "N/A"}`,
      ];
      await ctx.send(lines.join("\n"));
    },
  },
  {
    name: "/toggle-debug",
    description: "切换调试模式",
    handler: async (args, ctx) => {
      const enabled = toggleWechatDebugMode(ctx.accountId);
      await ctx.send(enabled ? "🔧 Debug 模式已开启" : "🔧 Debug 模式已关闭");
    },
  },
  {
    name: "/wechat-help",
    description: "显示微信通道本地命令",
    handler: async (_args, ctx) => {
      await ctx.send(buildWechatHelpText());
    },
  },
  {
    name: "/wechat-status",
    description: "显示微信连接状态",
    handler: async (args, ctx) => {
      const status = ctx.getStatus();
      const lines = [
        "📊 WeChat Bot 状态:",
        "",
        `账号 ID: ${status.accountId}`,
        `连接状态: ${status.connected ? "✅ 已连接" : "❌ 未连接"}`,
        `上下文缓存: ${status.contextTokensSize} 条`,
        `消息去重: ${status.dedupSize} 条`,
        `同步游标: ${status.syncBufSize} 字符`,
      ];

      if (status.sessionExpired) {
        lines.push(`会话状态: ❌ 已失效，请重新扫码登录`);
      } else if (status.sessionPaused) {
        const remaining = status.sessionPauseRemaining
          ? Math.ceil(status.sessionPauseRemaining / 1000)
          : "未知";
        lines.push(`会话状态: ⏸️ 退避中 (${remaining}s)`);
      } else {
        lines.push(`会话状态: ✅ 活跃`);
      }

      lines.push(`超时次数: ${status.sessionExpiryCount}`);

      if (status.lastInboundAt) {
        const inbound = new Date(status.lastInboundAt).toLocaleString("zh-CN");
        lines.push(`最后收到的消息: ${inbound}`);
      }

      if (status.lastOutboundAt) {
        const outbound = new Date(status.lastOutboundAt).toLocaleString("zh-CN");
        lines.push(`最后发送的消息: ${outbound}`);
      }

      if (status.lastError) {
        lines.push(`最后错误: ${status.lastError}`);
      }

      await ctx.send(lines.join("\n"));
    },
  },
  {
    name: "/wechat-debug",
    description: "切换微信通道调试模式",
    handler: async (args, ctx) => {
      ctx.toggleDebug();
      const isDebug = ctx.isDebug();
      await ctx.send(`🔧 调试模式: ${isDebug ? "✅ 开启" : "❌ 关闭"}`);
    },
  },
  {
    name: "/wechat-clear",
    description: "清除微信对话历史提示",
    handler: async (args, ctx) => {
      await ctx.send(
        "💡 清除对话历史:\n" +
        "由于微信不支持消息删除，无法真正清除对话历史。\n" +
        "你可以手动删除微信聊天记录来清除历史。"
      );
    },
  },
  {
    name: "/wechat-ping",
    description: "测试微信通道连接",
    handler: async (args, ctx) => {
      const start = Date.now();
      await ctx.send("🏓 Pong!");
      const elapsed = Date.now() - start;
      await ctx.send(`响应时间: ${elapsed}ms`);
    },
  },
  {
    name: "/wechat-version",
    description: "显示微信插件版本信息",
    handler: async (args, ctx) => {
      await ctx.send(
        "📦 WeChat Plugin for pi-gateway\n" +
        "版本: 1.0.0\n" +
        "协议: ilink API (HTTP long-poll)\n" +
        "功能: 私聊消息收发、媒体加密传输"
      );
    },
  },
];

/**
 * Handle a slash command.
 * Returns true if the command was handled, false otherwise.
 */
export async function handleSlashCommand(
  text: string,
  ctx: SlashCommandContext
): Promise<{ handled: boolean }> {
  const normalizedText = normalizeWechatCommandText(text);
  const trimmed = normalizedText.trim();
  
  // Check if it's a slash command
  if (!trimmed.startsWith("/")) {
    return { handled: false };
  }

  // Parse command and arguments
  const parts = trimmed.split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Find the command
  const cmd = COMMANDS.find((c) => c.name === cmdName);
  if (!cmd) {
    // Let gateway/pi handle global commands such as /help, /status, /new, /model, /role.
    return { handled: false };
  }

  // Execute the command
  try {
    await cmd.handler(args, ctx);
    ctx.log(`[wechat:cmd] executed ${cmdName}`);
  } catch (err) {
    ctx.errLog(`[wechat:cmd] error executing ${cmdName}: ${String(err)}`);
    await ctx.send(`❌ 命令执行失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { handled: true };
}

/**
 * Check if text starts with a slash command.
 */
export function isSlashCommand(text: string): boolean {
  const trimmed = normalizeWechatCommandText(text).trim();
  if (!trimmed.startsWith("/")) return false;
  
  const cmdName = trimmed.split(/\s+/)[0].toLowerCase();
  return COMMANDS.some((c) => c.name === cmdName);
}

/**
 * Get list of available command names.
 */
export function getCommandNames(): string[] {
  return COMMANDS.map((c) => c.name);
}

/**
 * Build slash command context from account runtime.
 */
export function buildSlashCommandContext(
  runtime: WechatAccountRuntime,
  to: string,
  contextToken: string | undefined,
  send: (text: string) => Promise<void>,
  receivedAt?: number
): SlashCommandContext {
  let debugMode = false;

  return {
    accountId: runtime.accountId,
    to,
    contextToken,
    baseUrl: runtime.baseUrl,
    token: runtime.token,
    send,
    log: (msg) => logger.debug(msg),
    errLog: (msg) => logger.error(msg),
    isDebug: () => debugMode,
    toggleDebug: () => {
      debugMode = !debugMode;
    },
    getStatus: () => {
      const session = getSessionStatus(runtime.accountId);
      return {
        accountId: runtime.accountId,
        connected: !!runtime.token && !session.expired,
        lastInboundAt: runtime.lastInboundAt,
        lastOutboundAt: runtime.lastOutboundAt,
        lastError: runtime.lastError,
        contextTokensSize: runtime.contextTokens.size,
        dedupSize: runtime.dedup.size,
        syncBufSize: runtime.syncBuf.length,
        sessionPaused: session.paused,
        sessionExpired: session.expired,
        sessionExpiryCount: session.expiryCount,
        sessionPauseRemaining: session.remainingPauseMs,
      };
    },
    receivedAt,
  };
}
