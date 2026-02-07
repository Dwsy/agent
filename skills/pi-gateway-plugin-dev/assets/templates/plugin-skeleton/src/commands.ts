import type { CommandContext, GatewayApi } from "./types.ts";
import { THINKING_LEVELS, modelToText, parseModelRef } from "./types.ts";

function buildGatewayBaseUrl(api: GatewayApi): string {
  const port = api.config.gateway?.port ?? 18789;
  return `http://127.0.0.1:${port}`;
}

function buildAuthHeaders(api: GatewayApi): Record<string, string> {
  const mode = api.config.gateway?.auth?.mode;
  const token = api.config.gateway?.auth?.token;
  if (mode === "token" && token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function fetchModelsViaGateway(api: GatewayApi, sessionKey: string): Promise<unknown[]> {
  const baseUrl = buildGatewayBaseUrl(api);
  const headers = buildAuthHeaders(api);
  const url = `${baseUrl}/api/models?sessionKey=${encodeURIComponent(sessionKey)}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET /api/models failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const payload = (await res.json()) as { models?: unknown[] };
  return payload.models ?? [];
}

async function handleModels(api: GatewayApi, ctx: CommandContext): Promise<void> {
  try {
    const models = await fetchModelsViaGateway(api, ctx.sessionKey);
    if (!models.length) {
      await ctx.respond("模型列表为空。若是首次会话，请先发送一条普通消息激活 session。");
      return;
    }

    const preview = models.slice(0, 20).map((m, i) => `${i + 1}. ${modelToText(m)}`);
    await ctx.respond(`可用模型（最多显示 20 条）:\n${preview.join("\n")}`);
  } catch (err) {
    api.logger.warn("[__PLUGIN_ID__] /models failed", err);
    await ctx.respond(`读取模型列表失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleSwitchModel(api: GatewayApi, ctx: CommandContext): Promise<void> {
  const target = parseModelRef(ctx.args);
  if (!target) {
    await ctx.respond("用法: /model provider/modelId");
    return;
  }

  try {
    await api.setModel(ctx.sessionKey, target.provider, target.modelId);
    await ctx.respond(`已切换模型: ${target.provider}/${target.modelId}`);
  } catch (err) {
    api.logger.warn("[__PLUGIN_ID__] /model failed", err);
    await ctx.respond(`切换模型失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleThinkingLevel(api: GatewayApi, ctx: CommandContext): Promise<void> {
  const level = ctx.args.trim().toLowerCase();
  if (!THINKING_LEVELS.includes(level as (typeof THINKING_LEVELS)[number])) {
    await ctx.respond(`用法: /think <${THINKING_LEVELS.join("|")}>`);
    return;
  }

  try {
    await api.setThinkingLevel(ctx.sessionKey, level);
    await ctx.respond(`已设置 thinking level: ${level}`);
  } catch (err) {
    api.logger.warn("[__PLUGIN_ID__] /think failed", err);
    await ctx.respond(`设置思考等级失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function registerModelCommands(api: GatewayApi): void {
  api.registerCommand("models", async (ctx) => {
    await handleModels(api, ctx);
  });

  api.registerCommand("model", async (ctx) => {
    await handleSwitchModel(api, ctx);
  });

  api.registerCommand("think", async (ctx) => {
    await handleThinkingLevel(api, ctx);
  });
}
