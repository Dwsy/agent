declare module "@earendil-works/pi-ai/compat" {
  interface CompletionModel {
    id: string;
    provider: string;
    maxTokens: number;
  }

  interface CompletionContext {
    systemPrompt?: string;
    messages: Array<{
      role: "user";
      content: Array<{ type: "text"; text: string }>;
      timestamp: number;
    }>;
  }

  interface CompletionOptions {
    apiKey?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    maxTokens?: number;
    signal?: AbortSignal;
  }

  export function complete(
    model: CompletionModel,
    context: CompletionContext,
    options?: CompletionOptions,
  ): Promise<{
    stopReason?: string;
    errorMessage?: string;
    content: Array<{ type: string; text?: string }>;
  }>;
}
