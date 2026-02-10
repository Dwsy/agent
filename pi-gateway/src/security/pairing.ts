/**
 * DM Pairing system — aligned with OpenClaw's pairing flow.
 *
 * Flow:
 * 1. Unknown sender messages the bot
 * 2. Bot generates an 8-character uppercase pairing code
 * 3. Bot replies: "Send this code to the admin: ABCD1234"
 * 4. Admin runs: pi-gw pairing approve <channel> <code>
 * 5. Sender is added to the allowlist
 *
 * Storage: ~/.pi/gateway/credentials/{channel}-pairing.json
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { approveSender } from "./allowlist.ts";

const CREDENTIALS_DIR = join(homedir(), ".pi", "gateway", "credentials");
const CODE_LENGTH = 8;
const CODE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const MAX_PENDING_PER_CHANNEL = 3;

// ============================================================================
// Types
// ============================================================================

interface PairingRequest {
  code: string;
  senderId: string;
  senderName?: string;
  channel: string;
  createdAt: number;
}

// ============================================================================
// Pairing
// ============================================================================

/**
 * Create a pairing request for an unknown sender.
 * Returns the pairing code, or null if too many pending requests.
 */
export function createPairingRequest(
  channel: string,
  senderId: string,
  senderName?: string,
  accountId?: string,
): string | null {
  const pending = getPendingRequests(channel, accountId);

  // Clean expired
  const now = Date.now();
  const active = pending.filter((r) => now - r.createdAt < CODE_EXPIRY_MS);

  // Check if sender already has a pending request
  const existing = active.find((r) => r.senderId === senderId);
  if (existing) return existing.code;

  // Cap per channel
  if (active.length >= MAX_PENDING_PER_CHANNEL) return null;

  // Generate code
  const code = generateCode();
  active.push({ code, senderId, senderName, channel, createdAt: now });
  savePendingRequests(channel, active, accountId);

  return code;
}

/**
 * Approve a pairing request by code.
 * Returns the sender ID if found and approved, null otherwise.
 */
export function approvePairingRequest(channel: string, code: string, accountId?: string): string | null {
  const pending = getPendingRequests(channel, accountId);
  const idx = pending.findIndex((r) => r.code.toUpperCase() === code.toUpperCase());
  if (idx === -1) return null;

  const request = pending[idx];

  // Check expiry
  if (Date.now() - request.createdAt > CODE_EXPIRY_MS) {
    pending.splice(idx, 1);
    savePendingRequests(channel, pending, accountId);
    return null;
  }

  // Approve: add to allowlist and remove from pending
  approveSender(channel, request.senderId, accountId);
  pending.splice(idx, 1);
  savePendingRequests(channel, pending, accountId);

  return request.senderId;
}

/**
 * List all pending pairing requests for a channel.
 */
export function listPendingRequests(channel?: string, accountId?: string): PairingRequest[] {
  if (channel) return getPendingRequests(channel, accountId);

  // List all channels
  if (!existsSync(CREDENTIALS_DIR)) return [];
  const files = readdirSync(CREDENTIALS_DIR) as string[];
  const results: PairingRequest[] = [];

  for (const file of files) {
    if (file.endsWith("-pairing.json")) {
      const path = join(CREDENTIALS_DIR, file);
      try {
        const data = JSON.parse(readFileSync(path, "utf-8")) as PairingRequest[];
        results.push(...data);
      } catch {
        // ignore bad file
      }
    }
  }

  return results;
}

// ============================================================================
// Internal
// ============================================================================

function getPendingRequests(channel: string, accountId?: string): PairingRequest[] {
  const scoped = scopedChannelKey(channel, accountId);
  const scopedPath = join(CREDENTIALS_DIR, `${scoped}-pairing.json`);
  if (existsSync(scopedPath)) {
    try {
      return JSON.parse(readFileSync(scopedPath, "utf-8"));
    } catch {
      return [];
    }
  }

  // Automatic migration from legacy channel-level file.
  const isDefaultAccount = !accountId || accountId === "default";
  if (isDefaultAccount) {
    const legacyPath = join(CREDENTIALS_DIR, `${channel}-pairing.json`);
    if (existsSync(legacyPath)) {
      try {
        const legacy = JSON.parse(readFileSync(legacyPath, "utf-8")) as PairingRequest[];
        savePendingRequests(channel, legacy, "default");
        return legacy;
      } catch {
        return [];
      }
    }
  }
  return [];
}

function savePendingRequests(channel: string, requests: PairingRequest[], accountId?: string): void {
  if (!existsSync(CREDENTIALS_DIR)) {
    mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }
  const scoped = scopedChannelKey(channel, accountId);
  writeFileSync(
    join(CREDENTIALS_DIR, `${scoped}-pairing.json`),
    JSON.stringify(requests, null, 2),
    "utf-8",
  );
}

function scopedChannelKey(channel: string, accountId?: string): string {
  if (!accountId || accountId === "default") return `${channel}__default`;
  const normalized = accountId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${channel}__${normalized}`;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0/O/1/I to avoid confusion
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
