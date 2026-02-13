/**
 * OpenAI-compatible API — POST /v1/chat/completions
 * Lets any OpenAI SDK client (Python openai, curl, ChatBox, etc.) connect directly.
 */

import type { GatewayContext } from "../gateway/types.ts";

export async function handleOpenAiChat(req: Request, ctx: GatewayContext): Promise<Response> {
  try {
    const body = await req.json() as {
      model?: string;
      messages?: Array<{ role: string; content: string }>;
      stream?: boolean;
    };

    if (!body.messages || body.messages.length === 0) {
      return Response.json({ error: { message: "messages is required", type: "invalid_request_error" } }, { status: 400 });
    }

    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    const prompt = lastUser?.content ?? "";
    if (!prompt) {
      return Response.json({ error: { message: "No user message found", type: "invalid_request_error" } }, { status: 400 });
    }

    const sessionKey = "agent:main:main:main";
    const role = ctx.sessions.get(sessionKey)?.role ?? "default";
    const profile = ctx.buildSessionProfile(sessionKey, role);

    if (!ctx.sessions.has(sessionKey)) {
      ctx.sessions.getOrCreate(sessionKey, {
        role: null, isStreaming: false, lastActivity: Date.now(), messageCount: 0, rpcProcessId: null,
      });
    }

    const session = ctx.sessions.get(sessionKey)!;
    session.lastActivity = Date.now();
    session.messageCount++;

    const rpc = await ctx.pool.acquire(sessionKey, profile);
    session.rpcProcessId = rpc.id;

    const modelName = body.model ?? ctx.config.agent.model ?? "pi-gateway";
    const requestId = `chatcmpl-${Date.now()}`;
    const timeoutMs = ctx.config.agent.timeoutMs ?? 120_000;

    if (body.stream) {
      return handleStreamingChat(rpc, session, sessionKey, requestId, modelName, prompt, timeoutMs);
    }

    // Non-streaming: wait for full reply
    session.isStreaming = true;
    let fullText = "";
    const startTime = Date.now();
    const unsub = rpc.onEvent((event) => {
      if (event.type === "message_update") {
        const ame = (event as any).assistantMessageEvent ?? (event as any).assistant_message_event;
        if (ame?.type === "text_delta" && ame.delta) fullText += ame.delta;
      }
    });

    try {
      await rpc.prompt(prompt);
      await rpc.waitForIdle(timeoutMs);
    } catch {} finally {
      unsub();
      session.isStreaming = false;
    }

    return Response.json({
      id: requestId,
      object: "chat.completion",
      created: Math.floor(startTime / 1000),
      model: modelName,
      choices: [{
        index: 0,
        message: { role: "assistant", content: fullText },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (err: unknown) {
    return Response.json({ error: { message: err instanceof Error ? err.message : "Internal error", type: "server_error" } }, { status: 500 });
  }
}

function handleStreamingChat(
  rpc: any,
  session: any,
  sessionKey: string,
  requestId: string,
  modelName: string,
  prompt: string,
  timeoutMs: number,
): Response {
  session.isStreaming = true;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      const makeChunk = (content: string, finishReason: string | null = null) => ({
        id: requestId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{ index: 0, delta: content ? { content } : {}, finish_reason: finishReason }],
      });

      let fullText = "";
      const unsub = rpc.onEvent((event: any) => {
        if (rpc.sessionKey !== sessionKey) return;

        if (event.type === "message_update") {
          const ame = event.assistantMessageEvent ?? event.assistant_message_event;
          if (ame?.type === "text_delta" && ame.delta) {
            fullText += ame.delta;
            send(makeChunk(ame.delta));
          }
          if (ame?.type === "thinking_start") send(makeChunk("\n<think>\n"));
          if (ame?.type === "thinking_delta" && ame.delta) send(makeChunk(ame.delta));
          if (ame?.type === "thinking_end") send(makeChunk("\n</think>\n"));
        }
      });

      try {
        await rpc.prompt(prompt);
        await rpc.waitForIdle(timeoutMs);
      } catch {}

      unsub();
      session.isStreaming = false;

      send(makeChunk("", "stop"));
      controller.enqueue("data: [DONE]\n\n");
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}
