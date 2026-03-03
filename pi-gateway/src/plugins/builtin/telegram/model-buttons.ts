export type ModelProviderEntry = { provider: string; modelId: string };

type InlineButton = { text: string; callback_data: string };

export type ParsedModelCallback =
  | { type: "providers" }
  | { type: "list"; provider: string; page: number }
  | { type: "select"; provider: string; modelId: string }
  | { type: "back" };

export function parseModelCallbackData(data: string): ParsedModelCallback | null {
  const value = data.trim();
  if (value === "mdl_prov") return { type: "providers" };
  if (value === "mdl_back") return { type: "back" };

  if (value.startsWith("mdl_list:")) {
    const parts = value.split(":");
    if (parts.length < 3) return null;
    const provider = decodeURIComponent(parts[1] ?? "");
    const page = Number.parseInt(parts[2] ?? "1", 10);
    if (!provider || Number.isNaN(page) || page < 1) return null;
    return { type: "list", provider, page };
  }

  if (value.startsWith("mdl_sel:")) {
    const rest = value.slice("mdl_sel:".length);
    const sep = rest.indexOf("/");
    if (sep <= 0) return null;
    const provider = decodeURIComponent(rest.slice(0, sep));
    const modelId = decodeURIComponent(rest.slice(sep + 1));
    if (!provider || !modelId) return null;
    return { type: "select", provider, modelId };
  }

  return null;
}

function chunkButtons(buttons: InlineButton[], columns: number): InlineButton[][] {
  const rows: InlineButton[][] = [];
  const safeColumns = Math.max(1, columns);
  for (let i = 0; i < buttons.length; i += safeColumns) {
    rows.push(buttons.slice(i, i + safeColumns));
  }
  return rows;
}

function modelLabel(entry: ModelProviderEntry): string {
  const full = `${entry.provider}/${entry.modelId}`;
  return full.length > 48 ? `${full.slice(0, 45)}…` : full;
}

export function buildProviderKeyboard(
  providers: string[],
  columns = 2,
): Array<Array<{ text: string; callback_data: string }>> {
  const buttons: InlineButton[] = providers.map((provider) => ({
    text: provider,
    callback_data: `mdl_list:${encodeURIComponent(provider)}:1`,
  }));
  return chunkButtons(buttons, columns);
}

export function buildModelSelectionKeyboard(
  entries: ModelProviderEntry[],
  columns = 2,
): Array<Array<{ text: string; callback_data: string }>> {
  const buttons: InlineButton[] = entries.map((entry) => ({
    text: modelLabel(entry),
    callback_data: `mdl_sel:${encodeURIComponent(entry.provider)}/${encodeURIComponent(entry.modelId)}`,
  }));
  return chunkButtons(buttons, columns);
}

export function buildModelsKeyboard(params: {
  provider: string;
  models: string[];
  page: number;
  pageSize?: number;
  columns?: number;
}): { rows: Array<Array<{ text: string; callback_data: string }>>; totalPages: number } {
  const pageSize = Math.max(1, params.pageSize ?? 12);
  const totalPages = Math.max(1, Math.ceil(params.models.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, params.page));
  const start = (page - 1) * pageSize;
  const items = params.models.slice(start, start + pageSize);

  const rows: InlineButton[][] = buildModelSelectionKeyboard(
    items.map((modelId) => ({ provider: params.provider, modelId })),
    params.columns ?? 2,
  );

  if (totalPages > 1) {
    rows.push([
      {
        text: "◀",
        callback_data: `mdl_list:${encodeURIComponent(params.provider)}:${Math.max(1, page - 1)}`,
      },
      { text: `${page}/${totalPages}`, callback_data: `mdl_list:${encodeURIComponent(params.provider)}:${page}` },
      {
        text: "▶",
        callback_data: `mdl_list:${encodeURIComponent(params.provider)}:${Math.min(totalPages, page + 1)}`,
      },
    ]);
  }

  rows.push([{ text: "Back", callback_data: "mdl_back" }]);

  return { rows, totalPages };
}

export function groupModelsByProvider(models: unknown[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const item of models) {
    if (!item || typeof item !== "object") continue;
    const provider = String((item as any).provider ?? "").trim();
    const modelId = String((item as any).modelId ?? (item as any).id ?? "").trim();
    if (!provider || !modelId) continue;
    if (!grouped[provider]) grouped[provider] = [];
    grouped[provider]!.push(modelId);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key] = Array.from(new Set(grouped[key]!)).sort((a, b) => a.localeCompare(b));
  }
  return grouped;
}
