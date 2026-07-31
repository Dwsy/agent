/**
 * GAPP Host Protocol v0.1 — types & pure helpers.
 * Spec: ./PROTOCOL.md
 */

import { detectGappLang } from "./i18n.js";

export const GAPP_PROTOCOL_VERSION = "0.1" as const;

export type GappProtocolVersion = typeof GAPP_PROTOCOL_VERSION;

export type GappHostMode = "pi-live" | "isolated";

export type GappMsgTypeIn =
  | "gapp_state"
  | "gapp_tools_register"
  | "gapp_tools_unregister"
  | "gapp_tool_result"
  | "gapp_event"
  | "gapp_llm_request"
  | "gapp_llm_cancel"
  | "gapp_host_request"
  | "gapp_ready"
  | "gapp_log";

export type GappMsgTypeOut =
  | "gapp_tool_call"
  | "gapp_state_push"
  | "gapp_llm_chunk"
  | "gapp_llm_done"
  | "gapp_host_result"
  | "gapp_host_info"
  | "gapp_ping"
  | "gapp_pong";

export type GappErrorCode =
  | "not_found"
  | "invalid_args"
  | "needs_live_handler"
  | "handler_error"
  | "timeout"
  | "host_unavailable"
  | "busy"
  | "cancelled"
  | "provider_error"
  | "stale_revision"
  /** instances=single and another session already holds the live connection */
  | "already_connected";

/** Window/live-connection policy. Default single (strong-state safe). */
export type GappInstances = "single" | "multi";

export function normalizeInstances(raw: unknown): GappInstances {
  return raw === "multi" ? "multi" : "single";
}

export interface GappError {
  code: GappErrorCode;
  message: string;
}

export interface GappEnvelope {
  v?: GappProtocolVersion | string;
  type: string;
  id: string;
  ts?: string;
  requestId?: string;
}

export interface GappToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export type GappStateOp =
  | { op: "get"; path?: string }
  | { op: "set"; path: string; value: unknown }
  | { op: "merge"; value: Record<string, unknown> }
  | { op: "push"; path: string; value: unknown }
  | { op: "removeWhere"; path: string; match: Record<string, unknown> }
  | { op: "updateWhere"; path: string; match: Record<string, unknown>; set: Record<string, unknown> };

export interface GappTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  stateOps?: GappStateOp[];
  annotations?: GappToolAnnotations;
}

export interface GappToolsFile {
  v: GappProtocolVersion | string;
  /** v0.2 convention: trusted app-owned executable module, fixed to tools.mjs. */
  module?: "tools.mjs";
  tools: GappTool[];
}

export interface GappToolsRegisterMsg extends GappEnvelope {
  type: "gapp_tools_register";
  revision: number;
  tools: GappTool[];
}

export interface GappToolsUnregisterMsg extends GappEnvelope {
  type: "gapp_tools_unregister";
}

export interface GappToolCallMsg extends GappEnvelope {
  type: "gapp_tool_call";
  requestId: string;
  name: string;
  arguments?: Record<string, unknown>;
}

export interface GappToolResultMsg extends GappEnvelope {
  type: "gapp_tool_result";
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: GappError;
}

export interface GappEventMsg extends GappEnvelope {
  type: "gapp_event";
  event: string;
  payload?: unknown;
  notifyAgent?: boolean;
  prompt?: string;
}

/** Always fulfilled on the main Pi session via sendUserMessage — no side model. */
export type GappLlmMode = "agent";
export type GappLlmFormat = "text" | "json";

export interface GappLlmRequestMsg extends GappEnvelope {
  type: "gapp_llm_request";
  requestId: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  maxTokens?: number;
  format?: GappLlmFormat;
  /** @deprecated Ignored; always main-session agent turn. */
  mode?: GappLlmMode;
  jsonSchema?: Record<string, unknown>;
}

export interface GappLease {
  appId: string;
  sessionId: string;
  pid: number;
  openedAt: string;
  host?: string;
  instances: GappInstances;
}

export interface GappLlmCancelMsg extends GappEnvelope {
  type: "gapp_llm_cancel";
  requestId: string;
}

export interface GappLlmChunkMsg extends GappEnvelope {
  type: "gapp_llm_chunk";
  requestId: string;
  delta: string;
}

export interface GappLlmDoneMsg extends GappEnvelope {
  type: "gapp_llm_done";
  requestId: string;
  ok: boolean;
  text?: string;
  error?: GappError;
}

export interface GappStatePushMsg extends GappEnvelope {
  type: "gapp_state_push";
  state: unknown;
  reason?: string;
}

export interface GappHostRequestMsg extends GappEnvelope {
  type: "gapp_host_request";
  requestId: string;
  method: string;
  arguments?: Record<string, unknown>;
}

