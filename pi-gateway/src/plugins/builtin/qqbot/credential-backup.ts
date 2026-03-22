/**
 * 凭证备份与恢复
 * 热更新时插件目录被替换，配置文件中的 appId/secret 可能丢失。
 * 通过独立的备份文件持久化凭证，热更新后自动恢复。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import type { QqbotChannelConfig } from "./types.ts";

const BACKUP_DIR = "qqbot-credentials";
const BACKUP_FILE = "credentials.json";

interface CredentialBackup {
  accountId: string;
  appId: string;
  clientSecret: string;
  savedAt: string;
}

function getBackupPath(): string {
  return `${homedir()}/.pi/agent/${BACKUP_DIR}/${BACKUP_FILE}`;
}

function getBackupDir(): string {
  return `${homedir()}/.pi/agent/${BACKUP_DIR}`;
}

/**
 * 保存凭证到备份文件（gateway 成功连接后调用）
 */
export function saveCredentialBackup(accountId: string, appId: string, clientSecret: string): void {
  if (!appId || !clientSecret) return;
  try {
    const dir = getBackupDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const backup: CredentialBackup = {
      accountId,
      appId,
      clientSecret,
      savedAt: new Date().toISOString(),
    };
    const path = getBackupPath();
    const tmpPath = `${path}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(backup, null, 2), "utf-8");
    renameSync(tmpPath, path); // 原子替换
  } catch {
    // 静默失败，不影响主流程
  }
}

/**
 * 从备份文件恢复凭证
 * 返回 appId 和 clientSecret，或 null（无备份或备份无效）
 */
export function loadCredentialBackup(): { appId: string; clientSecret: string } | null {
  try {
    const path = getBackupPath();
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8").trim();
    if (!content) return null;
    const backup: CredentialBackup = JSON.parse(content);
    if (!backup.appId || !backup.clientSecret) return null;
    return { appId: backup.appId, clientSecret: backup.clientSecret };
  } catch {
    return null;
  }
}

/**
 * 清除备份文件（凭证注销时调用）
 */
export function clearCredentialBackup(): void {
  try {
    const path = getBackupPath();
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // 静默失败
  }
}
