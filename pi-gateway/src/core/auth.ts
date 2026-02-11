/**
 * Authentication utilities for pi-gateway.
 * Timing-safe token comparison (prevents timing attacks, aligned with OpenClaw auth.ts).
 */

import { timingSafeEqual } from "node:crypto";

export function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/** Redact sensitive fields from config for safe exposure via API */
export function redactConfig(config: Record<string, any>): Record<string, unknown> {
  const json = JSON.parse(JSON.stringify(config)) as Record<string, any>;

  if (json.gateway?.auth?.token) json.gateway.auth.token = "***";
  if (json.gateway?.auth?.password) json.gateway.auth.password = "***";

  if (json.channels?.telegram?.botToken) json.channels.telegram.botToken = "***";
  if (json.channels?.telegram?.webhookSecret) json.channels.telegram.webhookSecret = "***";
  if (json.channels?.telegram?.accounts && typeof json.channels.telegram.accounts === "object") {
    for (const account of Object.values(json.channels.telegram.accounts as Record<string, any>)) {
      if (!account || typeof account !== "object") continue;
      if (account.botToken) account.botToken = "***";
      if (account.webhookSecret) account.webhookSecret = "***";
      if (account.tokenFile) account.tokenFile = "***";
    }
  }

  if (json.channels?.discord?.botToken) json.channels.discord.botToken = "***";
  if (json.channels?.discord?.webhookSecret) json.channels.discord.webhookSecret = "***";

  if (json.hooks?.token) json.hooks.token = "***";

  return json;
}
