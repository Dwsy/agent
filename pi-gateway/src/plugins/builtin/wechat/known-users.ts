/**
 * 已知用户存储 — WeChat
 *
 * 记录与机器人交互过的所有用户（openid + accountId），
 * 支持主动消息和用户管理功能。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface WechatKnownUser {
  openid: string;
  /** 消息类型：私聊用户 / 群组 */
  type: "c2c" | "group";
  /** 用户昵称 */
  nickname?: string;
  /** 群组 openid（群聊时） */
  groupOpenid?: string;
  /** 关联的机器人账户 ID */
  accountId: string;
  /** 首次交互时间戳 */
  firstSeenAt: number;
  /** 最后交互时间戳 */
  lastSeenAt: number;
  /** 交互次数 */
  interactionCount: number;
}

interface UsersStore {
  users: WechatKnownUser[];
  version: number;
}

const STORE_FILE = join(homedir(), ".pi", "agent", "wechat-credentials", "known-users.json");
const STORE_VERSION = 1;
const MAX_USERS = 5000;

let cache: Map<string, WechatKnownUser> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isDirty = false;

function makeKey(user: WechatKnownUser): string {
  const parts = [user.accountId, user.type, user.openid];
  if (user.groupOpenid) parts.push(user.groupOpenid);
  return parts.join("|");
}

function ensureDir(): void {
  const dir = join(homedir(), ".pi", "agent", "wechat-credentials");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadCache(): Map<string, WechatKnownUser> {
  if (cache !== null) return cache;
  cache = new Map();

  try {
    if (existsSync(STORE_FILE)) {
      const data = readFileSync(STORE_FILE, "utf-8");
      const store = JSON.parse(data) as UsersStore;
      for (const user of store.users) {
        cache.set(makeKey(user), user);
      }
    }
  } catch {}

  return cache;
}

function scheduleSave(): void {
  if (saveTimer) return;
  isDirty = true;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (isDirty) persistToDisk();
  }, 5000);
}

function persistToDisk(): void {
  isDirty = false;
  try {
    ensureDir();
    const users = Array.from(loadCache().values());
    const store: UsersStore = { users, version: STORE_VERSION };
    writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

/**
 * 记录用户交互（入站消息时调用）
 */
export function recordWechatUser(
  openid: string,
  type: "c2c" | "group",
  accountId: string,
  nickname?: string,
  groupOpenid?: string,
): void {
  const map = loadCache();
  const user: WechatKnownUser = {
    openid,
    type,
    accountId,
    nickname,
    groupOpenid,
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    interactionCount: 1,
  };
  const key = makeKey(user);
  const existing = map.get(key);
  if (existing) {
    existing.lastSeenAt = Date.now();
    existing.interactionCount += 1;
    if (nickname && !existing.nickname) existing.nickname = nickname;
    map.set(key, existing);
  } else {
    if (map.size >= MAX_USERS) {
      let oldest: WechatKnownUser | null = null;
      for (const u of map.values()) {
        if (!oldest || u.lastSeenAt < oldest.lastSeenAt) oldest = u;
      }
      if (oldest) map.delete(makeKey(oldest));
    }
    map.set(key, user);
  }
  scheduleSave();
}

/**
 * 获取已知用户列表
 */
export function getWechatKnownUsers(accountId?: string): WechatKnownUser[] {
  const map = loadCache();
  const users = Array.from(map.values());
  if (accountId) return users.filter(u => u.accountId === accountId);
  return users;
}

/**
 * 获取用户数
 */
export function getWechatKnownUserCount(accountId?: string): number {
  return getWechatKnownUsers(accountId).length;
}

/**
 * 强制立即保存（用于进程退出前）
 */
export function flushWechatKnownUsers(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (isDirty) persistToDisk();
}
