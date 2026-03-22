/**
 * 启动问候
 * Gateway 连接成功后发送通知给管理员
 */
import type { QqbotPluginRuntime } from "./types.ts";
import { sendQqbotText } from "./outbound.ts";

interface GreetingRecord {
  lastVersion?: string;
  lastNotifyAt?: number;
}

/**
 * Gateway READY 后调用，检查是否需要发送版本升级通知
 * 通知发送后记录版本号，防止每次启动都重复通知
 */
export function checkStartupGreeting(runtime: QqbotPluginRuntime): void {
  const now = Date.now();
  const VERSION = getPluginVersion();
  const NOTIFY_COOLDOWN = 24 * 60 * 60 * 1000; // 24h 内不重复通知

  try {
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = require("node:fs");
    const { join } = require("node:path");
    const { homedir } = require("node:os");
    const dir = join(homedir(), ".pi", "agent", "qqbot-credentials");
    const file = join(dir, "greeting-state.json");

    let record: GreetingRecord = {};
    if (existsSync(file)) {
      try { record = JSON.parse(readFileSync(file, "utf-8")); } catch {}
    }

    // 版本变更时通知，或距离上次通知超过 24h
    const versionChanged = record.lastVersion && record.lastVersion !== VERSION;
    const overdue = !record.lastNotifyAt || now - record.lastNotifyAt > NOTIFY_COOLDOWN;

    if (versionChanged || overdue) {
      record.lastVersion = VERSION;
      record.lastNotifyAt = now;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(record), "utf-8");
      // 异步发送通知，不阻塞启动
      sendStartupMessage(runtime).catch(() => {});
    }
  } catch {
    // 非关键，静默忽略
  }
}

async function sendStartupMessage(runtime: QqbotPluginRuntime): Promise<void> {
  const VERSION = getPluginVersion();
  // pi-gateway 使用 allowFrom 列表作为管理员白名单
  const admins = runtime.channelCfg.allowFrom ?? [];
  if (admins.length === 0) return;

  const msg = [
    `✅ pi-gateway QQBot 已连接`,
    `📦 版本: v${VERSION}`,
    `🤖 BotID: ${runtime.botId ?? "unknown"}`,
    `⏰ ${new Date().toLocaleString("zh-CN")}`,
  ].join("\n");

  for (const adminId of admins) {
    try {
      await sendQqbotText(runtime, `c2c|${adminId}`, msg);
    } catch {
      // ignore individual failures
    }
  }
}

function getPluginVersion(): string {
  try {
    const { existsSync, readFileSync } = require("node:fs");
    const { resolve, dirname } = require("node:path");
    const pkgPath = resolve(dirname(dirname(dirname(dirname(import.meta.url)))), "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return pkg.version ?? "0.1.0";
    }
  } catch {}
  return "0.1.0";
}
