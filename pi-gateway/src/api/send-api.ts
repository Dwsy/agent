/**
 * Send API handler — extracted from server.ts R3.
 *
 * POST /api/send — Send message to a channel target.
 *
 * @owner MintHawk (KeenUnion)
 */

import type { GatewayContext } from "../gateway/types.ts";

/**
 * POST /api/send — Send message via channel plugin.
 * Format: { to: "channel:target", message: "text" }
 */
export async function handleApiSend(req: Request, ctx: GatewayContext): Promise<Response> {
  try {
    const body = await req.json() as { to?: string; message?: string };
    if (!body.to || !body.message) {
      return Response.json({ error: "Both 'to' and 'message' are required" }, { status: 400 });
    }

    const colonIdx = body.to.indexOf(":");
    if (colonIdx === -1) {
      return Response.json({ error: "Invalid 'to' format. Use 'channel:target' (e.g. 'telegram:123456')" }, { status: 400 });
    }

    const channel = body.to.slice(0, colonIdx);
    const target = body.to.slice(colonIdx + 1);

    const ch = ctx.registry.channels.get(channel);
    if (!ch) {
      return Response.json({ error: `Channel not found: ${channel}` }, { status: 404 });
    }

    await ch.outbound.sendText(target, body.message);
    return Response.json({ ok: true });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Send failed" }, { status: 500 });
  }
}
