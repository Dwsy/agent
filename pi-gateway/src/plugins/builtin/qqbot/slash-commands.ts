/**
 * QQBot 斜杠指令处理器
 *
 * 设计原则：
 * 1. 在消息 dispatch 前拦截，匹配到内置指令后直接回复，不进入 AI 处理队列
 * 2. 每个指令通过 SlashCommand 接口注册，易于扩展
 *
 * 指令列表：
 *   /bot-ping    — 测试延迟
 *   /bot-version — 查看版本
 *   /bot-help    — 查看帮助
 *   /bot-logs    — 导出日志
 */
import type { QqbotPluginRuntime } from "./types.ts";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { getUpdateInfo } from "./utils/update-checker.ts";

/** 斜杠指令上下文 */
export interface SlashCommandContext {
  runtime: QqbotPluginRuntime;
  /** 编码后的目标标识（如 "c2c|user-1"） */
  target: string;
  /** 原始消息内容 */
  rawContent: string;
  /** 指令参数（去掉指令名后的部分） */
  args: string;
  /** 插件收到消息的时间戳（ms） */
  receivedAt: number;
  /** 发送者 ID */
  senderId: string;
  /** 发送者昵称 */
  senderName?: string;
  /** 消息 ID */
  messageId: string;
  /** 会话类型 */
  chatType: string;
}

/** 斜杠指令返回值 */
export type SlashCommandResult = string | { text: string; logFilePath?: string } | null;

/** 斜杠指令定义 */
export interface SlashCommand {
  name: string;
  description: string;
  descriptionZh: string;
  /** 详细用法说明（用于 /指令 ? 查询） */
  usage?: string;
  handler: (ctx: SlashCommandContext) => SlashCommandResult | Promise<SlashCommandResult>;
}

/** 内置指令列表 */
const COMMANDS: SlashCommand[] = [
  {
    name: "bot-ping",
    description: "Test bot latency",
    descriptionZh: "测试机器人延迟",
    usage: "/bot-ping\n\n测试 pi-gateway 与 QQ 服务器之间的网络延迟。",
    handler: async (ctx) => {
      const now = Date.now();
      const elapsed = now - ctx.receivedAt;
      return [
        `🏓 Pong!`,
        ``,
        `⏱ 响应延迟: ${elapsed}ms`,
        `📨 消息ID: ${ctx.messageId.slice(0, 16)}...`,
      ].join("\n");
    },
  },
  {
    name: "bot-version",
    description: "Show bot version and update info",
    descriptionZh: "显示版本信息",
    usage: "/bot-version\n\n查看 pi-gateway qqbot 插件版本和更新信息。",
    handler: async () => {
      const version = getPluginVersion();
      const lines = [
        `📦 pi-gateway QQBot 插件`,
        `   版本: v${version}`,
        ``,
        `🌟 GitHub: https://github.com/tencent-connect/openclaw-qqbot`,
      ];
      try {
        const info = await getUpdateInfo();
        if (info.checkedAt === 0) {
          lines.push(`⏳ 版本检查中...`);
        } else if (info.error) {
          lines.push(`⚠️ 版本检查失败`);
        } else if (info.hasUpdate && info.latest) {
          lines.push(`🆕 最新版本: v${info.latest}`);
        } else {
          lines.push(`✅ 当前已是最新版本`);
        }
      } catch {
        lines.push(`⚠️ 版本检查失败`);
      }
      return lines.join("\n");
    },
  },
  {
    name: "bot-help",
    description: "Show available commands",
    descriptionZh: "显示可用命令",
    usage: "/bot-help\n\n列出所有可用的内置指令及其说明。",
    handler: async () => {
      const lines = [`**📖 QQBot 内置指令**`, ``];
      for (const cmd of COMMANDS) {
        lines.push(`• \`/${cmd.name}\` — ${cmd.descriptionZh}`);
      }
      lines.push(``, `> 版本 ${getPluginVersion()} | 直接发送消息与我对话~`);
      return lines.join("\n");
    },
  },
  {
    name: "bot-logs",
    description: "Export recent log entries",
    descriptionZh: "导出最近日志",
    usage: "/bot-logs\n\n导出 pi-gateway 最近日志（最多 200 行）。",
    handler: async () => {
      const candidates = collectLogFiles();
      if (candidates.length === 0) {
        return `⚠️ 未找到日志文件`;
      }

      const MAX_LINES = 200;
      const lines: string[] = [];
      let totalIncluded = 0;

      for (const filePath of candidates.slice(0, 3)) {
        try {
          const content = readFileSync(filePath, "utf-8");
          const allLines = content.split("\n");
          const tail = allLines.slice(-MAX_LINES);
          lines.push(`\n========== ${filePath.split("/").pop()} ==========`);
          lines.push(...tail);
          totalIncluded += tail.length;
        } catch {
          lines.push(`[读取失败: ${filePath}]`);
        }
      }

      if (lines.length === 0) return `⚠️ 日志文件读取失败`;

      const text = [
        `📋 导出 ${totalIncluded} 行日志（最近 ${MAX_LINES} 条/文件）`,
        `来源: ${candidates.slice(0, 3).map(f => f.split("/").pop()).join(" | ")}`,
        ``,
        ...lines,
      ].join("\n");

      return { text: text.slice(0, 4000), logFilePath: undefined };
    },
  },
];

/** 收集候选日志文件 */
function collectLogFiles(): string[] {
  const candidates: Array<{ path: string; mtime: number }> = [];
  const LOG_NAME_PATTERN = /gateway|pi|agent|error/i;
  const LOG_EXT_PATTERN = /\.(log|txt)$/i;

  const searchRoots = [
    join(homedir(), ".pi", "agent", "logs"),
    join(homedir(), ".pi", "gateway", "logs"),
    "/tmp/pi-gateway",
    "/tmp/pi-agent",
    process.cwd(),
  ];

  for (const root of searchRoots) {
    if (!existsSync(root)) continue;
    try {
      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!LOG_EXT_PATTERN.test(entry.name)) continue;
        if (!LOG_NAME_PATTERN.test(entry.name)) continue;
        try {
          const fullPath = join(root, entry.name);
          const mtime = statSync(fullPath).mtimeMs;
          candidates.push({ path: fullPath, mtime });
        } catch {}
      }
    } catch {}
  }

  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates.map(c => c.path);
}

/** 获取插件版本号 */
export function getPluginVersion(): string {
  try {
    const pkgPath = resolve(dirname(dirname(dirname(dirname(import.meta.url)))), "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return pkg.version ?? "0.1.0";
    }
  } catch {}
  return "0.1.0";
}

/**
 * 尝试匹配并执行内置斜杠指令
 * @returns 回复文本，或 null（不匹配，应入队正常处理）
 */
export async function matchSlashCommandEx(ctx: SlashCommandContext): Promise<SlashCommandResult> {
  const content = ctx.rawContent.trim();
  if (!content.startsWith("/")) return null;

  const spaceIdx = content.indexOf(" ");
  const cmdName = (spaceIdx === -1 ? content.slice(1) : content.slice(1, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : content.slice(spaceIdx + 1).trim();

  const cmd = COMMANDS.find(c => c.name === cmdName);
  if (!cmd) return null;

  // /指令 ? → 返回用法说明
  if (args === "?") {
    return cmd.usage ?? `/${cmd.name} — ${cmd.descriptionZh}`;
  }

  ctx.args = args;
  return cmd.handler(ctx);
}

/** 获取内置指令数量 */
export function getCommandCount(): number {
  return COMMANDS.length;
}
