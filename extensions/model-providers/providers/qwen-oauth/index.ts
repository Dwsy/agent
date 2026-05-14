/**
 * Qwen OAuth Provider Plugin
 * 
 * Token storage priority (with automatic fallback):
 * 1. ~/.pi/agent/auth.json (pi native, like kilo) - HIGHEST
 * 2. ~/.qwen/oauth_creds.json (Qwen CLI)
 * 3. ~/.cli-proxy-api/qwen-*.json (CLIProxyAPI) - LOWEST
 */

import type { ProviderConfig, ModelConfig } from "@earendil-works/pi-coding-agent";
import type { OAuthLoginCallbacks, OAuthCredentials } from "@earendil-works/pi-ai";
import { homedir } from "node:os";
import { join } from "node:path";

const QWEN_OAUTH = {
  deviceCodeEndpoint: "https://chat.qwen.ai/api/v1/oauth2/device/code",
  tokenEndpoint: "https://chat.qwen.ai/api/v1/oauth2/token",
  clientId: "f0304373b74a44d2b584a3fb70ca9e56",
  scope: "openid profile email model.completion",
  piAuthFile: join(homedir(), ".pi", "agent", "auth.json"),
  qwenCliFile: join(homedir(), ".qwen", "oauth_creds.json"),
  cliProxyDir: join(homedir(), ".cli-proxy-api"),
};

// Only 2 models, both with contextWindow: 256000
const QWEN_MODELS: ModelConfig[] = [
  {
    id: "coder-model",
    name: "Qwen 3.5 Plus",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.40, output: 1.20, cacheRead: 0.15, cacheWrite: 0 },
    contextWindow: 1000000,
    maxTokens: 32000,
    compat: { supportsDeveloperRole: false, maxTokensField: "max_completion_tokens" },
  },
  {
    id: "vision-model",
    name: "Qwen Vision",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 2.0, output: 6.0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256000,
    maxTokens: 128000,
    compat: { supportsDeveloperRole: false, maxTokensField: "max_completion_tokens" },
  },
];

// ============ Token Storage (pi native - like kilo) ============

function readPiAuth(): any {
  try {
    const fs = require("fs");
    if (!fs.existsSync(QWEN_OAUTH.piAuthFile)) return null;
    return JSON.parse(fs.readFileSync(QWEN_OAUTH.piAuthFile, "utf8"));
  } catch {
    return null;
  }
}

function writePiAuth(data: any): void {
  const fs = require("fs");
  const path = require("path");
  fs.mkdirSync(path.dirname(QWEN_OAUTH.piAuthFile), { recursive: true });
  fs.writeFileSync(QWEN_OAUTH.piAuthFile, JSON.stringify(data, null, 2));
}

function getQwenCredentials(): OAuthCredentials | null {
  const auth = readPiAuth();
  const qwen = auth?.["qwen-oauth"];
  if (!qwen || qwen.type !== "oauth") return null;
  return {
    access: qwen.access,
    refresh: qwen.refresh,
    expires: qwen.expires || 0,
    email: qwen.email,
  };
}

function saveQwenCredentials(creds: OAuthCredentials): void {
  const auth = readPiAuth() || {};
  auth["qwen-oauth"] = {
    type: "oauth",
    access: creds.access,
    refresh: creds.refresh,
    expires: creds.expires,
    email: creds.email,
  };
  writePiAuth(auth);
}

// ============ OAuth Login Flow ============

function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const crypto = require("crypto");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

