import type { ProviderConfig } from "@mariozechner/pi-coding-agent";

export interface ProviderAdapter {
  name: string;
  enabled?: () => boolean | Promise<boolean>;
  build: () => Promise<ProviderConfig>;
}

function buildQwenTokenResolverCommand(): string {
  // pi will execute this because apiKey starts with "!"
  // Use node one-liner to avoid shell/python indentation pitfalls.
  const script = [
    "const fs=require('fs');const os=require('os');const path=require('path');",
    "const home=os.homedir();",
    "const now=Date.now();",
    "const qwen=path.join(home,'.qwen','oauth_creds.json');",
    "if(fs.existsSync(qwen)){try{const d=JSON.parse(fs.readFileSync(qwen,'utf8'));const t=d.access_token;const e=Number(d.expiry_date||0);if(t&&e>now){console.log(t);process.exit(0);}}catch{}}",
    "const dir=path.join(home,'.cli-proxy-api');",
    "if(!fs.existsSync(dir))process.exit(0);",
    "const files=fs.readdirSync(dir).filter(f=>f.startsWith('qwen-')&&f.endsWith('.json')).map(f=>path.join(dir,f)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);",
    "for(const f of files){try{const d=JSON.parse(fs.readFileSync(f,'utf8'));if(d.disabled)continue;const t=d.access_token||d.api_key;if(t){console.log(t);break;}}catch{}}",
  ].join("");

  return `!node -e \"${script.replace(/\"/g, '\\\\"')}\"`;
}

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

export function getBuiltinAdapters(): ProviderAdapter[] {
  return [qwenAdapter];
}
