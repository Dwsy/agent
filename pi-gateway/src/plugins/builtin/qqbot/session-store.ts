/**
 * Session 持久化存储
 *
 * 将 WebSocket 连接状态（sessionId、lastSeq）持久化到文件，
 * 支持进程重启后通过 Resume 机制快速恢复连接。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SessionState {
  sessionId: string | null;
  lastSeq: number | null;
  lastConnectedAt: number;
  accountId: string;
  appId?: string;
  savedAt: number;
}

const SESSION_DIR = join(homedir(), ".pi", "agent", "qqbot-credentials", "sessions");
const SESSION_EXPIRE_MS = 5 * 60 * 1000; // Resume 要求断开后 5 分钟内恢复

function ensureDir(): void {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function getSessionPath(accountId: string): string {
  const safeId = accountId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(SESSION_DIR, `session-${safeId}.json`);
}

/**
 * 加载 Session 状态
 * @param accountId 账户 ID
 * @param expectedAppId 当前 appId，不匹配时返回 null
 */
export function loadSession(accountId: string, expectedAppId?: string): SessionState | null {
  try {
    ensureDir();
    const path = getSessionPath(accountId);
    if (!existsSync(path)) return null;

    const data = readFileSync(path, "utf-8");
    const state = JSON.parse(data) as SessionState;

    // appId 不匹配 → 视为无效
    if (expectedAppId && state.appId && state.appId !== expectedAppId) {
      return null;
    }

    // Session 过期（超过 5 分钟）
    const age = Date.now() - (state.lastConnectedAt ?? 0);
    if (age > SESSION_EXPIRE_MS) {
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

/**
 * 保存 Session 状态
 */
export function saveSession(state: SessionState): void {
  try {
    ensureDir();
    state.savedAt = Date.now();
    const path = getSessionPath(state.accountId);
    writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

/**
 * 清除 Session 状态
 */
export function clearSession(accountId: string): void {
  try {
    const path = getSessionPath(accountId);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // ignore
  }
}
