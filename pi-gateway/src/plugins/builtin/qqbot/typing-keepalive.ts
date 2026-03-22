/**
 * 正在输入状态保持器
 *
 * QQ 的 C2C "正在输入..." 通知有约 30s 超时。
 * 对于较长的 AI 响应，在响应开始后定期重发，保持 UI 状态。
 */
import type { QqbotPluginRuntime } from "./types.ts";
import { sendC2CInputNotify } from "./api.ts";

const TYPING_TTL_MS = 30_000; // QQ 输入状态超时约 30s
const TYPING_INTERVAL_MS = 20_000; // 每 20s 重发一次

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 开始保持输入状态（每 20s 重发，直到 stopTypingKeepalive）
 */
export function startTypingKeepalive(runtime: QqbotPluginRuntime, userId: string): void {
  const key = `${userId}`;
  if (activeTimers.has(key)) return; // 已存在，不重复启动

  // 立即发送一次
  sendC2CInputNotify(runtime, userId).catch(() => {});

  const interval = setInterval(() => {
    sendC2CInputNotify(runtime, userId).catch(() => {});
  }, TYPING_INTERVAL_MS);

  activeTimers.set(key, interval);
}

/**
 * 停止保持输入状态
 */
export function stopTypingKeepalive(userId: string): void {
  const key = `${userId}`;
  const timer = activeTimers.get(key);
  if (timer) {
    clearInterval(timer);
    activeTimers.delete(key);
  }
}

/**
 * 停止所有活动的 keepalive 计时器
 */
export function stopAllTypingKeepalives(): void {
  for (const [key, timer] of activeTimers) {
    clearInterval(timer);
    activeTimers.delete(key);
  }
}
