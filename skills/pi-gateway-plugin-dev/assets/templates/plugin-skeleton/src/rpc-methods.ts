import type { GatewayApi, UnknownRecord } from "./types.ts";
import { parseModelRef, parseSessionKey } from "./types.ts";

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

export function registerModelRpcMethods(api: GatewayApi): void {
  api.registerGatewayMethod(`${api.id}.models.list`, async (params: UnknownRecord) => {
    const sessionKey = parseSessionKey(params.sessionKey, "agent:main:main:main");
    const models = await fetchModelsViaGateway(api, sessionKey);
    return {
      sessionKey,
      count: models.length,
      models,
    };
  });

  api.registerGatewayMethod(`${api.id}.model.switch`, async (params: UnknownRecord) => {
    const sessionKey = parseSessionKey(params.sessionKey, "agent:main:main:main");
    const provider = typeof params.provider === "string" ? params.provider : "";
    const modelId = typeof params.modelId === "string" ? params.modelId : "";
    const model = typeof params.model === "string" ? params.model : "";

    const parsed = model ? parseModelRef(model) : null;
    const target = parsed ?? (provider && modelId ? { provider, modelId } : null);
    if (!target) {
      throw new Error("model format must be provider/modelId, or provide provider + modelId");
    }

    await api.setModel(sessionKey, target.provider, target.modelId);
    return {
      ok: true,
      sessionKey,
      provider: target.provider,
      modelId: target.modelId,
    };
  });
}
