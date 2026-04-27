/**
 * WeChat account management: QR login, account storage, multi-account support.
 *
 * Ported from @tencent-weixin/openclaw-weixin src/auth/accounts.ts and src/auth/login-qr.ts
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { homedir } from "node:os";
import type { GatewayPluginApi } from "../../types.ts";
import type { WechatChannelConfig, WechatAccountConfig, WechatResolvedAccount } from "./types.ts";
import { logger } from "./logger.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
export const DEFAULT_ILINK_BOT_TYPE = "3";

const QR_LONG_POLL_TIMEOUT_MS = 35_000;
const LOGIN_TIMEOUT_MS = 480_000; // 8 minutes
const MAX_QR_REFRESH_COUNT = 3;

// ---------------------------------------------------------------------------
// State Directory
// ---------------------------------------------------------------------------

function resolveStateDir(): string {
  const envDir = process.env.PI_STATE_DIR?.trim();
  if (envDir) return envDir;
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return path.join(homeDir, ".pi", "state");
}

function resolveWechatStateDir(): string {
  return path.join(resolveStateDir(), "wechat");
}

function resolveAccountIndexPath(): string {
  return path.join(resolveWechatStateDir(), "accounts.json");
}

// ---------------------------------------------------------------------------
// Account ID Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize WeChat account ID for filesystem-safe storage.
 * e.g., "hex@im.bot" → "hex-im-bot"
 */
export function normalizeAccountId(rawId: string): string {
  return rawId.replace(/[@.]/g, "-");
}

/**
 * Derive raw account ID from normalized ID (compatibility fallback).
 * e.g., "hex-im-bot" → "hex@im.bot"
 */
export function deriveRawAccountId(normalizedId: string): string | undefined {
  if (normalizedId.endsWith("-im-bot")) {
    return `${normalizedId.slice(0, -7)}@im.bot`;
  }
  if (normalizedId.endsWith("-im-wechat")) {
    return `${normalizedId.slice(0, -10)}@im.wechat`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Account Index (persistent list of registered account IDs)
// ---------------------------------------------------------------------------

export function listIndexedAccountIds(): string[] {
  const filePath = resolveAccountIndexPath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.trim() !== "");
  } catch {
    return [];
  }
}

export function registerAccountId(accountId: string): void {
  const dir = resolveWechatStateDir();
  fs.mkdirSync(dir, { recursive: true });

  const existing = listIndexedAccountIds();
  if (existing.includes(accountId)) return;

  const updated = [...existing, accountId];
  fs.writeFileSync(resolveAccountIndexPath(), JSON.stringify(updated, null, 2), "utf-8");
  logger.info(`[wechat:accounts] registered accountId=${accountId}`);
}

// ---------------------------------------------------------------------------
// Account Storage (per-account credential files)
// ---------------------------------------------------------------------------

export interface WechatAccountData {
  token?: string;
  savedAt?: string;
  baseUrl?: string;
  userId?: string;
}

function resolveAccountsDir(): string {
  return path.join(resolveWechatStateDir(), "accounts");
}

function resolveAccountPath(accountId: string): string {
  return path.join(resolveAccountsDir(), `${normalizeAccountId(accountId)}.json`);
}

function readAccountFile(filePath: string): WechatAccountData | null {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as WechatAccountData;
    }
  } catch {
    // ignore
  }
  return null;
}

export function loadWechatAccount(accountId: string): WechatAccountData | null {
  const normalized = normalizeAccountId(accountId);

  // Primary: try normalized ID
  const primary = readAccountFile(resolveAccountPath(normalized));
  if (primary) return primary;

  // Compatibility: try raw ID
  const raw = deriveRawAccountId(normalized);
  if (raw) {
    const compat = readAccountFile(resolveAccountPath(raw));
    if (compat) return compat;
  }

  return null;
}