async function initiateDeviceCode(): Promise<{
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
  codeVerifier: string;
}> {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const params = new URLSearchParams({
    client_id: QWEN_OAUTH.clientId,
    scope: QWEN_OAUTH.scope,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const response = await fetch(QWEN_OAUTH.deviceCodeEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });

  if (!response.ok) throw new Error(`Device code request failed: ${response.status}`);
  const data = await response.json();
  return { ...data, codeVerifier };
}

async function pollForToken(
  deviceCode: string,
  codeVerifier: string,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<OAuthCredentials> {
  const pollInterval = 5000;
  const maxAttempts = 60;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error("Authentication cancelled");

    const params = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: QWEN_OAUTH.clientId,
      device_code: deviceCode,
      code_verifier: codeVerifier,
    });

    const response = await fetch(QWEN_OAUTH.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: params.toString(),
    });

    const body = await response.text();

    if (response.status !== 200) {
      const errorData = JSON.parse(body);
      const errorType = errorData.error;

      if (errorType === "authorization_pending") {
        onProgress?.(`Waiting... (${attempt + 1}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, pollInterval));
        continue;
      }
      if (errorType === "slow_down") {
        onProgress?.("Slowing down...");
        await new Promise((r) => setTimeout(r, pollInterval * 1.5));
        continue;
      }
      if (errorType === "expired_token") throw new Error("Device code expired");
      if (errorType === "access_denied") throw new Error("Authorization denied");
      throw new Error(`Token poll failed: ${errorType} - ${errorData.error_description}`);
    }

    const tokenData = JSON.parse(body);
    return {
      access: tokenData.access_token,
      refresh: tokenData.refresh_token,
      expires: Date.now() + tokenData.expires_in * 1000,
    };
  }

  throw new Error("Authentication timeout");
}

export async function loginQwen(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  callbacks.onProgress?.("Initiating device authorization...");

  const deviceFlow = await initiateDeviceCode();
  const { device_code, user_code, verification_uri_complete, expires_in, codeVerifier } = deviceFlow;

  callbacks.onAuth({
    url: verification_uri_complete,
    instructions: `Enter code: ${user_code}`,
  });

  callbacks.onProgress?.(`Waiting... Expires in ${Math.floor(expires_in / 60)}min`);

  const credentials = await pollForToken(device_code, codeVerifier, callbacks.onProgress, callbacks.signal);
  saveQwenCredentials(credentials);
  callbacks.onProgress?.(`Login successful! Saved to ${QWEN_OAUTH.piAuthFile}`);

  return credentials;
}

export async function refreshQwenToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  if (credentials.expires > Date.now() + 5 * 60 * 1000) return credentials;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credentials.refresh,
    client_id: QWEN_OAUTH.clientId,
  });

  const response = await fetch(QWEN_OAUTH.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const refreshed: OAuthCredentials = {
    access: data.access_token,
    refresh: data.refresh_token || credentials.refresh,
    expires: Date.now() + data.expires_in * 1000,
    email: credentials.email,
  };

  saveQwenCredentials(refreshed);
  return refreshed;
}

// ============ Token Resolver (Automatic Fallback) ============

function buildQwenTokenResolverCommand(): string {
  const script = [
    "const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');",
    "const home=os.homedir(),now=Date.now();",
    "const piAuth=path.join(home,'.pi','agent','auth.json');",
    "const qwenCli=path.join(home,'.qwen','oauth_creds.json');",
    "const cliDir=path.join(home,'.cli-proxy-api');",
    "const valid=(e)=>e&&e>now+300*1000;",
    
    // Priority 1: pi native
    "try{const auth=JSON.parse(fs.readFileSync(piAuth,'utf8'));const q=auth['qwen-oauth'];if(q&&q.type==='oauth'&&valid(q.expires)){console.log(q.access);process.exit(0)}}catch(e){}",
    
    // Priority 2: Qwen CLI
    "try{const d=JSON.parse(fs.readFileSync(qwenCli,'utf8'));if(valid(d.expiry_date)){console.log(d.access_token);process.exit(0)}}catch(e){}",
    
    // Priority 3: CLIProxyAPI
    "try{if(fs.existsSync(cliDir)){const files=fs.readdirSync(cliDir).filter(f=>f.startsWith('qwen-')&&f.endsWith('.json')).sort().reverse();for(const f of files){const d=JSON.parse(fs.readFileSync(path.join(cliDir,f),'utf8'));if(valid(d.expiry_date)){console.log(d.access_token);process.exit(0)}}}}catch(e){}",
    
    // Try refresh
    "try{const auth=JSON.parse(fs.readFileSync(piAuth,'utf8'));const q=auth['qwen-oauth'];if(q&&q.refresh){const body='grant_type=refresh_token&refresh_token='+encodeURIComponent(q.refresh)+'&client_id=f0304373b74a44d2b584a3fb70ca9e56';const out=cp.execFileSync('curl',['-s','-X','POST','https://chat.qwen.ai/api/v1/oauth2/token','-H','Content-Type: application/x-www-form-urlencoded','--data',body],{encoding:'utf8'});const j=JSON.parse(out);if(j.access_token){auth['qwen-oauth']={type:'oauth',access:j.access_token,refresh:j.refresh_token||q.refresh,expires:now+Number(j.expires_in||3600)*1000};fs.writeFileSync(piAuth,JSON.stringify(auth,null,2));console.log(j.access_token);process.exit(0)}}}catch(e){}",
    
    // Fallback: use any token
    "try{const auth=JSON.parse(fs.readFileSync(piAuth,'utf8'));const q=auth['qwen-oauth'];if(q&&q.access){console.log(q.access);process.exit(0)}}catch(e){}",
    "try{const d=JSON.parse(fs.readFileSync(qwenCli,'utf8'));if(d.access_token){console.log(d.access_token);process.exit(0)}}catch(e){}",
    "try{if(fs.existsSync(cliDir)){const files=fs.readdirSync(cliDir).filter(f=>f.startsWith('qwen-')&&f.endsWith('.json')).sort().reverse();for(const f of files){const d=JSON.parse(fs.readFileSync(path.join(cliDir,f),'utf8'));if(d.access_token){console.log(d.access_token);process.exit(0)}}}}catch(e){}",
    
    "process.exit(0);",
  ].join("");

  const encoded = Buffer.from(script, "utf8").toString("base64");
  return `!node -e "eval(Buffer.from('${encoded}','base64').toString())"`;
}

// ============ Public API (for token-refresh.ts) ============

/**
 * Refresh Qwen token using pi native auth storage
 * Returns true if refresh succeeded, false otherwise
 */
export async function refreshQwen(): Promise<boolean> {
  const creds = getQwenCredentials();
  if (!creds) {
    console.log("[Qwen] No stored credentials found");
    return false;
  }

  try {
    const refreshed = await refreshQwenToken(creds);
    console.log(`[Qwen] Token refreshed, expires: ${new Date(refreshed.expires).toISOString()}`);
    return true;
  } catch (e: any) {
    console.error(`[Qwen] Token refresh failed: ${e.message}`);
    return false;
  }
}

// ============ Provider Adapter ============

export interface ProviderAdapter {
  name: string;
  enabled?: () => boolean | Promise<boolean>;
  build: () => Promise<ProviderConfig>;
}

export const qwenOAuthAdapter: ProviderAdapter = {
  name: "qwen-oauth",
  async enabled() {
    // Always enable so OAuth provider appears in /login list
    return true;
  },
  async build() {
    return {
      baseUrl: "https://portal.qwen.ai/v1",
      api: "openai-completions",
      authHeader: true,
      apiKey: buildQwenTokenResolverCommand(),
      headers: {
        "X-DashScope-AuthType": "qwen-oauth",
        "X-DashScope-CacheControl": "enable",
        "X-DashScope-UserAgent": "QwenCode/0.10.3 (darwin; arm64)",
      },
      models: QWEN_MODELS,
      oauth: {
        name: "Qwen Code (Qwen CLI)",
        login: loginQwen,
        refreshToken: refreshQwenToken,
        getApiKey: (creds: OAuthCredentials) => creds.access,
      },
    };
  },
};
