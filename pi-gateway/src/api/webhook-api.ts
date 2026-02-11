/**
 * Webhook API handlers — /hooks/wake, /hooks/event
 */

import { safeTokenCompare } from "../core/auth.ts";
import type { Config } from "../core/config.ts";
import type { PrioritizedWork } from "../core/message-queue.ts";
import type { GatewayContext } from "../gateway/types.ts";

function checkWebhookAuth(req: Request, config: Config): Response | null {
  if (!config.hooks.enabled) {
    return new Response("Webhooks disabled", { status: 403 });
  }
  if (config.hooks.token) {
    const auth = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!auth || !safeTokenCompare(auth, config.hooks.token)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }
  return null;
}

export async function handleWebhookWake(req: Request, ctx: GatewayContext): Promise<Response> {
  const authErr = checkWebhookAuth(req, ctx.config);
  if (authErr) return authErr;

  try {
    const body = await req.json() as { text?: string; sessionKey?: string; mode?: "now" | "next-heartbeat" };
    if (!body.text) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }

    const sessionKey = body.sessionKey ?? "agent:main:main:main";
    const webhookItem: PrioritizedWork = {
      work: async () => {
        const role = ctx.sessions.get(sessionKey)?.role ?? "default";
        const profile = ctx.buildSessionProfile(sessionKey, role);
        const rpc = await ctx.pool.acquire(sessionKey, profile);
        await rpc.prompt(`[WEBHOOK] ${body.text}`);
        await rpc.waitForIdle();
      },
      priority: ctx.config.queue.priority.webhook,
      enqueuedAt: Date.now(),
      ttl: 30000,
      text: body.text,
      summaryLine: `[WEBHOOK] ${body.text.slice(0, 120)}`,
    };
    const enqueued = ctx.queue.enqueue(sessionKey, webhookItem);

    if (!enqueued) {
      return Response.json({ error: "Queue full", sessionKey }, { status: 429 });
    }

    return Response.json({ ok: true, sessionKey });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function handleWebhookEvent(req: Request, ctx: GatewayContext): Promise<Response> {
  const authErr = checkWebhookAuth(req, ctx.config);
  if (authErr) return authErr;

  try {
    const body = await req.json() as { event: string; payload?: unknown };
    if (!body.event) {
      return Response.json({ error: "event is required" }, { status: 400 });
    }

    ctx.broadcastToWs(`hook:${body.event}`, body.payload ?? {});
    return Response.json({ ok: true, event: body.event });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}
