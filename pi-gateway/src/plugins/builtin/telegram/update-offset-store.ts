import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function offsetDir(sessionDataDir: string): string {
  return join(sessionDataDir, "..", "telegram-offsets");
}

function filePath(sessionDataDir: string, accountId: string): string {
  return join(offsetDir(sessionDataDir), `${accountId}.json`);
}

export function readTelegramUpdateOffset(sessionDataDir: string, accountId: string): number | null {
  const path = filePath(sessionDataDir, accountId);
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, "utf-8")) as { updateId?: number };
    return typeof json.updateId === "number" ? json.updateId : null;
  } catch {
    return null;
  }
}

export function writeTelegramUpdateOffset(sessionDataDir: string, accountId: string, updateId: number): void {
  const dir = offsetDir(sessionDataDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = filePath(sessionDataDir, accountId);
  writeFileSync(path, JSON.stringify({ updateId }, null, 2), "utf-8");
}
