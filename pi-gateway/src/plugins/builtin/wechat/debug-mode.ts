/**
 * Per-account debug mode toggle, persisted to disk so it survives gateway restarts.
 *
 * State file: `<stateDir>/wechat/debug-mode.json`
 * Format:     `{ "accounts": { "<accountId>": true, ... } }`
 *
 * When enabled, processOneMessage appends a timing summary after each
 * AI reply is delivered to the user.
 */
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { logger } from "./logger.ts";

interface DebugModeState {
  accounts: Record<string, boolean>;
}

function resolveStateDir(): string {
  const envDir = process.env.PI_STATE_DIR?.trim();
  if (envDir) return envDir;
  return path.join(homedir(), ".pi", "state");
}

function resolveDebugModePath(): string {
  return path.join(resolveStateDir(), "wechat", "debug-mode.json");
}

function loadState(): DebugModeState {
  try {
    const filePath = resolveDebugModePath();
    if (!fs.existsSync(filePath)) return { accounts: {} };
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as DebugModeState;
    if (parsed && typeof parsed.accounts === "object") return parsed;
  } catch {
    // missing or corrupt — start fresh
  }
  return { accounts: {} };
}

function saveState(state: DebugModeState): void {
  const filePath = resolveDebugModePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    logger.error(`debug-mode: failed to persist state: ${String(err)}`);
  }
}

/** Toggle debug mode for a bot account. Returns the new state. */
export function toggleWechatDebugMode(accountId: string): boolean {
  const state = loadState();
  const next = !state.accounts[accountId];
  state.accounts[accountId] = next;
  saveState(state);
  return next;
}

/** Check whether debug mode is active for a bot account. */
export function isWechatDebugMode(accountId: string): boolean {
  return loadState().accounts[accountId] === true;
}
