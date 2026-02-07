export type UnknownRecord = Record<string, unknown>;

export type HookName =
  | "before_agent_start"
  | "agent_end"
  | "message_received"
  | "message_sending"
  | "message_sent"
  | "before_tool_call"
  | "after_tool_call"
  | "tool_result_persist"
  | "session_start"
  | "session_end"
  | "before_compaction"
  | "after_compaction"
  | "gateway_start"
  | "gateway_stop";

export interface GatewayConfig {
  gateway: {
    port: number;
    bind?: string;
    auth?: {
      mode?: string;
      token?: string;
    };
  };
}

export interface CommandContext {
  sessionKey: string;
  senderId: string;
  channel: string;
  args: string;
  respond(text: string): Promise<void>;
}

export interface BackgroundService {
  name: string;
  start(api: GatewayApi): Promise<void>;
  stop(): Promise<void>;
}

export interface GatewayApi {
  readonly id: string;
  readonly name: string;
  readonly config: GatewayConfig;
  readonly logger: {
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
  registerCommand(name: string, handler: (ctx: CommandContext) => void | Promise<void>): void;
  registerGatewayMethod(
    method: string,
    handler: (params: UnknownRecord, ctx: { clientId: string; sessionKey?: string }) => unknown | Promise<unknown>,
  ): void;
  registerHook(events: HookName[], handler: (payload: UnknownRecord) => void | Promise<void>): void;
  on(hook: HookName, handler: (payload: UnknownRecord) => void | Promise<void>): void;
  registerService(service: BackgroundService): void;
  setModel(sessionKey: string, provider: string, modelId: string): Promise<void>;
  setThinkingLevel(sessionKey: string, level: string): Promise<void>;
}

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export function parseModelRef(raw: string): { provider: string; modelId: string } | null {
  const trimmed = raw.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash >= trimmed.length - 1) return null;
  return {
    provider: trimmed.slice(0, slash),
    modelId: trimmed.slice(slash + 1),
  };
}

export function parseSessionKey(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function modelToText(model: unknown): string {
  if (!model || typeof model !== "object") return String(model);
  const m = model as Record<string, unknown>;
  const provider = typeof m.provider === "string" ? m.provider : "?";
  const modelId =
    typeof m.modelId === "string"
      ? m.modelId
      : typeof m.id === "string"
        ? m.id
        : "?";
  return `${provider}/${modelId}`;
}
