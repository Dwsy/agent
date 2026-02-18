/**
 * Provider credential management
 *
 * Scans and manages API keys from:
 * - ~/.qwen/oauth_creds.json
 * - ~/.iflow/settings.json
 * - ~/.cli-proxy-api/*.json
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { QwenCreds, CliProxyCred, ProviderInfo } from "./types.js";

const execAsync = promisify(exec);

// Provider paths
const ILOW_SETTINGS_PATH = `${process.env.HOME}/.iflow/settings.json`;
const QWEN_CREDS_PATH = `${process.env.HOME}/.qwen/oauth_creds.json`;
const CLI_PROXY_API_PATH = `${process.env.HOME}/.cli-proxy-api`;

// Token refresh tuning
const QWEN_TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000; // refresh 2m before expiry
const QWEN_REFRESH_TIMEOUT_MS = 20_000;

let qwenRefreshPromise: Promise<void> | null = null;

// ============ Ilow Key ============

export async function getIlowApiKey(): Promise<string | null> {
	try {
		if (!existsSync(ILOW_SETTINGS_PATH)) return null;
		const { stdout } = await execAsync(`jq -r '.apiKey // empty' "${ILOW_SETTINGS_PATH}"`);
		const apiKey = stdout.trim();
		return apiKey || null;
	} catch (error) {
		console.error("Failed to read iflow settings:", error);
		return null;
	}
}

// ============ Qwen Key ============

async function readQwenCreds(): Promise<QwenCreds | null> {
	if (!existsSync(QWEN_CREDS_PATH)) return null;
	const content = await readFile(QWEN_CREDS_PATH, "utf-8");
	return JSON.parse(content) as QwenCreds;
}

function isQwenTokenUsable(creds: QwenCreds | null): boolean {
	if (!creds?.access_token) return false;
	if (!creds.expiry_date) return true;
	return creds.expiry_date - Date.now() > QWEN_TOKEN_REFRESH_SKEW_MS;
}

async function refreshQwenTokenViaCli(): Promise<void> {
	if (qwenRefreshPromise) {
		await qwenRefreshPromise;
		return;
	}

	qwenRefreshPromise = (async () => {
		try {
			await execAsync('qwen -p "ping" --auth-type qwen-oauth >/dev/null 2>&1', {
				timeout: QWEN_REFRESH_TIMEOUT_MS,
				maxBuffer: 1024 * 1024,
			});
		} catch (error) {
			console.error("Failed to refresh Qwen token via CLI:", error);
		}
	})();

	try {
		await qwenRefreshPromise;
	} finally {
		qwenRefreshPromise = null;
	}
}

export async function getQwenAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string | null> {
	const forceRefresh = options.forceRefresh === true;

	try {
		const creds = await readQwenCreds();

		if (!forceRefresh && isQwenTokenUsable(creds)) {
			return creds!.access_token;
		}

		// Try refresh when token is expired/near-expiry or when caller forces refresh (e.g. after 401)
		if ((creds?.refresh_token || forceRefresh) && existsSync(QWEN_CREDS_PATH)) {
			await refreshQwenTokenViaCli();
			const refreshed = await readQwenCreds();
			if (isQwenTokenUsable(refreshed)) {
				return refreshed!.access_token;
			}
			if (refreshed?.access_token && !refreshed.expiry_date) {
				return refreshed.access_token;
			}
		}
	} catch (error) {
		console.error("Failed to read/refresh Qwen credentials:", error);
	}

	// Priority 2: ~/.cli-proxy-api/ qwen-*.json
	const cliProxyToken = await getCliProxyToken("qwen");
	if (cliProxyToken) return cliProxyToken;

	return null;
}

// ============ CLI Proxy API Scanner ============

// Scan ~/.cli-proxy-api/ for credential files (sorted by mtime, newest first)
export async function scanCliProxyApi(): Promise<CliProxyCred[]> {
	const creds: CliProxyCred[] = [];

	try {
		if (!existsSync(CLI_PROXY_API_PATH)) return creds;

		const { stdout } = await execAsync(`ls -t "${CLI_PROXY_API_PATH}"/*.json 2>/dev/null | head -20`);
		const files = stdout.trim().split("\n").filter(Boolean);

		for (const file of files) {
			try {
				const content = await readFile(file.trim(), "utf-8");
				const json = JSON.parse(content);

				// Skip disabled entries
				if (json.disabled) continue;

				// Check expiration
				if (json.expired) {
					const expiredDate = new Date(json.expired);
					if (expiredDate < new Date()) {
						continue; // Skip expired
					}
				}

				// Extract access_token (supports both access_token and api_key)
				const token = json.access_token || json.api_key;
				if (!token) continue;

				const type = json.type || "unknown";
				const email = json.email || file.split("/").pop()?.replace(".json", "");

				creds.push({
					type,
					access_token: token,
					expired: json.expired,
					email,
					file,
				});
			} catch {
				// Skip invalid JSON files
			}
		}
	} catch (error) {
		console.error("Failed to scan cli-proxy-api:", error);
	}

	return creds;
}

// Get the latest valid token by type
export async function getCliProxyToken(type: string): Promise<string | null> {
	const creds = await scanCliProxyApi();
	const matching = creds.filter(c => c.type === type || c.file.includes(type));
	if (matching.length === 0) return null;
	return matching[0].access_token;
}

// Get iflow token from cli-proxy-api
export async function getIlowToken(): Promise<string | null> {
	// Priority 1: ~/.iflow/settings.json
	const iflowKey = await getIlowApiKey();
	if (iflowKey) return iflowKey;

	// Priority 2: cli-proxy-api iflow-*.json
	return await getCliProxyToken("iflow");
}

// Get all available providers
export async function getAllProviders(): Promise<ProviderInfo[]> {
	const creds = await scanCliProxyApi();

	const providers: ProviderInfo[] = [];

	// Add ~/.qwen/oauth_creds.json
	try {
		const creds2 = await readQwenCreds();
		if (creds2?.access_token) {
			providers.push({
				type: "qwen",
				email: "direct",
				expired: creds2.expiry_date ? new Date(creds2.expiry_date).toISOString() : undefined,
			});
		}
	} catch { }

	// Add cli-proxy-api creds
	providers.push(...creds.map(c => ({ type: c.type, email: c.email, expired: c.expired })));

	return providers;
}
