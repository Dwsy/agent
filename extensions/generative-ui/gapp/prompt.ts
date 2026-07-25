import type { GappMeta } from "./storage.js";
import { listOnlineGapps } from "./storage.js";
import type { GappTool } from "./protocol.js";
import { detectGappLang, type GappLang } from "./i18n.js";

export interface LiveAppPromptInfo {
  id: string;
  name?: string;
  scope?: string;
  /** @deprecated progressive prompt ignores tool bodies; keep for API compat */
  tools?: GappTool[];
  live: boolean;
}

export interface GappPromptExtras {
  liveApps?: LiveAppPromptInfo[];
  host?: {
    base?: string;
    role?: string;
    port?: number;
    protocolVersion?: string;
  };
}

function formatOnlineBlock(online: GappMeta[], lang: GappLang): string {
  if (online.length === 0) {
    return lang === "zh"
      ? "（无 enabled GAPP。需要时 `gapp_upsert` 创建，或 `gapp_list` 看全部。）"
      : "(No enabled GAPPs. `gapp_upsert` to create, or `gapp_list` for all.)";
  }
  return online
    .map((m, i) => {
      const inst = m.instances === "multi" ? "multi" : "single";
      const desc = m.description ? ` — ${m.description}` : "";
      return `${i + 1}. \`${m.id}\` · ${m.name} · ${m.scope}/${inst}${desc}`;
    })
    .join("\n");
}

/** Live windows only — ids, not tool catalogs (fetch via gapp_list_tools). */
function formatLiveIdsBlock(liveApps: LiveAppPromptInfo[], lang: GappLang): string {
  if (!liveApps.length) return "";
  const ids = liveApps
    .map((a) => {
      const label = a.name && a.name !== a.id ? `${a.id} (${a.name})` : a.id;
      const scope = a.scope ? ` [${a.scope}]` : "";
      return `- \`${label}\`${scope}`;
    })
    .join("\n");
  if (lang === "zh") {
    return [
      "## Live 窗口（仅 id）",
      "",
      ids,
      "",
      "领域工具细节**不要猜**：对具体 app 先 `gapp_list_tools({ id })`，再 `gapp_call`。",
    ].join("\n");
  }
  return [
    "## Live windows (ids only)",
    "",
    ids,
    "",
    "Do **not** invent domain tools: `gapp_list_tools({ id })` first, then `gapp_call`.",
  ].join("\n");
}

function formatHostLine(host: GappPromptExtras["host"] | undefined, lang: GappLang): string {
  if (!host?.base && !host?.port) return "";
  const role = host.role || "?";
  const base = host.base || `http://127.0.0.1:${host.port || 54888}`;
  const ver = host.protocolVersion || "0.1";
  return lang === "zh"
    ? `Host: \`${base}\` (role=${role}, protocol=${ver})`
    : `Host: \`${base}\` (role=${role}, protocol=${ver})`;
}

/**
 * Progressive system appendix: app list + how to pull detail via tools.
 * No full tool catalogs, HTML samples, or long rule essays.
 */
export function buildGappSystemPrompt(online: GappMeta[], extras: GappPromptExtras = {}): string {
  const lang = detectGappLang();
  const onlineBlock = formatOnlineBlock(online, lang);
  const liveBlock = formatLiveIdsBlock(extras.liveApps || [], lang);
  const hostLine = formatHostLine(extras.host, lang);
  return lang === "zh" ? buildZh(onlineBlock, liveBlock, hostLine) : buildEn(onlineBlock, liveBlock, hostLine);
}

function buildZh(onlineBlock: string, liveBlock: string, hostLine: string): string {
  const parts = [
    `# Glimpse-APP (GAPP) · 渐进上下文

临时看板/todo/计划板 → 用 GAPP 工具；持久产品 UI → 普通源码。**state.json 是 SSOT**。

## 当前在线（enabled · 未归档）

${onlineBlock}

序号可用于 \`gapp_open({ id: "1" })\` / \`gapp_call({ id: "1", … })\`。

`,
  ];
  if (liveBlock) parts.push(liveBlock, "");

  parts.push(`## 渐进拉取（按需，不要一次灌满）

| 需要知道… | 调用 |
|-----------|------|
| 有哪些 app（含 disabled） | \`gapp_list\` |
| **某 app 有哪些领域工具 / schema** | **\`gapp_list_tools({ id })\`** ← 用前必拉 |
| 执行领域动作 | \`gapp_call({ id, tool, arguments })\` |
| 读/写整份状态 | \`gapp_get_state\` / \`gapp_set_state\`（有 tool 时优先 call） |
| 新建/改 UI | \`gapp_upsert\` |
| 开关窗 / 生命周期 | \`gapp_open\` · \`gapp_set_status\` |

**规则：** 列表可驻 system；**工具明细、state 内容、HTML 约定一律 tool 现查**。未 \`gapp_list_tools\` 前不要编造 domain tool 名。

## 入站消息（Host 注入的用户消息）

- \`[GAPP event]\` → 先 \`gapp_get_state\` 或 \`gapp_list_tools\`+\`gapp_call\`，再短报；勿瞎猜进度。
- \`[GAPP generate]\` → **只出 App 正文**（或 JSON）；禁止寒暄/过程说明。
`);

  if (hostLine) parts.push("", hostLine);
  return parts.join("\n").trim() + "\n";
}

function buildEn(onlineBlock: string, liveBlock: string, hostLine: string): string {
  const parts = [
    `# Glimpse-APP (GAPP) · progressive context

Temp boards/todos/plans → GAPP tools; product UI → normal source. **state.json is SSOT**.

## Currently online (enabled · not archived)

${onlineBlock}

Indices: \`gapp_open({ id: "1" })\` / \`gapp_call({ id: "1", … })\`.

`,
  ];
  if (liveBlock) parts.push(liveBlock, "");

  parts.push(`## Progressive fetch (on demand — do not preload everything)

| Need… | Call |
|-------|------|
| All apps (incl. disabled) | \`gapp_list\` |
| **Domain tools / schema for one app** | **\`gapp_list_tools({ id })\`** ← required before use |
| Run domain action | \`gapp_call({ id, tool, arguments })\` |
| Full state | \`gapp_get_state\` / \`gapp_set_state\` (prefer call when tools exist) |
| Create/update UI | \`gapp_upsert\` |
| Window / lifecycle | \`gapp_open\` · \`gapp_set_status\` |

**Rule:** app list may stay in system; **tool catalogs, state bodies, HTML contracts are tool-fetched**. Never invent domain tool names without \`gapp_list_tools\`.

## Inbound (Host-injected user messages)

- \`[GAPP event]\` → verify with \`gapp_get_state\` or \`gapp_list_tools\`+\`gapp_call\`, then brief status.
- \`[GAPP generate]\` → **content only** (or JSON); no chit-chat.
`);

  if (hostLine) parts.push("", hostLine);
  return parts.join("\n").trim() + "\n";
}

export async function getGappPromptAppendix(
  cwd = process.cwd(),
  extras: GappPromptExtras = {},
): Promise<string> {
  const online = await listOnlineGapps(cwd);
  return buildGappSystemPrompt(online, extras);
}
