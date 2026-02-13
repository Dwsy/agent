/**
 * Session API — HTTP handlers for session management.
 *
 * Extracted from server.ts (P1 modularization).
 *
 * Handles:
 * - POST /api/session/reset  → reset a session (new conversation)
 * - POST /api/session/think  → set thinking level
 * - POST /api/session/model  → switch model
 * - GET  /api/models         → list available models
 * - GET  /api/session/usage  → token usage stats
 * - GET  /api/sessions       → list all sessions
 * - GET  /api/sessions/:key  → single session detail
 *
 * Source lines in server.ts (pre-extraction):
 * - handleApiSessionReset:  L1743-1766
 * - handleApiSessionThink:  L1771-1797
 * - handleApiSessionModel:  L1800-1843
 * - handleApiModels:        L1845-1858
 * - handleApiUsage:         L1860-1875
 * - sessions list:          L1374-1376 (inline)
 * - session detail:         L1379-1384 (inline)
 */

import type { GatewayContext } from "../gateway/types.ts";
import type { SessionKey } from "../core/types.ts";
import { resetSession } from "../gateway/session-reset.ts";

// ============================================================================
// POST /api/session/reset
// ============================================================================

export async function handleSessionReset(
  req: Request,
  _url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  try {
    const body = (await req.json()) as { sessionKey?: string };
    const sessionKey = (body.sessionKey ?? "agent:main:main:main") as SessionKey;

    const result = await resetSession(ctx, sessionKey);
    return Response.json({ ok: true, ...result });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Reset failed" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/session/think
// ============================================================================

const VALID_THINK_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

export async function handleSessionThink(
  req: Request,
  _url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  try {
    const body = (await req.json()) as { sessionKey?: string; level?: string };
    const sessionKey = (body.sessionKey ?? "agent:main:main:main") as SessionKey;
    const level = body.level ?? "medium";

    if (!VALID_THINK_LEVELS.includes(level)) {
      return Response.json(
        { error: `Invalid level. Use: ${VALID_THINK_LEVELS.join(", ")}` },
        { status: 400 },
      );
    }

    const rpc = ctx.pool.getForSession(sessionKey);
    if (!rpc) {
      return Response.json({ error: "No active RPC process for this session" }, { status: 404 });
    }

    await rpc.setThinkingLevel(level);
    return Response.json({ ok: true, sessionKey, level });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/session/model
// ============================================================================

export async function handleSessionModel(
  req: Request,
  _url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      sessionKey?: string;
      provider?: string;
      modelId?: string;
      model?: string;
    };
    const sessionKey = (body.sessionKey ?? "agent:main:main:main") as SessionKey;

    let provider = body.provider;
    let modelId = body.modelId;

    // Support "provider/modelId" shorthand
    if (body.model && body.model.includes("/")) {
      const idx = body.model.indexOf("/");
      provider = body.model.slice(0, idx);
      modelId = body.model.slice(idx + 1);
    }

    if (!provider || !modelId) {
      return Response.json(
        { error: "Provide 'model' as 'provider/modelId' or separate 'provider' + 'modelId'" },
        { status: 400 },
      );
    }

    const rpc = ctx.pool.getForSession(sessionKey);
    if (!rpc) {
      return Response.json({ error: "No active RPC process for this session" }, { status: 404 });
    }

    await rpc.setModel(provider, modelId);
    return Response.json({ ok: true, sessionKey, provider, modelId });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// ============================================================================
// GET /api/models
// ============================================================================

export async function handleModelsList(
  _req: Request,
  url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  const sessionKey = (url.searchParams.get("sessionKey") ?? "agent:main:main:main") as SessionKey;
  const rpc = ctx.pool.getForSession(sessionKey);
  if (!rpc) {
    return Response.json({ error: "No active session. Send a message first." }, { status: 404 });
  }
  try {
    const models = await rpc.getAvailableModels();
    return Response.json({ models });
  } catch (err: unknown) {
    return Response.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

// ============================================================================
// GET /api/session/usage
// ============================================================================

export async function handleSessionUsage(
  _req: Request,
  url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  const sessionKey = (url.searchParams.get("sessionKey") ?? "agent:main:main:main") as SessionKey;
  const rpc = ctx.pool.getForSession(sessionKey);
  if (!rpc) {
    return Response.json({ error: "No active session" }, { status: 404 });
  }
  try {
    const stats = await rpc.getSessionStats();
    return Response.json({ sessionKey, stats });
  } catch (err: unknown) {
    return Response.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

// ============================================================================
// GET /api/session/status — combined stats + state + session info
// ============================================================================

export async function handleSessionStatus(
  _req: Request,
  url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  const sessionKey = (url.searchParams.get("sessionKey") ?? "agent:main:main:main") as SessionKey;
  const rpc = ctx.pool.getForSession(sessionKey);
  if (!rpc) {
    return Response.json({ error: "No active session" }, { status: 404 });
  }
  try {
    const [stats, state] = await Promise.all([
      rpc.getSessionStats(),
      rpc.getState(),
    ]);
    const session = ctx.sessions.get(sessionKey);
    return Response.json({
      sessionKey,
      stats,
      state,
      messageCount: session?.messageCount ?? 0,
      isStreaming: session?.isStreaming ?? false,
      lastActivity: session?.lastActivity ?? null,
    });
  } catch (err: unknown) {
    return Response.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

// ============================================================================
// GET /api/sessions + GET /api/sessions/:key
// ============================================================================

export async function handleSessionsList(
  _req: Request,
  _url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  return Response.json({ sessions: ctx.sessions.toArray() });
}

export async function handleSessionDetail(
  _req: Request,
  url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  const key = decodeURIComponent(url.pathname.slice("/api/sessions/".length)) as SessionKey;
  const session = ctx.sessions.get(key);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json({ session });
}
