/**
 * Allowlist management for channel access control.
 *
 * Aligned with OpenClaw's DM policy system:
 * - "pairing"   : unknown senders get a code, owner approves
 * - "allowlist"  : only senders in allowFrom can interact
 * - "open"       : anyone can interact (requires allowFrom: ["*"])
 * - "disabled"   : ignore all DMs
 *
 * Storage: ~/.pi/gateway/credentials/{channel}-allowFrom.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CREDENTIALS_DIR = join(homedir(), ".pi", "gateway", "credentials");

// ============================================================================
// Allowlist
// ============================================================================

export type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";

/**
 * Check if a sender is allowed for a channel.
 */
export function isSenderAllowed(
  channel: string,
  senderId: string,
  policy: DmPolicy,
  configAllowFrom?: Array<string | number>,
  accountId?: string,
): boolean {
  switch (policy) {
    case "disabled":
      return false;

    case "open":
      return true;

    case "allowlist": {
      // Check config allowFrom
      const allow = (configAllowFrom ?? []).map((v) => String(v));
      if (allow.includes(senderId) || allow.includes("*")) {
        return true;
      }
      // Check persisted allowlist
      return getPersistedAllowlist(channel, accountId).includes(senderId);
    }

    case "pairing": {
      // Check config allowFrom first
      const allow = (configAllowFrom ?? []).map((v) => String(v));
      if (allow.includes(senderId) || allow.includes("*")) {
        return true;
      }
      // Check approved (persisted) allowlist
      return getPersistedAllowlist(channel, accountId).includes(senderId);
    }

    default:
      return false;
  }
}

/**
 * Add a sender to the persisted allowlist.
 */
export function approveSender(channel: string, senderId: string, accountId?: string): void {
  const list = getPersistedAllowlist(channel, accountId);
  if (!list.includes(senderId)) {
    list.push(senderId);
    saveAllowlist(channel, list, accountId);
  }
}

/**
 * Remove a sender from the persisted allowlist.
 */
export function revokeSender(channel: string, senderId: string, accountId?: string): void {
  const list = getPersistedAllowlist(channel, accountId).filter((id) => id !== senderId);
  saveAllowlist(channel, list, accountId);
}

/**
 * Get the persisted allowlist for a channel.
 */
export function getPersistedAllowlist(channel: string, accountId?: string): string[] {
  const scoped = scopedChannelKey(channel, accountId);
  const scopedPath = join(CREDENTIALS_DIR, `${scoped}-allowFrom.json`);
  if (existsSync(scopedPath)) {
    try {
      return JSON.parse(readFileSync(scopedPath, "utf-8"));
    } catch {
      return [];
    }
  }

  // Automatic migration: legacy channel-level allowlist -> default account allowlist.
  const isDefaultAccount = !accountId || accountId === "default";
  if (isDefaultAccount) {
    const legacyPath = join(CREDENTIALS_DIR, `${channel}-allowFrom.json`);
    if (existsSync(legacyPath)) {
      try {
        const legacy = JSON.parse(readFileSync(legacyPath, "utf-8")) as string[];
        saveAllowlist(channel, legacy, "default");
        return legacy;
      } catch {
        return [];
      }
    }
  }
  return [];
}

function saveAllowlist(channel: string, list: string[], accountId?: string): void {
  if (!existsSync(CREDENTIALS_DIR)) {
    mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }
  const scoped = scopedChannelKey(channel, accountId);
  writeFileSync(join(CREDENTIALS_DIR, `${scoped}-allowFrom.json`), JSON.stringify(list, null, 2), "utf-8");
}

function scopedChannelKey(channel: string, accountId?: string): string {
  if (!accountId || accountId === "default") return `${channel}__default`;
  const normalized = accountId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${channel}__${normalized}`;
}
