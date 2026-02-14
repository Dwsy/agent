/** Shared result helpers for gateway tool responses. */

export function toolOk(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { ok: true },
  };
}

export function toolError(error: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${error}` }],
    details: { error: true },
  };
}

export function cronOk(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { ok: true },
  };
}

export function cronError(error: string) {
  return {
    content: [{ type: "text" as const, text: `Cron error: ${error}` }],
    details: { error: true },
  };
}

export function gatewayHeaders(authToken?: string, includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

export async function parseResponseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text };
  }
}
