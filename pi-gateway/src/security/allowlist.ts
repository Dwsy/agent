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
  configAllowFrom?: string[],
): boolean {
  switch (policy) {
    case "disabled":
      return false;

    case "open":
      return true;

    case "allowlist": {
      // Check config allowFrom
      if (configAllowFrom?.includes(senderId) || configAllowFrom?.includes("*")) {
        return true;
      }
      // Check persisted allowlist
      return getPersistedAllowlist(channel).includes(senderId);
    }

    case "pairing": {
      // Check config allowFrom first
      if (configAllowFrom?.includes(senderId) || configAllowFrom?.includes("*")) {
        return true;
      }
      // Check approved (persisted) allowlist
      return getPersistedAllowlist(channel).includes(senderId);
    }

    default:
      return false;
  }
}

/**
 * Add a sender to the persisted allowlist.
 */
export function approveSender(channel: string, senderId: string): void {
  const list = getPersistedAllowlist(channel);
  if (!list.includes(senderId)) {
    list.push(senderId);
    saveAllowlist(channel, list);
  }
}

/**
 * Remove a sender from the persisted allowlist.
 */
export function revokeSender(channel: string, senderId: string): void {
  const list = getPersistedAllowlist(channel).filter((id) => id !== senderId);
  saveAllowlist(channel, list);
}

/**
 * Get the persisted allowlist for a channel.
 */
export function getPersistedAllowlist(channel: string): string[] {
  const path = join(CREDENTIALS_DIR, `${channel}-allowFrom.json`);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

function saveAllowlist(channel: string, list: string[]): void {
  if (!existsSync(CREDENTIALS_DIR)) {
    mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }
  writeFileSync(join(CREDENTIALS_DIR, `${channel}-allowFrom.json`), JSON.stringify(list, null, 2), "utf-8");
}
