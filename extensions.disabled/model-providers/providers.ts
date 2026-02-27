import type { ProviderConfig } from "@mariozechner/pi-coding-agent";

export interface ProviderAdapter {
  name: string;
  enabled?: () => boolean | Promise<boolean>;
  build: () => Promise<ProviderConfig>;
}

// ============ Token Resolver Scripts ============
// These scripts are executed by pi because apiKey starts with "!"

function buildQwenTokenResolverCommand(): string {
  // Self-healing resolver: read valid token, sync-refresh when expired, then fallback.
  const script = [
    "const fs=require('fs');const os=require('os');const path=require('path');const cp=require('child_process');",
    "const home=os.homedir();const now=Date.now();",
    "const qwen=path.join(home,'.qwen','oauth_creds.json');",
    "const dir=path.join(home,'.cli-proxy-api');",
    "const read=(p)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return null}};",
    "const write=(p,d)=>{try{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(d,null,2));return true}catch{return false}};",
    "const valid=(d)=>{const t=d&&d.access_token;const e=Number(d&&d.expiry_date||0);return !!(t&&e>now+60*1000)};",
    "const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.startsWith('qwen-')&&f.endsWith('.json')).map(f=>path.join(dir,f)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs):[];",
    "const refresh=(rt)=>{try{const body='grant_type=refresh_token&refresh_token='+encodeURIComponent(rt)+'&client_id=acmeshell';const out=cp.execFileSync('curl',['-s','-X','POST','https://oauth.qwen.ai/oauth/token','-H','Content-Type: application/x-www-form-urlencoded','-H','Accept: application/json','--data',body],{encoding:'utf8'});const j=JSON.parse(out);if(!j.access_token)return null;return {access_token:j.access_token,refresh_token:j.refresh_token||rt,expiry_date:now+Number(j.expires_in||3600)*1000};}catch{return null}};",
    "let d=fs.existsSync(qwen)?read(qwen):null;",
    "for(const f of files){const x=read(f);if(!x||x.disabled)continue;if(valid(x)){console.log(x.access_token||x.api_key);process.exit(0)}}",
    "if(valid(d)){console.log(d.access_token);process.exit(0)}",
    "const cands=[];for(const f of files){const x=read(f);if(x&&x.refresh_token&&!x.disabled)cands.push({file:f,data:x});}if(d&&d.refresh_token)cands.push({file:qwen,data:d});",
    "for(const c of cands){const r=refresh(c.data.refresh_token);if(!r)continue;const merged={...c.data,...r,last_refresh:Date.now()};write(c.file,merged);write(qwen,merged);console.log(merged.access_token);process.exit(0)}",
    "for(const f of files){const x=read(f);if(!x||x.disabled)continue;const t=x.access_token||x.api_key;if(t){console.log(t);process.exit(0)}}",
    "if(d&&d.access_token){console.log(d.access_token);process.exit(0)}",
  ].join("");

  const encoded = Buffer.from(script, "utf8").toString("base64");
  return `!node -e "eval(Buffer.from('${encoded}','base64').toString())"`;
}

function buildIflowTokenResolverCommand(): string {
  const script = [
    "const fs=require('fs');const os=require('os');const path=require('path');",
    "const home=os.homedir();",
    "const now=Date.now();",
    "const dir=path.join(home,'.cli-proxy-api');",
    "if(!fs.existsSync(dir)){console.log('');process.exit(0);}",
    "const files=fs.readdirSync(dir).filter(f=>f.startsWith('iflow-')&&f.endsWith('.json')).map(f=>path.join(dir,f)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);",
    "for(const f of files){try{const d=JSON.parse(fs.readFileSync(f,'utf8'));if(d.disabled)continue;const t=d.api_key||d.access_token;if(t){console.log(t);break;}}catch{}}",
  ].join("");

  const encoded = Buffer.from(script, "utf8").toString("base64");
  return `!node -e "eval(Buffer.from('${encoded}','base64').toString())"`;
}

// ============ Adapters ============

export const qwenAdapter: ProviderAdapter = {
  name: "qwen-oauth",
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
      models: [
        {
          id: "coder-model",
          name: "Qwen 3.5 Plus",
          reasoning: true,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000000,
          maxTokens: 6400000,
          compat: {
            supportsDeveloperRole: false,
            maxTokensField: "max_completion_tokens"
          }
        },
        {
          id: "vision-model",
          name: "Qwen Vision",
          reasoning: true,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 256000,
          maxTokens: 16384,
          compat: {
            supportsDeveloperRole: false,
            maxTokensField: "max_completion_tokens"
          }
        },
      ],
    };
  },
};

export const iflowAdapter: ProviderAdapter = {
  name: "iflow",
  enabled: async () => {
    // Only enable if token files exist
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const dir = path.join(os.homedir(), ".cli-proxy-api");
    if (!fs.existsSync(dir)) return false;
    const files = fs.readdirSync(dir).filter((f: string) => f.startsWith("iflow-") && f.endsWith(".json"));
    return files.length > 0;
  },
  async build() {
    return {
      baseUrl: "https://api.iflow.cn/v1",
      api: "openai-completions",
      authHeader: true,
      apiKey: buildIflowTokenResolverCommand(),
      headers: {
        "X-Platform": "cli-proxy-api",
      },
      models: [
        {
          id: "qwen-max",
          name: "iFlow Qwen Max",
          reasoning: true,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 32000,
          maxTokens: 8192,
          compat: {
            supportsDeveloperRole: false,
            maxTokensField: "max_completion_tokens"
          }
        },
        {
          id: "qwen-plus",
          name: "iFlow Qwen Plus",
          reasoning: true,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 8192,
          compat: {
            supportsDeveloperRole: false,
            maxTokensField: "max_completion_tokens"
          }
        },
        {
          id: "qwen-coder-plus",
          name: "iFlow Qwen Coder Plus",
          reasoning: true,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 8192,
          compat: {
            supportsDeveloperRole: false,
            maxTokensField: "max_completion_tokens"
          }
        },
      ],
    };
  },
};

export function getBuiltinAdapters(): ProviderAdapter[] {
  // Only qwen is enabled by default
  // Add iflowAdapter here to enable iFlow support
  return [qwenAdapter];
}
