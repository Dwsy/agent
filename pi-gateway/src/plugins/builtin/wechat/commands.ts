/**
 * WeChat slash commands.
 *
 * Ported from @tencent-weixin/openclaw-weixin src/messaging/slash-commands.ts
 */

import type { WechatAccountRuntime } from "./types.ts";
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

/**
 * Available slash commands.
 */
const COMMANDS: SlashCommand[] = [
  {
    name: "/help",
    description: "显示帮助信息",
    handler: async (args, ctx) => {
      const lines = ["🤖 WeChat Bot 命令列表:", ""];
      for (const cmd of COMMANDS) {
        lines.push(`${cmd.name} - ${cmd.description}`);
        if (cmd.usage) {
          lines.push(`  用法: ${cmd.usage}`);
        }
      }
      await ctx.send(lines.join("\n"));
    },
  },
  {
    name: "/status",
    description: "显示连接状态",
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
    name: "/debug",
    description: "切换调试模式",
    handler: async (args, ctx) => {
      ctx.toggleDebug();
      const isDebug = ctx.isDebug();
      await ctx.send(`🔧 调试模式: ${isDebug ? "✅ 开启" : "❌ 关闭"}`);
    },
  },
  {
    name: "/clear",
    description: "清除对话历史（提示）",
    handler: async (args, ctx) => {
      await ctx.send(
        "💡 清除对话历史:\n" +
        "由于微信不支持消息删除，无法真正清除对话历史。\n" +
        "你可以手动删除微信聊天记录来清除历史。"
      );
    },
  },
  {
    name: "/ping",
    description: "测试连接",
    handler: async (args, ctx) => {
      const start = Date.now();
      await ctx.send("🏓 Pong!");
      const elapsed = Date.now() - start;
      await ctx.send(`响应时间: ${elapsed}ms`);
    },
  },
  {
    name: "/version",
    description: "显示版本信息",
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
  const trimmed = text.trim();
  
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
    // Not a local WeChat command - let the agent handle pi/global slash commands such as /new
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
  const trimmed = text.trim();
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
