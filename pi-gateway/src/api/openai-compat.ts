/**
 * OpenAI-compatible API — POST /v1/chat/completions
 * Lets any OpenAI SDK client (Python openai, curl, ChatBox, etc.) connect directly.
 */

import type { GatewayContext } from "../gateway/types.ts";

function normalizeAddress(value: string | null): string {
  if (!value) return "";
  const first = value.split(",")[0]?.trim() ?? "";
  if (first.startsWith("[::ffff:")) {
    return first.slice(8, -1);
  }
  return first;
}

function deriveApiSessionKey(req: Request): { sessionKey: string; source: "explicit" | "derived" } {
  const explicit = req.headers.get("x-session-key")?.trim();
  if (explicit) {
    return { sessionKey: explicit, source: "explicit" };
  }

  const auth = req.headers.get("authorization")?.trim() ?? "";
  const forwarded = normalizeAddress(req.headers.get("x-forwarded-for"));
  const realIp = normalizeAddress(req.headers.get("x-real-ip"));
  const ua = req.headers.get("user-agent")?.trim() ?? "";
  const fingerprintSource = `${auth}|${forwarded || realIp}|${ua}`;
  const fingerprint = Bun.hash(fingerprintSource).toString(36);
  return { sessionKey: `agent:main:api:${fingerprint}`, source: "derived" };
}

function toOpenAiError(message: string, status = 500): Response {
  return Response.json({ error: { message, type: "server_error" } }, { status });
}

function mapErrorStatus(err: unknown): number {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("queue timeout")) {
    return 504;
  }
  return 500;
}

export async function handleOpenAiChat(req: Request, ctx: GatewayContext): Promise<Response> {
  try {
    const body = await req.json() as {
      model?: string;
      messages?: Array<{ role: string; content: string }>;
      stream?: boolean;
      sessionKey?: string;
    };

    if (!body.messages || body.messages.length === 0) {
      return Response.json({ error: { message: "messages is required", type: "invalid_request_error" } }, { status: 400 });
    }

    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    const prompt = lastUser?.content ?? "";
    if (!prompt) {
      return Response.json({ error: { message: "No user message found", type: "invalid_request_error" } }, { status: 400 });
    }

    const sessionFromBody = typeof body.sessionKey === "string" && body.sessionKey.trim().length > 0
      ? body.sessionKey.trim()
      : undefined;
    const resolvedSession = sessionFromBody
      ? { sessionKey: sessionFromBody, source: "explicit" as const }
      : deriveApiSessionKey(req);
    const sessionKey = resolvedSession.sessionKey;
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

    ctx.log.info(`/v1/chat/completions: session key source=${resolvedSession.source} sessionKey=${sessionKey}`);

    const modelName = body.model ?? ctx.config.agent.model ?? "pi-gateway";
    const requestId = `chatcmpl-${Date.now()}`;
    const timeoutMs = ctx.config.agent.timeoutMs ?? 120_000;

    if (body.stream) {
      return handleStreamingChat(
        rpc,
        session,
        sessionKey,
        requestId,
        modelName,
        prompt,
        timeoutMs,
        (err) => ctx.log.warn(`/v1/chat/completions stream failed: ${err instanceof Error ? err.message : String(err)}`),
      );
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
    } catch (err: unknown) {
      const status = mapErrorStatus(err);
      return toOpenAiError(err instanceof Error ? err.message : "Internal error", status);
    } finally {
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
    return toOpenAiError(err instanceof Error ? err.message : "Internal error", mapErrorStatus(err));
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
  onError: (err: unknown) => void,
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

      let failed = false;
      const unsub = rpc.onEvent((event: any) => {
        if (rpc.sessionKey !== sessionKey) return;

        if (event.type === "message_update") {
          const ame = event.assistantMessageEvent ?? event.assistant_message_event;
          if (ame?.type === "text_delta" && ame.delta) {
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
      } catch (err: unknown) {
        failed = true;
        const status = mapErrorStatus(err);
        const message = err instanceof Error ? err.message : "Internal error";
        const errorChunk = {
          id: requestId,
          object: "error",
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          error: {
            message,
            type: "server_error",
            code: status,
          },
        };
        send(errorChunk);
        onError(err);
      }

      unsub();
      session.isStreaming = false;

      if (failed) {
        controller.enqueue("data: [DONE]\n\n");
        controller.close();
        return;
      }

      send(makeChunk("", "stop"));
      controller.enqueue("data: [DONE]\n\n");
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}
