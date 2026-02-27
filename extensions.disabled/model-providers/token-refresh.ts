#!/usr/bin/env bun
/**
 * Token Refresh Script for Model Providers
 * Supports: qwen (iflow available but disabled by default)
 *
 * Usage:
 *   bun token-refresh.ts qwen
 *   bun token-refresh.ts all
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";

// ============ Types ============
interface TokenData {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  api_key?: string;
  resource_url?: string;
  email?: string;
  cookie?: string;
  disabled?: boolean;
  [key: string]: any;
}

interface RefreshResult {
  success: boolean;
  access_token?: string;
  refresh_token?: string;
  api_key?: string;
  expiry_date?: number;
  error?: string;
}

export interface RefreshResults {
  qwen: boolean;
  iflow?: boolean;
  allSuccess: boolean;
}

// ============ Config ============
const QWEN_CONFIG = {
  name: "qwen",
  tokenEndpoint: "https://oauth.qwen.ai/oauth/token",
  clientId: "acmeshell",
  tokenDir: join(homedir(), ".cli-proxy-api"),
  primaryTokenFile: join(homedir(), ".qwen", "oauth_creds.json"),
};

// iFlow config (available but disabled by default)
const IFLOW_CONFIG = {
  name: "iflow",
  oauthEndpoint: "https://iflow.cn/oauth/token",
  apiKeyEndpoint: "https://platform.iflow.cn/api/openapi/apikey",
  clientId: "10009311001",
  clientSecret: "4Z3YjXycVsQvyGF1etiNlIBB4RsqSDtW",
  tokenDir: join(homedir(), ".cli-proxy-api"),
};

// ============ Utils ============
function log(msg: string, level: "info" | "warn" | "error" = "info") {
  const prefix = { info: "[INFO]", warn: "[WARN]", error: "[ERROR]" }[level];
  console.log(`${prefix} ${msg}`);
}

function isTokenExpired(expiryDate: number | undefined, bufferMinutes = 5): boolean {
  if (!expiryDate) return true;
  return Date.now() >= expiryDate - bufferMinutes * 60 * 1000;
}

function findTokenFiles(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((f) => join(dir, f))
    .sort((a, b) => {
      const statA = Bun.file(a).statSync();
      const statB = Bun.file(b).statSync();
      return (statB?.mtimeMs || 0) - (statA?.mtimeMs || 0);
    });
}

function readTokenFile(path: string): TokenData | null {
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf8");
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function writeTokenFile(path: string, data: TokenData): boolean {
  try {
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

// ============ Qwen Token Refresh ============
async function refreshQwenToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: QWEN_CONFIG.clientId,
    });

    const response = await fetch(QWEN_CONFIG.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const expiryDate = Date.now() + (data.expires_in || 3600) * 1000;

    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expiry_date: expiryDate,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function refreshQwen(): Promise<boolean> {
  log("Checking Qwen tokens...");

  // 1. Check primary token file (~/.qwen/oauth_creds.json)
  const primaryToken = readTokenFile(QWEN_CONFIG.primaryTokenFile);
  if (primaryToken?.access_token && !isTokenExpired(primaryToken.expiry_date)) {
    log("Qwen primary token is still valid");
    return true;
  }

  // 2. Find refreshable tokens from cli-proxy-api
  const tokenFiles = findTokenFiles(QWEN_CONFIG.tokenDir, "qwen-");
  if (tokenFiles.length === 0) {
    log("No Qwen token files found", "warn");
    return false;
  }

  for (const filePath of tokenFiles) {
    const tokenData = readTokenFile(filePath);
    if (!tokenData?.refresh_token) continue;
    if (tokenData.disabled) {
      log(`Skipping disabled token: ${filePath}`, "warn");
      continue;
    }

    log(`Refreshing token from ${filePath}...`);
    const result = await refreshQwenToken(tokenData.refresh_token);

    if (result.success && result.access_token) {
      // Update token file
      const updated: TokenData = {
        ...tokenData,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expiry_date: result.expiry_date,
        last_refresh: Date.now(),
      };

      if (writeTokenFile(filePath, updated)) {
        log(`✓ Qwen token refreshed successfully (expires: ${new Date(result.expiry_date!).toISOString()})`);

        // Also update primary token file
        writeTokenFile(QWEN_CONFIG.primaryTokenFile, updated);
        return true;
      }
    } else {
      log(`Failed to refresh: ${result.error}`, "error");
    }
  }

  log("All Qwen token refresh attempts failed", "error");
  return false;
}

// ============ iFlow Token Refresh (Available but disabled by default) ============
async function refreshIflowOAuth(refreshToken: string): Promise<RefreshResult> {
  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: IFLOW_CONFIG.clientId,
      client_secret: IFLOW_CONFIG.clientSecret,
    });

    const response = await fetch(IFLOW_CONFIG.oauthEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const expiryDate = Date.now() + (data.expires_in || 3600) * 1000;

    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      api_key: data.api_key,
      expiry_date: expiryDate,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function refreshIflowCookie(cookie: string, email?: string): Promise<RefreshResult> {
  try {
    const response = await fetch(IFLOW_CONFIG.apiKeyEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ name: "cli-proxy-api-key" }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const expiryDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

    return {
      success: true,
      api_key: data.api_key || data.key,
      expiry_date: expiryDate,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function refreshIflow(): Promise<boolean> {
  log("Checking iFlow tokens...");

  const tokenFiles = findTokenFiles(IFLOW_CONFIG.tokenDir, "iflow-");
  if (tokenFiles.length === 0) {
    log("No iFlow token files found", "warn");
    return false;
  }

  for (const filePath of tokenFiles) {
    const tokenData = readTokenFile(filePath);
    if (!tokenData) continue;
    if (tokenData.disabled) {
      log(`Skipping disabled token: ${filePath}`, "warn");
      continue;
    }

    const needsRefresh = isTokenExpired(tokenData.expiry_date, 48 * 60);
    if (!needsRefresh) {
      log(`iFlow token is still valid: ${filePath}`);
      continue;
    }

    let result: RefreshResult;

    if (tokenData.cookie) {
      log(`Refreshing iFlow cookie-based token from ${filePath}...`);
      result = await refreshIflowCookie(tokenData.cookie, tokenData.email);
    } else if (tokenData.refresh_token) {
      log(`Refreshing iFlow OAuth token from ${filePath}...`);
      result = await refreshIflowOAuth(tokenData.refresh_token);
    } else {
      log(`No refresh method available for ${filePath}`, "warn");
      continue;
    }

    if (result.success) {
      const updated: TokenData = {
        ...tokenData,
        access_token: result.access_token || tokenData.access_token,
        refresh_token: result.refresh_token || tokenData.refresh_token,
        api_key: result.api_key || tokenData.api_key,
        expiry_date: result.expiry_date,
        last_refresh: Date.now(),
      };

      if (writeTokenFile(filePath, updated)) {
        log(`✓ iFlow token refreshed successfully (expires: ${new Date(result.expiry_date!).toISOString()})`);
      }
    } else {
      log(`Failed to refresh: ${result.error}`, "error");
    }
  }

  return true;
}

// ============ Main Export ============
export async function refreshTokens(provider: "qwen" | "iflow" | "all" = "all"): Promise<RefreshResults> {
  const results: Partial<RefreshResults> = {};

  if (provider === "all" || provider === "qwen") {
    results.qwen = await refreshQwen();
  }

  if (provider === "all" || provider === "iflow") {
    results.iflow = await refreshIflow();
  }

  results.allSuccess = Object.values(results).every((v) => v);
  return results as RefreshResults;
}

// ============ CLI Entry Point ============
if (import.meta.main) {
  const provider = process.argv[2]?.toLowerCase() as "qwen" | "iflow" | "all";

  if (!provider || !["qwen", "iflow", "all"].includes(provider)) {
    console.log("Usage: bun token-refresh.ts <qwen|iflow|all>");
    process.exit(1);
  }

  const results = await refreshTokens(provider);

  console.log("\n--- Summary ---");
  for (const [name, success] of Object.entries(results)) {
    if (name === "allSuccess") continue;
    console.log(`${name}: ${success ? "✓ OK" : "✗ FAILED"}`);
  }

  process.exit(results.allSuccess ? 0 : 1);
}
