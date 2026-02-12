/**
 * Authentication utilities for pi-gateway.
 * Timing-safe token comparison (prevents timing attacks, aligned with OpenClaw auth.ts).
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { GatewayConfig } from "./config.ts";

export function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Validate auth config at startup. Fail-closed:
 * - mode:"off" requires explicit allowUnauthenticated:true
 * - mode:"token" auto-generates a token if none provided
 * Returns the resolved token (if any) and logs warnings.
 */
export function resolveAuthConfig(
  auth: GatewayConfig["auth"],
  log: { info(msg: string): void; warn(msg: string): void },
): { resolvedToken?: string } {
  if (auth.mode === "off") {
    if (!auth.allowUnauthenticated) {
      throw new Error(
        'Auth mode is "off" but allowUnauthenticated is not true. ' +
        "Set auth.allowUnauthenticated=true to confirm running without authentication.",
      );
    }
    log.warn("[auth] Running WITHOUT authentication (allowUnauthenticated=true). Not recommended for production.");
    return {};
  }

  if (auth.mode === "token") {
    if (auth.token) {
      return { resolvedToken: auth.token };
    }
    const generated = randomBytes(24).toString("base64url");
    if (auth.logToken !== false) {
      log.info(`[auth] Auto-generated token: ${generated}`);
    } else {
      log.info("[auth] Auto-generated token (hidden by logToken=false). Check gateway config.");
    }
    log.info("[auth] Set gateway.auth.token in config to use a fixed token.");
    return { resolvedToken: generated };
  }

  // mode:"password" — password must be set
  if (auth.mode === "password" && !auth.password) {
    throw new Error('Auth mode is "password" but no password configured.');
  }

  return {};
}

/** Auth-exempt paths that never require authentication */
const AUTH_EXEMPT_PATHS = new Set(["/health", "/api/health"]);

/**
 * Build the set of auth-exempt prefixes based on enabled channels.
 * Only known webhook paths are exempt, not all /webhook/*.
 */
export function buildAuthExemptPrefixes(config?: { channels?: Record<string, any> }): string[] {
  const prefixes = ["/web/"];
  // Only exempt webhook paths for enabled channels
  if (config?.channels?.telegram?.enabled !== false && config?.channels?.telegram) {
    prefixes.push("/webhook/telegram");
  }
  if (config?.channels?.discord?.enabled !== false && config?.channels?.discord) {
    prefixes.push("/webhook/discord");
  }
  return prefixes;
}

/** Check if a URL path is exempt from auth */
export function isAuthExempt(pathname: string, exemptPrefixes?: string[]): boolean {
  if (AUTH_EXEMPT_PATHS.has(pathname) || pathname === "/") return true;
  const prefixes = exemptPrefixes ?? ["/web/"];
  return prefixes.some((p) => pathname.startsWith(p));
}

/**
 * Authenticate an HTTP request (including WS upgrades). Returns null if authenticated, or a 401 Response.
 * Supports both Authorization header and ?token= query param (for WS clients).
 */
export function authenticateRequest(
  req: Request,
  url: URL,
  auth: GatewayConfig["auth"],
  resolvedToken?: string,
  exemptPrefixes?: string[],
): Response | null {
  if (auth.mode === "off") return null;
  if (isAuthExempt(url.pathname, exemptPrefixes)) return null;

  if (auth.mode === "token" && resolvedToken) {
    const provided = req.headers.get("authorization")?.replace("Bearer ", "")
      ?? url.searchParams.get("token");
    if (!provided || !safeTokenCompare(provided, resolvedToken)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  if (auth.mode === "password" && auth.password) {
    const provided = req.headers.get("authorization")?.replace("Bearer ", "")
      ?? url.searchParams.get("token");
    if (!provided || !safeTokenCompare(provided, auth.password)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  return null;
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
