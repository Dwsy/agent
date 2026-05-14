/**
 * Pi Coding Agent 类型声明（简化版）
 * 运行时由 Pi 框架提供
 */

declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    registerTool(def: ToolDefinition): void;
    registerCommand(name: string, opts: CommandOptions): void;
    on(event: string, handler: EventHandler): void;
    sendMessage(msg: MessageOptions, opts?: SendOptions): void;
    appendEntry(type: string, data: unknown): void;
  }

  export interface ExtensionContext {
    ui: ExtensionUIContext;
    hasUI: boolean;
    cwd: string;
    sessionManager: SessionManager;
    hasPendingMessages(): boolean;
  }

  export interface ExtensionUIContext {
    notify(message: string, type?: "info" | "success" | "warning" | "error"): void;
    setWidget(id: string, content: unknown): void;
    theme: {
      fg(type: string, text: string): unknown;
    };
  }

  export interface SessionManager {
    getEntries(): SessionEntry[];
    getBranch(): SessionEntry[];
  }

  export interface SessionEntry {
    type: string;
    customType?: string;
    data?: unknown;
    message?: Message;
  }

  export interface Message {
    role?: string;
    content?: unknown;
    usage?: TokenUsage;
    timestamp?: number;
  }

  export interface TokenUsage {
    input?: number;
    output?: number;
  }

  export interface ToolDefinition {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    promptSnippet?: string;
    promptGuidelines?: string[];
    execute: ToolExecuteFunction;
  }

  export type ToolExecuteFunction = (
    id: string,
    params: unknown,
    signal: AbortSignal,
    onUpdate: (update: unknown) => void,
    ctx: ExtensionContext
  ) => Promise<ToolResult>;

  export interface ToolResult {
    content: Array<{ type: string; text: string }>;
    details?: Record<string, unknown>;
  }

  export interface CommandOptions {
    description: string;
    getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }>;
    handler: (args: string | undefined, ctx: ExtensionCommandContext) => Promise<void>;
  }

  export interface ExtensionCommandContext extends ExtensionContext {
    waitForIdle(): Promise<void>;
  }

  export type EventHandler = (event: unknown, ctx: ExtensionContext) => Promise<void>;

  export interface MessageOptions {
    customType?: string;
    content: string;
    display?: boolean;
  }

  export interface SendOptions {
    deliverAs?: "followUp";
    triggerTurn?: boolean;
  }
}