export interface GappHostResultMsg extends GappEnvelope {
  type: "gapp_host_result";
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: GappError;
}

export interface GappHostInfoMsg extends GappEnvelope {
  type: "gapp_host_info";
  mode: GappHostMode;
  protocolVersion: GappProtocolVersion;
  capabilities: {
    tools: boolean;
    events: boolean;
    generate: boolean;
    rpc: boolean;
  };
}

const TOOL_NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;
const RESERVED_TOOL_NAMES = new Set(["register", "unregister"]);

export function isValidToolName(name: string): boolean {
  if (!TOOL_NAME_RE.test(name)) return false;
  if (RESERVED_TOOL_NAMES.has(name)) return false;
  if (name.startsWith("__")) return false;
  return true;
}

/** Fully-qualified tool id for docs / logs: gapp__<appId>__<toolName> */
export function qualifiedToolName(appId: string, toolName: string): string {
  return `gapp__${appId}__${toolName}`;
}

export function validateToolDescriptor(tool: unknown): tool is GappTool {
  if (!tool || typeof tool !== "object") return false;
  const t = tool as GappTool;
  if (typeof t.name !== "string" || !isValidToolName(t.name)) return false;
  if (typeof t.description !== "string" || !t.description.trim()) return false;
  if (!t.inputSchema || typeof t.inputSchema !== "object" || Array.isArray(t.inputSchema)) return false;
  if (t.stateOps !== undefined && !Array.isArray(t.stateOps)) return false;
  return true;
}

export function parseToolsRegister(data: unknown): GappToolsRegisterMsg | null {
  if (!data || typeof data !== "object") return null;
  const m = data as GappToolsRegisterMsg;
  if (m.type !== "gapp_tools_register") return null;
  if (typeof m.id !== "string" || !m.id) return null;
  if (typeof m.revision !== "number" || !Number.isFinite(m.revision)) return null;
  if (!Array.isArray(m.tools)) return null;
  if (!m.tools.every(validateToolDescriptor)) return null;
  return m;
}

export function parseToolResult(data: unknown): GappToolResultMsg | null {
  if (!data || typeof data !== "object") return null;
  const m = data as GappToolResultMsg;
  if (m.type !== "gapp_tool_result") return null;
  if (typeof m.id !== "string" || typeof m.requestId !== "string") return null;
  if (typeof m.ok !== "boolean") return null;
  return m;
}

export function parseEvent(data: unknown): GappEventMsg | null {
  if (!data || typeof data !== "object") return null;
  const m = data as GappEventMsg;
  if (m.type !== "gapp_event") return null;
  if (typeof m.id !== "string" || typeof m.event !== "string" || !m.event) return null;
  return m;
}

export function parseLlmRequest(data: unknown): GappLlmRequestMsg | null {
  if (!data || typeof data !== "object") return null;
  const m = data as GappLlmRequestMsg;
  if (m.type !== "gapp_llm_request") return null;
  if (typeof m.id !== "string" || typeof m.requestId !== "string") return null;
  if (typeof m.prompt !== "string" || !m.prompt.trim()) return null;
  return m;
}

export function parseHostRequest(data: unknown): GappHostRequestMsg | null {
  if (!data || typeof data !== "object") return null;
  const m = data as GappHostRequestMsg;
  if (m.type !== "gapp_host_request") return null;
  if (typeof m.id !== "string" || typeof m.requestId !== "string" || !m.requestId) return null;
  if (typeof m.method !== "string" || !m.method.trim()) return null;
  if (m.arguments !== undefined && (!m.arguments || typeof m.arguments !== "object" || Array.isArray(m.arguments))) {
    return null;
  }
  return m;
}

export function defaultEventPrompt(appId: string, event: string, payload: unknown): string {
  let body = "";
  try {
    body = JSON.stringify(payload ?? null);
    if (body.length > 8000) body = body.slice(0, 8000) + "…";
  } catch {
    body = String(payload);
  }
  const lang = detectGappLang();
  if (lang === "zh") {
    return [
      `[GAPP event] app=${appId} event=${event}`,
      `payload: ${body}`,
      "",
      "UI/用户修改了此 GAPP。请：",
      "1) 用 gapp_get_state 或 gapp_call（list/read 工具）核对当前进度",
      "2) 简短汇报状态并建议下一步",
      "未读 state 前勿声称进度。有工具时优先 gapp_call，勿滥用 set_state。",
    ].join("\n");
  }
  return [
    `[GAPP event] app=${appId} event=${event}`,
    `payload: ${body}`,
    "",
    "UI/user changed this GAPP. Do the following:",
    "1) gapp_get_state or gapp_call (list/read tools) to verify current progress",
    "2) Briefly report status and suggest next steps",
    "Do not claim state without reading it. Prefer gapp_call over raw set_state when tools exist.",
  ].join("\n");
}