export function saveWechatAccount(
  accountId: string,
  data: { token?: string; baseUrl?: string; userId?: string }
): void {
  const dir = resolveAccountsDir();
  fs.mkdirSync(dir, { recursive: true });

  const existing = loadWechatAccount(accountId) ?? {};

  const merged: WechatAccountData = {
    ...(existing.token ? { token: existing.token, savedAt: existing.savedAt } : {}),
    ...(data.token ? { token: data.token, savedAt: new Date().toISOString() } : {}),
    ...(data.baseUrl ? { baseUrl: data.baseUrl } : {}),
    ...(data.userId !== undefined ? { userId: data.userId } : {}),
    ...(existing.userId && !data.userId ? { userId: existing.userId } : {}),
  };

  const filePath = resolveAccountPath(accountId);
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");

  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort
  }

  logger.info(`[wechat:accounts] saved account accountId=${accountId}`);
}

export function clearWechatAccount(accountId: string): void {
  try {
    fs.unlinkSync(resolveAccountPath(accountId));
    logger.info(`[wechat:accounts] cleared account accountId=${accountId}`);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Account Resolution (merge config + stored credentials)
// ---------------------------------------------------------------------------

export function resolveDefaultAccountId(cfg: WechatChannelConfig): string {
  if (cfg.accountId?.trim()) {
    return normalizeAccountId(cfg.accountId.trim());
  }

  if (cfg.accounts) {
    for (const [id, account] of Object.entries(cfg.accounts)) {
      if (account.enabled !== false) return id;
    }
  }

  const indexed = listIndexedAccountIds();
  return indexed[0] ?? "default";
}

export function resolveWechatAccounts(cfg: WechatChannelConfig): WechatResolvedAccount[] {
  const result: WechatResolvedAccount[] = [];
  const configuredAccountIds = new Set<string>();

  if (cfg.accounts) {
    for (const [id, account] of Object.entries(cfg.accounts)) {
      if (account.enabled === false) continue;

      configuredAccountIds.add(id);
      configuredAccountIds.add(normalizeAccountId(id));
      const data = loadWechatAccount(id);
      const token = data?.token?.trim() || account.token?.trim();

      if (!token) continue;

      result.push({
        accountId: id,
        name: account.name?.trim(),
        enabled: account.enabled ?? true,
        configured: Boolean(token),
        baseUrl: data?.baseUrl?.trim() || account.baseUrl?.trim() || cfg.baseUrl || DEFAULT_BASE_URL,
        cdnBaseUrl: account.cdnBaseUrl?.trim() || cfg.cdnBaseUrl || CDN_BASE_URL,
        token,
        userId: data?.userId,
        dmPolicy: account.dmPolicy ?? cfg.dmPolicy ?? "pairing",
        allowFrom: account.allowFrom ?? cfg.allowFrom ?? [],
      });
    }
  }

  for (const accountId of listIndexedAccountIds()) {
    if (configuredAccountIds.has(accountId)) continue;

    const data = loadWechatAccount(accountId);
    const token = data?.token?.trim();
    if (!token) continue;

    result.push({
      accountId,
      enabled: true,
      configured: true,
      baseUrl: data?.baseUrl?.trim() || cfg.baseUrl || DEFAULT_BASE_URL,
      cdnBaseUrl: cfg.cdnBaseUrl || CDN_BASE_URL,
      token,
      userId: data?.userId,
      dmPolicy: cfg.dmPolicy ?? "pairing",
      allowFrom: cfg.allowFrom ?? [],
    });
  }

  // Legacy single-account mode
  if (result.length === 0 && cfg.token) {
    result.push({
      accountId: resolveDefaultAccountId(cfg),
      enabled: true,
      configured: Boolean(cfg.token),
      baseUrl: cfg.baseUrl || DEFAULT_BASE_URL,
      cdnBaseUrl: cfg.cdnBaseUrl || CDN_BASE_URL,
      token: cfg.token,
      dmPolicy: cfg.dmPolicy ?? "pairing",
      allowFrom: cfg.allowFrom ?? [],
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// QR Login Flow
// ---------------------------------------------------------------------------

export interface WechatQrStartResult {
  qrcodeUrl?: string;
  message: string;
  sessionKey: string;
}

export interface WechatQrWaitResult {
  connected: boolean;
  botToken?: string;
  accountId?: string;
  baseUrl?: string;
  userId?: string;
  message: string;
}

interface QRCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

interface StatusResponse {
  status: "wait" | "scaned" | "confirmed" | "expired";
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

interface ActiveLogin {
  sessionKey: string;
  qrcode: string;
  qrcodeUrl: string;
  startedAt: number;
  botToken?: string;
  status?: "wait" | "scaned" | "confirmed" | "expired";
}

const ACTIVE_LOGIN_TTL_MS = 5 * 60_000; // 5 minutes
const activeLogins = new Map<string, ActiveLogin>();

function isLoginFresh(login: ActiveLogin): boolean {
  return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
}

function purgeExpiredLogins(): void {
  for (const [id, login] of activeLogins) {
    if (!isLoginFresh(login)) {
      activeLogins.delete(id);
    }
  }
}

async function fetchQRCode(apiBaseUrl: string, botType: string): Promise<QRCodeResponse> {
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const url = new URL(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`, base);

  logger.info(`[wechat:login] fetching QR code from ${url.toString()}`);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text().catch(() => "(unreadable)");
    throw new Error(`Failed to fetch QR code: ${response.status} ${response.statusText}`);
  }

  return await response.json() as QRCodeResponse;
}

async function pollQRStatus(apiBaseUrl: string, qrcode: string): Promise<StatusResponse> {
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const url = new URL(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, base);

  const headers: Record<string, string> = {
    "iLink-App-ClientVersion": "1",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QR_LONG_POLL_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), { headers, signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`QR status poll failed: ${response.status}`);
    }

    return await response.json() as StatusResponse;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "wait" };
    }
    throw err;
  }
}

export async function startWechatLoginWithQr(opts: {
  accountId?: string;
  apiBaseUrl: string;
  botType?: string;
  force?: boolean;
}): Promise<WechatQrStartResult> {
  const sessionKey = opts.accountId || crypto.randomUUID();
  const botType = opts.botType || DEFAULT_ILINK_BOT_TYPE;

  purgeExpiredLogins();

  const existing = activeLogins.get(sessionKey);
  if (!opts.force && existing && isLoginFresh(existing) && existing.qrcodeUrl) {
    return {
      qrcodeUrl: existing.qrcodeUrl,
      message: "QR code already ready, please scan with WeChat.",
      sessionKey,
    };
  }

  try {
    const qrResponse = await fetchQRCode(opts.apiBaseUrl, botType);

    logger.info(`[wechat:login] QR code received`);

    const login: ActiveLogin = {
      sessionKey,
      qrcode: qrResponse.qrcode,
      qrcodeUrl: qrResponse.qrcode_img_content,
      startedAt: Date.now(),
    };

    activeLogins.set(sessionKey, login);

    return {
      qrcodeUrl: qrResponse.qrcode_img_content,
      message: "Please scan the QR code with WeChat to connect.",
      sessionKey,
    };
  } catch (err) {
    logger.error(`[wechat:login] failed to start: ${String(err)}`);
    return {
      message: `Failed to start login: ${String(err)}`,
      sessionKey,
    };
  }
}

export async function waitForWechatLogin(opts: {
  sessionKey: string;
  apiBaseUrl: string;
  botType?: string;
  timeoutMs?: number;
  verbose?: boolean;
}): Promise<WechatQrWaitResult> {
  let activeLogin = activeLogins.get(opts.sessionKey);

  if (!activeLogin) {
    return {
      connected: false,
      message: "No active login session. Please start login first.",
    };
  }

  if (!isLoginFresh(activeLogin)) {
    activeLogins.delete(opts.sessionKey);
    return {
      connected: false,
      message: "QR code expired. Please restart login.",
    };
  }

  const timeoutMs = Math.max(opts.timeoutMs ?? LOGIN_TIMEOUT_MS, 1000);
  const deadline = Date.now() + timeoutMs;
  let scannedPrinted = false;
  let qrRefreshCount = 1;

  logger.info(`[wechat:login] polling QR status...`);

  while (Date.now() < deadline) {
    try {
      const status = await pollQRStatus(opts.apiBaseUrl, activeLogin.qrcode);
      activeLogin.status = status.status;

      switch (status.status) {
        case "wait":
          if (opts.verbose) {
            process.stdout.write(".");
          }
          break;

        case "scaned":
          if (!scannedPrinted) {
            logger.info(`[wechat:login] QR scanned, waiting for confirmation...`);
            scannedPrinted = true;
          }
          break;

        case "expired": {
          qrRefreshCount++;
          if (qrRefreshCount > MAX_QR_REFRESH_COUNT) {
            activeLogins.delete(opts.sessionKey);
            return {
              connected: false,
              message: `QR expired ${MAX_QR_REFRESH_COUNT} times. Please restart login.`,
            };
          }

          logger.info(`[wechat:login] QR expired, refreshing (${qrRefreshCount}/${MAX_QR_REFRESH_COUNT})`);

          try {
            const botType = opts.botType || DEFAULT_ILINK_BOT_TYPE;
            const qrResponse = await fetchQRCode(opts.apiBaseUrl, botType);
            activeLogin.qrcode = qrResponse.qrcode;
            activeLogin.qrcodeUrl = qrResponse.qrcode_img_content;
            activeLogin.startedAt = Date.now();
            scannedPrinted = false;

            logger.info(`[wechat:login] new QR code generated`);
          } catch (refreshErr) {
            activeLogins.delete(opts.sessionKey);
            return {
              connected: false,
              message: `Failed to refresh QR: ${String(refreshErr)}`,
            };
          }
          break;
        }

        case "confirmed": {
          if (!status.ilink_bot_id) {
            activeLogins.delete(opts.sessionKey);
            return {
              connected: false,
              message: "Login confirmed but ilink_bot_id missing.",
            };
          }

          activeLogin.botToken = status.bot_token;
          activeLogins.delete(opts.sessionKey);

          // Save account
          const normalizedId = normalizeAccountId(status.ilink_bot_id);
          saveWechatAccount(normalizedId, {
            token: status.bot_token,
            baseUrl: status.baseurl,
            userId: status.ilink_user_id,
          });
          registerAccountId(normalizedId);

          logger.info(`[wechat:login] connected! accountId=${normalizedId}`);

          return {
            connected: true,
            botToken: status.bot_token,
            accountId: status.ilink_bot_id,
            baseUrl: status.baseurl,
            userId: status.ilink_user_id,
            message: "Successfully connected to WeChat!",
          };
        }
      }
    } catch (err) {
      logger.error(`[wechat:login] poll error: ${String(err)}`);
      activeLogins.delete(opts.sessionKey);
      return {
        connected: false,
        message: `Login failed: ${String(err)}`,
      };
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  activeLogins.delete(opts.sessionKey);
  return {
    connected: false,
    message: "Login timeout. Please try again.",
  };
}

// ---------------------------------------------------------------------------
// Config Route Tag (for SKRouteTag header)
// ---------------------------------------------------------------------------

function resolveGatewayConfigPath(): string | undefined {
  if (process.env.PI_GATEWAY_CONFIG?.trim()) {
    return process.env.PI_GATEWAY_CONFIG.trim();
  }

  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  for (const candidate of [
    path.join(home, ".pi", "gateway", "pi-gateway.jsonc"),
    path.join(home, ".pi", "gateway", "pi-gateway.json"),
    path.join(process.cwd(), "pi-gateway.jsonc"),
    path.join(process.cwd(), "pi-gateway.json"),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return undefined;
}

function stripJsonComments(raw: string): string {
  return raw
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

export function loadConfigRouteTag(accountId?: string): string | undefined {
  try {
    const configPath = resolveGatewayConfigPath();
    if (!configPath || !fs.existsSync(configPath)) return undefined;

    const raw = fs.readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
    const channels = cfg.channels as Record<string, unknown> | undefined;
    const section = channels?.["wechat"] as Record<string, unknown> | undefined;

    if (!section) return undefined;

    if (accountId) {
      const accounts = section.accounts as Record<string, Record<string, unknown>> | undefined;
      const tag = accounts?.[accountId]?.routeTag;
      if (typeof tag === "number") return String(tag);
      if (typeof tag === "string" && tag.trim()) return tag.trim();
    }

    if (typeof section.routeTag === "number") return String(section.routeTag);
    return typeof section.routeTag === "string" && section.routeTag.trim()
      ? section.routeTag.trim()
      : undefined;
  } catch {
    return undefined;
  }
}
