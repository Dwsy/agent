/**
 * Chat API handlers — extracted from server.ts R3.
 *
 * POST /api/chat       — sync chat (wait for full reply)
 * POST /api/chat/stream — SSE streaming chat
 *
 * @owner MintHawk (KeenUnion)
 */

import type { GatewayContext } from "../gateway/types.ts";
import type { ImageContent } from "../core/types.ts";
import { getAssistantMessageEvent } from "../core/rpc-events.ts";

/**
 * POST /api/chat — Synchronous chat. Sends message, waits for full reply.
 */
export async function handleApiChat(req: Request, ctx: GatewayContext): Promise<Response> {
  try {
    const body = await req.json() as {
      message?: string;
      sessionKey?: string;
      images?: Array<{
        type: "image";
        data?: string;
        mimeType?: string;
        source?: { type: "base64"; mediaType: string; data: string };
      }>;
    };

    const normalizedImages: ImageContent[] | undefined = body.images?.map((img) => {
      if (img.data && img.mimeType) {
        return { type: "image" as const, data: img.data, mimeType: img.mimeType };
      }
      if (img.source) {
        return { type: "image" as const, data: img.source.data, mimeType: img.source.mediaType };
      }
      return { type: "image" as const, data: "", mimeType: "image/png" };
    });

    if (!body.message) {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    const sessionKey = body.sessionKey ?? "agent:main:main:main";
    const startTime = Date.now();

    const role = ctx.sessions.get(sessionKey)?.role ?? "default";
    const profile = ctx.buildSessionProfile(sessionKey, role);

    if (!ctx.sessions.has(sessionKey)) {
      ctx.sessions.getOrCreate(sessionKey, {
        role: null,
        isStreaming: false,
        lastActivity: Date.now(),
        messageCount: 0,
        rpcProcessId: null,
      });
    }

    const session = ctx.sessions.get(sessionKey)!;
    session.lastActivity = Date.now();
    session.messageCount++;

    const rpc = await ctx.pool.acquire(sessionKey, profile);
    session.rpcProcessId = rpc.id;
    session.isStreaming = true;

    let fullText = "";
    const unsub = rpc.onEvent((event) => {
      if (rpc.sessionKey !== sessionKey) return;
      if (event.type === "message_update") {
        const ame = getAssistantMessageEvent(event);
        if (ame?.type === "text_delta" && ame.delta) {
          fullText += ame.delta;
        }
      }
    });

    try {
      const imgCount = normalizedImages?.length ?? 0;
      ctx.log.info(`/api/chat: sending prompt (${body.message.length} chars, ${imgCount} images) to ${rpc.id}`);
      if (imgCount > 0) {
        ctx.log.info(`/api/chat: first image mimeType=${normalizedImages![0].mimeType}, data.length=${normalizedImages![0].data.length}`);
      }
      await rpc.prompt(body.message, normalizedImages);
      await rpc.waitForIdle();
    } catch (err: any) {
      fullText = `Error: ${err?.message ?? "Unknown error"}`;
    } finally {
      unsub();
      session.isStreaming = false;
    }

    return Response.json({
      ok: true,
      reply: fullText,
      sessionKey,
      duration: Date.now() - startTime,
    });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Chat failed" }, { status: 500 });
  }
}

/**
 * POST /api/chat/stream — SSE streaming chat.
 */
export async function handleApiChatStream(req: Request, ctx: GatewayContext): Promise<Response> {
  let body: { message?: string; sessionKey?: string; images?: unknown[] };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  // Normalize images from request body to ImageContent[]
  const normalizedImages: ImageContent[] | undefined = Array.isArray(body.images)
    ? body.images.map((img: Record<string, unknown>) => {
        const src = img.source as { data?: string; mediaType?: string } | undefined;
        if (typeof img.data === "string" && typeof img.mimeType === "string") {
          return { type: "image" as const, data: img.data, mimeType: img.mimeType };
        }
        if (src && typeof src.data === "string" && typeof src.mediaType === "string") {
          return { type: "image" as const, data: src.data, mimeType: src.mediaType };
        }
        return { type: "image" as const, data: "", mimeType: "image/png" };
      })
    : undefined;

  const sessionKey = body.sessionKey ?? "agent:main:main:main";
  const startTime = Date.now();

  const role = ctx.sessions.get(sessionKey)?.role ?? "default";
  const profile = ctx.buildSessionProfile(sessionKey, role);

  if (!ctx.sessions.has(sessionKey)) {
    ctx.sessions.getOrCreate(sessionKey, {
      role: null,
      isStreaming: false,
      lastActivity: Date.now(),
      messageCount: 0,
      rpcProcessId: null,
    });
  }

  const session = ctx.sessions.get(sessionKey)!;
  session.lastActivity = Date.now();
  session.messageCount++;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      let fullText = "";
      let rpc: Awaited<ReturnType<typeof ctx.pool.acquire>>;
      try {
        rpc = await ctx.pool.acquire(sessionKey, profile);
      } catch (err: any) {
        send({ type: "error", error: err?.message ?? "Pool acquire failed" });
        controller.close();
        return;
      }

      session.rpcProcessId = rpc.id;
      session.isStreaming = true;

      const unsub = rpc.onEvent((event) => {
        if (rpc.sessionKey !== sessionKey) return;

        if (event.type === "message_update") {
          const ame = getAssistantMessageEvent(event);
          if (ame?.type === "text_delta" && ame.delta) {
            fullText += ame.delta;
            send({ type: "delta", text: ame.delta });
          }
          if (ame?.type === "thinking_start") {
            send({ type: "delta", text: "\n<think>\n" });
          }
          if (ame?.type === "thinking_delta" && ame.delta) {
            send({ type: "delta", text: ame.delta });
          }
          if (ame?.type === "thinking_end") {
            send({ type: "delta", text: "\n</think>\n" });
          }
        }
        if (event.type === "tool_execution_start") {
          const label = (event.args as Record<string, unknown>)?.label || event.toolName;
          send({ type: "tool", name: event.toolName, label });
        }
        if (event.type === "tool_execution_end") {
          send({ type: "tool_end", name: event.toolName, isError: event.isError });
        }
      });

      try {
        await rpc.prompt(body.message!, normalizedImages);
        await rpc.waitForIdle();
      } catch (err: any) {
        send({ type: "error", error: err?.message ?? "Agent error" });
      } finally {
        unsub();
        session.isStreaming = false;
      }

      send({ type: "done", reply: fullText, duration: Date.now() - startTime });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}