export function formatGenerateUserMessage(req: {
  appId: string;
  requestId: string;
  prompt: string;
  system?: string;
  format?: GappLlmFormat;
}): string {
  const lang = detectGappLang();
  const parts =
    lang === "zh"
      ? [
          `[GAPP generate] app=${req.appId} requestId=${req.requestId}`,
          "这是 App 内生成请求，走主会话（不是旁路模型）。",
          "只输出 App 需要展示或解析的正文。",
          "禁止寒暄、过程说明、工具列表；除非要求，不要 markdown 围栏。",
        ]
      : [
          `[GAPP generate] app=${req.appId} requestId=${req.requestId}`,
          "This is an in-app generation request on the MAIN session (not a side model).",
          "Reply with ONLY the content the app will display or parse.",
          "No greeting, no process explanation, no tool listings, no markdown fences unless asked.",
        ];
  if (req.format === "json") {
    parts.push(
      lang === "zh"
        ? "只输出合法 JSON（无散文、无 ``` 包裹）。"
        : "Output valid JSON only (no prose, no ``` wrappers).",
    );
  }
  if (req.system?.trim()) {
    parts.push(
      lang === "zh"
        ? `约束: ${req.system.trim()}`
        : `Constraints: ${req.system.trim()}`,
    );
  }
  parts.push("", "--- request ---", req.prompt.trim());
  return parts.join("\n");
}

/** Merge disk tools with live tools (live wins on same name). */
export function mergeToolLists(disk: GappTool[], live: GappTool[]): GappTool[] {
  const map = new Map<string, GappTool>();
  for (const t of disk) map.set(t.name, t);
  for (const t of live) map.set(t.name, t);
  return [...map.values()];
}

/** @deprecated Prefer buildGappSystemPrompt liveApps extras in prompt.ts */
export function buildToolsCatalogMarkdown(
  apps: Array<{ id: string; name: string; scope: string; tools: GappTool[]; live: boolean }>,
): string {
  if (apps.length === 0) return "";
  const lang = detectGappLang();
  const lines = [
    lang === "zh" ? "## 打开的 GAPP 工具（动态）" : "## Open GAPP tools (dynamic)",
    "",
  ];
  for (const app of apps) {
    const flag = app.live ? "live" : "disk";
    lines.push(`### ${app.id} — ${app.name} [${app.scope}] (${flag})`);
    if (app.tools.length === 0) {
      lines.push(lang === "zh" ? "- （未注册工具）" : "- (no tools registered)");
    } else {
      for (const tool of app.tools) {
        const hints: string[] = [];
        if (tool.annotations?.readOnlyHint) hints.push("readOnly");
        if (tool.annotations?.destructiveHint) hints.push("destructive");
        const hint = hints.length ? ` (${hints.join(", ")})` : "";
        lines.push(`- \`${tool.name}\`${hint} — ${tool.description}`);
      }
    }
    lines.push(
      lang === "zh"
        ? `调用: \`gapp_call({ id: "${app.id}", tool: "<name>", arguments: {…} })\``
        : `Call: \`gapp_call({ id: "${app.id}", tool: "<name>", arguments: {…} })\``,
      "",
    );
  }
  if (lang === "zh") {
    lines.push(
      "有工具时优先 `gapp_call`，勿滥用 `gapp_set_state`。",
      "人改 UI 后可能收到 `[GAPP event]` — 先重读 state 再建议。",
    );
  } else {
    lines.push(
      "Prefer `gapp_call` over `gapp_set_state` when a tool exists.",
      "After human UI edits you may receive `[GAPP event]` — re-read state before advising.",
    );
  }
  return lines.join("\n");
}

/** Kept for callers; main guidance lives in prompt.ts */
export function getGenerativeBridgeSystemAppendix(): string {
  return detectGappLang() === "zh"
    ? `## GAPP 渐进上下文
- system 仅有 app 列表；领域工具用 \`gapp_list_tools({ id })\` 再 \`gapp_call\`。
- \`[GAPP event]\` — 工具核对后短报。
- \`[GAPP generate]\` — 只出正文。`
    : `## GAPP progressive context
- system has app list only; fetch domain tools with \`gapp_list_tools({ id })\` then \`gapp_call\`.
- \`[GAPP event]\` — verify via tools, brief help.
- \`[GAPP generate]\` — content only.`;
}

/** @deprecated Prefer getGenerativeBridgeSystemAppendix() — re-call for current locale */
export const GENERATIVE_BRIDGE_SYSTEM_APPENDIX = getGenerativeBridgeSystemAppendix();
