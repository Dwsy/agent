#!/usr/bin/env bun

/**
 * Pi Models Manager - 模型配置文件管理工具
 * 
 * 用法:
 *   bun models.ts <command> [options]
 * 
 * 示例:
 *   bun models.ts list                    # 列出所有模型
 *   bun models.ts add provider pox ...    # 添加 provider
 *   bun models.ts add model pox ...       # 添加模型
 *   bun models.ts test pox gpt-5.4        # 测试模型
 *   bun models.ts rm provider pox         # 删除 provider
 *   bun models.ts rm model pox gpt-5.4   # 删除模型
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

// ============== 类型定义 ==============

interface ModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface Model {
  id: string;
  name?: string;
  api?: string;
  baseUrl?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  output?: ("text" | "image")[];
  cost?: ModelCost;
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
}

interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
  compat?: Record<string, unknown>;
  models?: Model[];
  modelOverrides?: Record<string, Partial<Model>>;
}

interface ModelsConfig {
  providers: Record<string, ProviderConfig>;
}

// ============== 常量 ==============

const MODELS_JSON_PATH = resolve(process.env.HOME!, ".pi/agent/models.json");

const API_TYPES = [
  "openai-responses",
  "openai-completions", 
  "anthropic-messages",
  "google-generative-ai",
  "google-gemini-cli",
  "google-vertex",
  "azure-openai-responses",
  "bedrock-converse-stream",
  "mistral-conversations",
];

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const color = {
  bold: (s: string) => `${COLORS.bold}${s}${COLORS.reset}`,
  dim: (s: string) => `${COLORS.dim}${s}${COLORS.reset}`,
  red: (s: string) => `${COLORS.red}${s}${COLORS.reset}`,
  green: (s: string) => `${COLORS.green}${s}${COLORS.reset}`,
  yellow: (s: string) => `${COLORS.yellow}${s}${COLORS.reset}`,
  blue: (s: string) => `${COLORS.blue}${s}${COLORS.reset}`,
  cyan: (s: string) => `${COLORS.cyan}${s}${COLORS.reset}`,
  magenta: (s: string) => `${COLORS.magenta}${s}${COLORS.reset}`,
  white: (s: string) => s,  // Use default terminal color
};

// ============== 工具函数 ==============

function loadConfig(): ModelsConfig {
  if (!existsSync(MODELS_JSON_PATH)) {
    return { providers: {} };
  }
  try {
    const content = readFileSync(MODELS_JSON_PATH, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    console.error(color.red(`Failed to load config: ${e}`));
    process.exit(1);
  }
}

function saveConfig(config: ModelsConfig): void {
  const content = JSON.stringify(config, null, 2) + "\n";
  writeFileSync(MODELS_JSON_PATH, content, "utf-8");
}

function validateJson(): boolean {
  if (!existsSync(MODELS_JSON_PATH)) {
    console.error(color.red(`Config file not found: ${MODELS_JSON_PATH}`));
    return false;
  }
  try {
    const content = readFileSync(MODELS_JSON_PATH, "utf-8");
    JSON.parse(content);
    return true;
  } catch (e) {
    console.error(color.red(`Invalid JSON: ${e}`));
    return false;
  }
}

function formatCost(cost: ModelCost): string {
  const formatPrice = (n: number) => n === 0 ? "free" : `$${n}/M`;
  return `[in:${formatPrice(cost.input)} out:${formatPrice(cost.output)}]`;
}

// ============== 命令实现 ==============

async function cmdList(args: { provider?: string; json?: boolean }) {
  const config = loadConfig();
  
  if (args.json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  const providers = Object.entries(config.providers);
  
  if (providers.length === 0) {
    console.log(color.yellow("No providers configured. Run 'bun models.ts add provider' to add one."));
    return;
  }

  console.log(color.bold(`\n📦 Providers (${providers.length})\n`));
  
  for (const [name, provider] of providers) {
    const modelCount = provider.models?.length ?? 0;
    console.log(color.cyan(`  ${name}`) + color.dim(` (${modelCount} models)`));
    
    if (args.provider && args.provider === name) {
      if (provider.baseUrl) console.log(`    baseUrl: ${provider.baseUrl}`);
      if (provider.api) console.log(`    api: ${provider.api}`);
      if (provider.authHeader) console.log(`    authHeader: true`);
      
      if (provider.models && provider.models.length > 0) {
        console.log(color.bold(`\n    Models:`));
        for (const model of provider.models) {
          const reasoning = model.reasoning ? color.green("🧠") : color.dim("○ ");
          const cost = model.cost ? formatCost(model.cost) : "";
          const tokens = model.contextWindow ? `ctx:${model.contextWindow.toLocaleString()}` : "";
          console.log(`    ${reasoning} ${color.white(model.id)} ${color.dim(cost + " " + tokens)}`);
          if (model.name && model.name !== model.id) {
            console.log(`        ${color.dim(model.name)}`);
          }
        }
      }
    }
    console.log();
  }
}

async function cmdAddProvider(args: {
  name: string;
  baseUrl: string;
  apiKey?: string;
  api?: string;
  authHeader?: boolean;
}) {
  const config = loadConfig();
  
  if (config.providers[args.name]) {
    console.error(color.red(`Provider '${args.name}' already exists.`));
    process.exit(1);
  }

  const api = args.api ?? "openai-responses";
  if (!API_TYPES.includes(api)) {
    console.error(color.red(`Invalid API type: ${api}`));
    console.log(`Valid types: ${API_TYPES.join(", ")}`);
    process.exit(1);
  }

  config.providers[args.name] = {
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    api,
    authHeader: args.authHeader ?? true,
    models: [],
  };

  saveConfig(config);
  console.log(color.green(`✓ Provider '${args.name}' added`));
  console.log(color.dim(`  Path: ${MODELS_JSON_PATH}`));
}

async function cmdAddModel(args: {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  costInput?: number;
  costOutput?: number;
}) {
  const config = loadConfig();
  
  if (!config.providers[args.provider]) {
    console.error(color.red(`Provider '${args.provider}' not found.`));
    console.log(color.dim(`Run 'bun models.ts add provider ${args.provider} ...' first.`));
    process.exit(1);
  }

  const provider = config.providers[args.provider];
  provider.models = provider.models ?? [];

  if (provider.models.some(m => m.id === args.id)) {
    console.error(color.red(`Model '${args.id}' already exists in provider '${args.provider}'.`));
    process.exit(1);
  }

  const model: Model = {
    id: args.id,
    name: args.name ?? args.id,
    reasoning: args.reasoning ?? false,
    input: ["text"],
    output: ["text"],
    cost: {
      input: args.costInput ?? 0,
      output: args.costOutput ?? 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: args.contextWindow ?? 128000,
    maxTokens: args.maxTokens ?? 16384,
  };

  provider.models.push(model);
  saveConfig(config);
  console.log(color.green(`✓ Model '${args.id}' added to '${args.provider}'`));
}

async function cmdRemove(args: {
  type: "provider" | "model";
  provider: string;
  modelId?: string;
}) {
  const config = loadConfig();
  
  if (!config.providers[args.provider]) {
    console.error(color.red(`Provider '${args.provider}' not found.`));
    process.exit(1);
  }

  if (args.type === "provider") {
    delete config.providers[args.provider];
    saveConfig(config);
    console.log(color.green(`✓ Provider '${args.provider}' removed`));
  } else if (args.type === "model" && args.modelId) {
    const provider = config.providers[args.provider];
    const idx = provider.models?.findIndex(m => m.id === args.modelId) ?? -1;
    if (idx === -1) {
      console.error(color.red(`Model '${args.modelId}' not found in '${args.provider}'.`));
      process.exit(1);
    }
    provider.models!.splice(idx, 1);
    saveConfig(config);
    console.log(color.green(`✓ Model '${args.modelId}' removed from '${args.provider}'`));
  }
}

interface TestOptions {
  provider: string;
  model?: string;
  message?: string;
  stream?: boolean;
  reasoning?: boolean;
  thinkingLevel?: string;
  tools?: boolean;
}

// ============== 测试 API ==============

interface TestResult {
  success: boolean;
  status?: number;
  latency?: number;
  response?: string;
  error?: string;
  parsed?: Record<string, unknown>;
}

function buildAnthropicRequest(baseUrl: string, modelId: string, apiKey: string, message: string, options: TestOptions): { url: string; body: Record<string, unknown>; headers: Record<string, string> } {
  const body: Record<string, unknown> = {
    model: modelId,
    max_tokens: 10,
    messages: [{ role: "user", content: message }],
  };
  
  if (options.reasoning && options.thinkingLevel) {
    body.thinking = {
      type: "enabled" as const,
      budget_tokens: getThinkingBudget(options.thinkingLevel),
    };
  }
  
  if (options.stream) {
    body.stream = true;
  }
  
  return {
    url: `${baseUrl}/v1/messages`,
    body,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
  };
}

function buildOpenAIResponsesRequest(baseUrl: string, modelId: string, apiKey: string, message: string, options: TestOptions): { url: string; body: Record<string, unknown>; headers: Record<string, string> } {
  const body: Record<string, unknown> = {
    model: modelId,
    input: message,
  };
  
  if (options.reasoning) {
    body.reasoning = {};
    if (options.thinkingLevel) {
      (body.reasoning as Record<string, unknown>).effort = options.thinkingLevel;
    }
  }
  
  if (options.stream) {
    body.stream = true;
  }
  
  return {
    url: `${baseUrl}/responses`,
    body,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  };
}

function buildOpenAIChatRequest(baseUrl: string, modelId: string, apiKey: string, message: string, options: TestOptions): { url: string; body: Record<string, unknown>; headers: Record<string, string> } {
  const body: Record<string, unknown> = {
    model: modelId,
    max_tokens: 10,
    messages: [{ role: "user", content: message }],
    stream: options.stream ?? false,
  };
  
  if (options.reasoning && options.thinkingLevel) {
    // OpenAI uses reasoning_effort
    body.reasoning = { effort: options.thinkingLevel };
  }
  
  return {
    url: `${baseUrl}/chat/completions`,
    body,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  };
}

function buildGoogleRequest(baseUrl: string, modelId: string, apiKey: string, message: string, options: TestOptions): { url: string; body: Record<string, unknown>; headers: Record<string, string> } {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: message }] }],
    generationConfig: {
      maxOutputTokens: 10,
    },
  };
  
  if (options.reasoning) {
    body.generationConfig!["thinkingConfig"] = {
      thinkingBudget: options.thinkingLevel ? getThinkingBudget(options.thinkingLevel) : 1024,
    };
  }
  
  if (options.stream) {
    body.generationConfig!["responseModalities"] = ["TEXT"];
  }
  
  // Extract model name from full path if needed
  const modelName = modelId.includes("/") ? modelId.split("/").pop() : modelId;
  
  return {
    url: `${baseUrl}/v1beta/models/${modelName}:generateContent`,
    body,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  };
}

function buildAzureRequest(baseUrl: string, modelId: string, apiKey: string, message: string, options: TestOptions): { url: string; body: Record<string, unknown>; headers: Record<string, string> } {
  const body: Record<string, unknown> = {
    model: modelId,
    input: message,
  };
  
  if (options.reasoning) {
    body.reasoning = {};
  }
  
  if (options.stream) {
    body.stream = true;
  }
  
  return {
    url: `${baseUrl}/openai/deployments/${modelId}/responses?api-version=2024-12-01-preview`,
    body,
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
    },
  };
}

function buildMistralRequest(baseUrl: string, modelId: string, apiKey: string, message: string, options: TestOptions): { url: string; body: Record<string, unknown>; headers: Record<string, string> } {
  const body: Record<string, unknown> = {
    model: modelId,
    messages: [{ role: "user", content: message }],
    max_tokens: options.reasoning ? 1024 : 256,
  };
  
  if (options.reasoning) {
    body.reasoning = { type: "enabled" };
  }
  
  if (options.stream) {
    body.stream = true;
  }
  
  return {
    url: `${baseUrl}/v1/chat/completions`,
    body,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  };
}

function getThinkingBudget(level: string): number {
  const budgets: Record<string, number> = {
    minimal: 1024,
    low: 2048,
    medium: 4096,
    high: 8192,
    xhigh: 16384,
    off: 0,
  };
  return budgets[level] ?? 4096;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function extractTextFromResponse(api: string, data: Record<string, unknown>): string {
  try {
    if (api === "anthropic-messages") {
      const output = data.output as Array<Record<string, unknown>> | undefined;
      if (output && output.length > 0) {
        const content = output[0] as Record<string, unknown>;
        if (content.type === "message") {
          const msg = content as { content: Array<{ type: string; text?: string }> };
          return msg.content.find(c => c.type === "text")?.text ?? "";
        }
        if (content.type === "text") {
          return (content as { text?: string }).text ?? "";
        }
      }
    } else if (api === "openai-responses") {
      const output = data.output as Array<Record<string, unknown>> | undefined;
      if (output && output.length > 0) {
        const item = output[0];
        if (item.type === "message") {
          const msg = item as { content: Array<{ type: string; text?: string }> };
          return msg.content.find(c => c.type === "output_text")?.text ?? "";
        }
        if (item.type === "text") {
          return (item as { text?: string }).text ?? "";
        }
      }
    } else {
      // OpenAI chat completions
      const choices = data.choices as Array<Record<string, unknown>> | undefined;
      if (choices && choices.length > 0) {
        const choice = choices[0];
        const msg = choice.message as Record<string, unknown> | undefined;
        if (msg) return msg.content as string ?? "";
        if (choice.finish_reason) return `[${choice.finish_reason}]`;
      }
    }
  } catch {}
  return "";
}

async function performStreamTest(endpoint: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<TestResult> {
  const startTime = Date.now();
  let chunkCount = 0;
  let firstChunkTime = 0;
  let lastChunkTime = startTime;
  
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    
    if (!response.ok) {
      const text = await response.text();
      return { success: false, status: response.status, latency: Date.now() - startTime, error: text.slice(0, 500) };
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, latency: Date.now() - startTime, error: "No response body" };
    }
    
    const decoder = new TextDecoder();
    let buffer = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunkCount++;
      if (chunkCount === 1) firstChunkTime = Date.now() - startTime;
      lastChunkTime = Date.now() - startTime;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Parse SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            // Just count chunks, don't accumulate
          } catch {}
        }
      }
    }
    
    return {
      success: true,
      status: response.status,
      latency: lastChunkTime,
      response: `Stream completed: ${chunkCount} chunks in ${formatLatency(lastChunkTime)}`,
    };
  } catch (e) {
    return { success: false, latency: Date.now() - startTime, error: String(e) };
  }
}

async function performRequest(endpoint: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    
    const latency = Date.now() - startTime;
    const data = await response.text();
    
    if (!response.ok) {
      return { success: false, status: response.status, latency, error: data.slice(0, 500) };
    }
    
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(data);
    } catch {}
    
    return { success: true, status: response.status, latency, response: data.slice(0, 1000), parsed };
  } catch (e) {
    return { success: false, latency: Date.now() - startTime, error: String(e) };
  }
}

async function cmdTest(args: TestOptions) {
  const config = loadConfig();
  
  if (!config.providers[args.provider]) {
    console.error(color.red(`Provider '${args.provider}' not found.`));
    process.exit(1);
  }

  const provider = config.providers[args.provider];
  
  if (!provider.baseUrl || !provider.models || provider.models.length === 0) {
    console.error(color.red(`Provider '${args.provider}' has no models configured.`));
    process.exit(1);
  }

  const model = args.model 
    ? provider.models.find(m => m.id === args.model)
    : provider.models[0];

  if (!model) {
    console.error(color.red(`Model '${args.model}' not found.`));
    process.exit(1);
  }

  const testMessage = args.message ?? "Reply 'OK' in one word.";
  const api = provider.api ?? "openai-responses";
  const apiKey = provider.apiKey ?? "";
  
  console.log(color.bold(`\n🧪 Testing ${args.provider}/${model.id}\n`));
  console.log(color.dim(`  API: ${api}`));
  console.log(color.dim(`  URL: ${provider.baseUrl}`));
  console.log(color.dim(`  Message: "${testMessage}"`));
  if (args.reasoning) {
    console.log(color.dim(`  Reasoning: ${args.thinkingLevel ?? "enabled"}`));
  }
  if (args.stream) {
    console.log(color.dim(`  Stream: enabled`));
  }
  console.log();
  
  let request: { url: string; body: Record<string, unknown>; headers: Record<string, string> };
  
  // Build request based on API type
  switch (api) {
    case "anthropic-messages":
      request = buildAnthropicRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "openai-responses":
      request = buildOpenAIResponsesRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "google-generative-ai":
    case "google-gemini-cli":
      request = buildGoogleRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "azure-openai-responses":
      request = buildAzureRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "mistral-conversations":
      request = buildMistralRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "openai-completions":
    default:
      request = buildOpenAIChatRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
  }
  
  console.log(color.dim(`  POST ${request.url}\n`));
  
  let result: TestResult;
  if (args.stream) {
    result = await performStreamTest(request.url, request.headers, request.body);
  } else {
    result = await performRequest(request.url, request.headers, request.body);
  }
  
  if (result.success) {
    console.log(color.green(`✓ Status: ${result.status} (${formatLatency(result.latency!)})`));
    
    if (result.response && !args.stream) {
      const text = extractTextFromResponse(api, result.parsed ?? {});
      if (text) {
        console.log(color.green(`  Response: "${text}"`));
      }
    } else if (result.response) {
      console.log(color.green(`  ${result.response}`));
    }
    
    if (result.parsed && !args.stream) {
      const usage = result.parsed.usage ?? (result.parsed as Record<string, unknown>).usage;
      if (usage) {
        console.log(color.dim(`  Usage: ${JSON.stringify(usage)}`));
      }
    }
  } else {
    console.log(color.red(`✗ Status: ${result.status ?? "Error"}`));
    console.log(color.red(`  ${result.error}`));
    process.exit(1);
  }
}

interface BatchOptions {
  provider: string;
  stream?: boolean;
  reasoning?: boolean;
  all?: boolean;
}

async function cmdBatch(args: BatchOptions) {
  const config = loadConfig();
  
  const providersToTest = args.all 
    ? Object.entries(config.providers)
    : [[args.provider, config.providers[args.provider]]] as [string, ProviderConfig][];
  
  // Build all test tasks
  const allTasks: { provider: string; model: string; testArgs: TestOptions }[] = [];
  
  for (const [pName, provider] of providersToTest) {
    if (!provider.models || provider.models.length === 0) continue;
    for (const model of provider.models) {
      allTasks.push({
        provider: pName,
        model: model.id,
        testArgs: {
          provider: pName,
          model: model.id,
          message: "Reply 'OK' in one word.",
          reasoning: args.reasoning,
          thinkingLevel: "medium",
        },
      });
    }
  }
  
  console.log(color.bold(`\n🚀 Batch Testing ${allTasks.length} models across ${providersToTest.length} providers (parallel)\n`));
  
  // Run all tests in parallel with concurrency limit
  const CONCURRENCY = 10;
  const results: { provider: string; model: string; success: boolean; latency?: number; error?: string }[] = [];
  
  for (let i = 0; i < allTasks.length; i += CONCURRENCY) {
    const batch = allTasks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (task) => {
        try {
          const result = await runSingleTest(task.testArgs);
          return { provider: task.provider, model: task.model, ...result };
        } catch (e) {
          return { provider: task.provider, model: task.model, success: false, error: String(e) };
        }
      })
    );
    results.push(...batchResults);
    
    // Progress update
    const done = Math.min(i + CONCURRENCY, allTasks.length);
    const passed = results.filter(r => r.success).length;
    process.stdout.write(`\r  Progress: ${done}/${allTasks.length} | Passed: ${passed}`);
  }
  
  console.log(color.bold(`\n\n${"=".repeat(50)}\n📊 Results`));
  
  // Group by provider
  const byProvider = new Map<string, typeof results>();
  for (const r of results) {
    const list = byProvider.get(r.provider) ?? [];
    list.push(r);
    byProvider.set(r.provider, list);
  }
  
  for (const [pName, pResults] of byProvider) {
    const pPassed = pResults.filter(r => r.success).length;
    const pTotal = pResults.length;
    const colorFn = pPassed === pTotal ? color.green : pPassed > 0 ? color.yellow : color.red;
    console.log(color.bold(`\n  ${pName}`) + color.dim(` (${pPassed}/${pTotal})`));
    
    for (const r of pResults) {
      if (r.success) {
        console.log(color.green(`    ✓ ${r.model}`) + color.dim(` ${r.latency}ms`));
      } else {
        console.log(color.red(`    ✗ ${r.model}`));
        console.log(color.dim(`      ${r.error?.slice(0, 80)}`));
      }
    }
  }
  
  const totalPassed = results.filter(r => r.success).length;
  const totalFailed = results.filter(r => !r.success).length;
  
  console.log(color.bold(`\n${"=".repeat(50)}`));
  console.log(color.bold(`  Total: ${totalPassed}/${results.length} passed`));
  if (totalFailed > 0) {
    console.log(color.red(`  Failed: ${totalFailed}`));
  }
  console.log();
}

interface SingleTestResult {
  success: boolean;
  status?: number;
  latency?: number;
  error?: string;
}

async function runSingleTest(args: TestOptions): Promise<SingleTestResult> {
  const config = loadConfig();
  
  if (!config.providers[args.provider]) {
    return { success: false, error: `Provider '${args.provider}' not found` };
  }

  const provider = config.providers[args.provider];
  
  if (!provider.baseUrl || !provider.models || provider.models.length === 0) {
    return { success: false, error: `Provider has no models` };
  }

  const model = args.model 
    ? provider.models.find(m => m.id === args.model)
    : provider.models[0];

  if (!model) {
    return { success: false, error: `Model '${args.model}' not found` };
  }

  const testMessage = args.message ?? "Reply 'OK' in one word.";
  const api = provider.api ?? "openai-responses";
  const apiKey = provider.apiKey ?? "";
  
  let request: { url: string; body: Record<string, unknown>; headers: Record<string, string> };
  
  switch (api) {
    case "anthropic-messages":
      request = buildAnthropicRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "openai-responses":
      request = buildOpenAIResponsesRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "google-generative-ai":
    case "google-gemini-cli":
      request = buildGoogleRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "azure-openai-responses":
      request = buildAzureRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "mistral-conversations":
      request = buildMistralRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
    case "openai-completions":
    default:
      request = buildOpenAIChatRequest(provider.baseUrl, model.id, apiKey, testMessage, args);
      break;
  }

  const startTime = Date.now();
  
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(60000),
    });
    
    const latency = Date.now() - startTime;
    
    if (response.ok) {
      return { success: true, status: response.status, latency };
    } else {
      const text = await response.text();
      return { success: false, status: response.status, latency, error: text.slice(0, 200) };
    }
  } catch (e) {
    return { success: false, latency: Date.now() - startTime, error: String(e) };
  }
}

async function cmdUpdate(args: { provider?: string }) {
  const config = loadConfig();
  let updated = 0;

  console.log(color.bold("\n📊 Fetching prices from models.dev...\n"));

  try {
    const response = await fetch("https://models.dev/api.json", {
      signal: AbortSignal.timeout(15000),
    });
    const priceData = await response.json() as Record<string, { price?: { input?: number; output?: number } }>;
    
    const providers = args.provider 
      ? [[args.provider, config.providers[args.provider]] as const]
      : Object.entries(config.providers);

    for (const [pName, provider] of providers) {
      if (!provider.models) continue;
      
      for (const model of provider.models) {
        const modelPrice = priceData[model.id]?.price 
          ?? priceData[`openai/${model.id}`]?.price
          ?? priceData[`anthropic/${model.id}`]?.price;
        
        if (modelPrice) {
          model.cost = {
            input: modelPrice.input ?? 0,
            output: modelPrice.output ?? 0,
            cacheRead: 0,
            cacheWrite: 0,
          };
          console.log(color.green(`  ✓ ${pName}/${model.id}`));
          updated++;
        } else {
          console.log(color.dim(`  ○ ${pName}/${model.id} (no price data)`));
        }
      }
    }

    saveConfig(config);
    console.log(color.green(`\n✓ Updated ${updated} models\n`));
  } catch (e) {
    console.error(color.red(`Failed to fetch prices: ${e}`));
    process.exit(1);
  }
}

function cmdExport() {
  const config = loadConfig();
  
  console.log(color.bold("\n📋 Current Configuration\n"));
  console.log(JSON.stringify(config, null, 2));
}

async function cmdTemplate(args: { provider: string }) {
  const templates: Record<string, string> = {
    "openai-compatible": `    "${args.provider}": {
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "sk-your-key",
      "api": "openai-responses",
      "authHeader": true,
      "models": [
        {
          "id": "your-model",
          "name": "Your Model",
          "reasoning": false,
          "input": ["text"],
          "output": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 128000,
          "maxTokens": 16384
        }
      ]
    }`,
    "anthropic-compatible": `    "${args.provider}": {
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "sk-ant-your-key",
      "api": "anthropic-messages",
      "authHeader": true,
      "models": [
        {
          "id": "claude-sonnet-4-5",
          "name": "Claude Sonnet 4.5",
          "reasoning": true,
          "input": ["text", "image"],
          "output": ["text"],
          "cost": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 },
          "contextWindow": 200000,
          "maxTokens": 8192
        }
      ]
    }`,
  };

  const keys = Object.keys(templates);
  const template = templates[args.provider] ?? templates["openai-compatible"];

  console.log(color.bold(`\n📝 Template for "${args.provider}"\n`));
  console.log(template);
  console.log(color.dim(`\nCopy this to your ${MODELS_JSON_PATH}\n`));
}

// ============== 主程序 ==============

function printHelp() {
  console.log(`
${color.bold("Pi Models Manager")} - 模型配置文件管理工具

${color.bold("Usage:")}
  bun models.ts <command> [options]

${color.bold("Commands:")}

  ${color.cyan("list")} [options]
    列出所有 provider 和模型
    --provider <name>  显示指定 provider 详情
    --json             输出 JSON 格式

  ${color.cyan("add provider")} <name> <baseUrl> [options]
    添加新的 provider
    --api-key <key>      API 密钥
    --api <type>         API 类型 (默认: openai-responses)
    --auth-header        使用 Authorization header

  ${color.cyan("add model")} <provider> <modelId> [options]
    添加模型到 provider
    --name <name>              显示名称
    --reasoning                支持推理
    --context-window <n>       上下文窗口大小
    --max-tokens <n>          最大输出 tokens
    --cost-input <n>          输入价格 ($/M)
    --cost-output <n>         输出价格 ($/M)

  ${color.cyan("rm")} <provider> [modelId]
    删除 provider 或模型
    不指定 modelId 则删除整个 provider

  ${color.cyan("test")} <provider> [modelId] [options]
    测试 API 连接
    --message <msg>       测试消息
    --stream              测试流式响应
    --reasoning           启用推理/思考
    --thinking <level>    推理级别 (minimal/low/medium/high/xhigh)

  ${color.cyan("batch")} <provider>
    批量测试 provider 下所有模型
    --stream              测试流式响应
    --reasoning           启用推理

  ${color.cyan("update")}
    从 models.dev 更新价格

  ${color.cyan("template")} [name]
    显示配置模板
    openai-compatible, anthropic-compatible

  ${color.cyan("validate")}
    验证 JSON 格式

${color.bold("Examples:")}

  ${color.dim("# List all models")}
  bun models.ts list

  ${color.dim("# View provider details")}
  bun models.ts list --provider pox

  ${color.dim("# Add a new provider")}
  bun models.ts add provider myai https://api.myai.com/v1 --api-key sk-xxx

  ${color.dim("# Add a model")}
  bun models.ts add model myai gpt-5 --name "GPT-5" --reasoning --context-window 200000

  ${color.dim("# Test a model (basic)")}
  bun models.ts test myai gpt-5 --message "Say hello"

  ${color.dim("# Test with streaming")}
  bun models.ts test myai gpt-5 --stream

  ${color.dim("# Test with reasoning")}
  bun models.ts test myai gpt-5 --reasoning --thinking high

  ${color.dim("# Batch test all models")}
  bun models.ts batch pox

  ${color.dim("# Update prices")}
  bun models.ts update

${color.bold("Config Path:")}
  ${MODELS_JSON_PATH}

${color.bold("Supported API Types:")}
  openai-responses       OpenAI Responses API
  openai-completions     OpenAI Chat Completions
  anthropic-messages     Anthropic Messages API
  google-generative-ai   Google Gemini API
  mistral-conversations  Mistral API
  azure-openai-responses Azure OpenAI
`);
}

async function main() {
  const subcommand = flags._.shift();
  
  switch (subcommand) {
    case "list":
    case "ls":
    case undefined:
      await cmdList({
        provider: flags.provider,
        json: flags.json,
      });
      break;

    case "add": {
      const type = flags._.shift();
      if (type === "provider") {
        const name = flags._.shift();
        const baseUrl = flags._.shift();
        if (!name || !baseUrl) {
          console.error(color.red("Usage: add provider <name> <baseUrl>"));
          process.exit(1);
        }
        await cmdAddProvider({
          name,
          baseUrl,
          apiKey: flags["api-key"],
          api: flags.api,
          authHeader: flags["auth-header"],
        });
      } else if (type === "model") {
        const provider = flags._.shift();
        const modelId = flags._.shift();
        if (!provider || !modelId) {
          console.error(color.red("Usage: add model <provider> <modelId>"));
          process.exit(1);
        }
        await cmdAddModel({
          provider,
          id: modelId,
          name: flags.name,
          reasoning: flags.reasoning,
          contextWindow: flags["context-window"] ? parseInt(flags["context-window"] as string) : undefined,
          maxTokens: flags["max-tokens"] ? parseInt(flags["max-tokens"] as string) : undefined,
          costInput: flags["cost-input"] ? parseFloat(flags["cost-input"] as string) : undefined,
          costOutput: flags["cost-output"] ? parseFloat(flags["cost-output"] as string) : undefined,
        });
      } else {
        console.error(color.red(`Unknown add type: ${type}`));
        process.exit(1);
      }
      break;
    }

    case "rm":
    case "remove":
    case "delete":
      if (!flags._[0]) {
        console.error(color.red("Usage: rm <provider> [modelId]"));
        process.exit(1);
      }
      await cmdRemove({
        type: flags._[1] ? "model" : "provider",
        provider: flags._[0] as string,
        modelId: flags._[1] as string | undefined,
      });
      break;

    case "test":
      if (!flags._[0]) {
        console.error(color.red("Usage: test <provider> [modelId]"));
        process.exit(1);
      }
      await cmdTest({
        provider: flags._[0] as string,
        model: flags._[1] as string | undefined,
        message: flags.message as string | undefined,
        stream: flags.stream as boolean | undefined,
        reasoning: flags.reasoning as boolean | undefined,
        thinkingLevel: flags.thinking as string | undefined,
      });
      break;

    case "batch":
    case "test-all":
      if (flags._.length > 0) {
        await cmdBatch({
          provider: flags._[0] as string,
          stream: flags.stream as boolean | undefined,
          reasoning: flags.reasoning as boolean | undefined,
        });
      } else if (flags.all || flags._.length === 0) {
        await cmdBatch({
          provider: "",
          all: true,
          stream: flags.stream as boolean | undefined,
          reasoning: flags.reasoning as boolean | undefined,
        });
      } else {
        console.error(color.red("Usage: batch [provider] or batch --all"));
        process.exit(1);
      }
      break;

    case "update":
      await cmdUpdate({ provider: flags.provider });
      break;

    case "export":
      cmdExport();
      break;

    case "template":
      await cmdTemplate({ provider: flags._[0] as string ?? "openai-compatible" });
      break;

    case "validate":
      if (validateJson()) {
        console.log(color.green("✓ JSON is valid"));
      } else {
        process.exit(1);
      }
      break;

    case "help":
    case "-h":
    case "--help":
      printHelp();
      break;

    default:
      console.error(color.red(`Unknown command: ${subcommand}`));
      printHelp();
      process.exit(1);
  }
}

// 解析参数
let flags: Record<string, unknown> = {};
const args = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "provider": { type: "string" },
    "api-key": { type: "string" },
    "api": { type: "string" },
    "auth-header": { type: "boolean" },
    "name": { type: "string" },
    "reasoning": { type: "boolean" },
    "context-window": { type: "string" },
    "max-tokens": { type: "string" },
    "cost-input": { type: "string" },
    "cost-output": { type: "string" },
    "message": { type: "string" },
    "thinking": { type: "string" },
    "stream": { type: "boolean" },
    "all": { type: "boolean" },
    "json": { type: "boolean" },
    "help": { type: "boolean" },
  },
  allowPositionals: true,
});

flags = args.values;
flags._ = args.positionals;

main().catch(e => {
  console.error(color.red(`Error: ${e}`));
  process.exit(1);
});
