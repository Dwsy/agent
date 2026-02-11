/**
 * POST /api/media/send — Tool-based media sending (v3.3)
 *
 * Called by the gateway-tools extension's send_media tool.
 * Validates the request, checks path security, resolves media type,
 * and returns a MEDIA: directive for the channel handler to deliver.
 *
 * Auth: sessionKey must be a valid active session in the RPC pool,
 * OR request must carry a valid PI_GATEWAY_INTERNAL_TOKEN.
 */

import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import type { Config } from "../core/config.ts";
import { validateMediaPath } from "../core/media-security.ts";
import type { RpcPool } from "../core/rpc-pool.ts";
import type { Logger, SessionKey } from "../core/types.ts";

const PHOTO_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const AUDIO_EXTS = new Set(["mp3", "ogg", "wav", "m4a", "flac"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi"]);

export interface MediaSendContext {
  config: Config;
  pool: RpcPool;
  log: Logger;
}

export async function handleMediaSendRequest(
  req: Request,
  ctx: MediaSendContext,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
  const internalToken = typeof body.token === "string" ? body.token.trim() : "";
  const filePath = typeof body.path === "string" ? body.path.trim() : "";
  const caption = typeof body.caption === "string" ? body.caption.trim() : undefined;
  const mediaType = typeof body.type === "string" ? body.type.trim() : undefined;

  if (!filePath) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  // Auth: verify via active session OR internal token
  if (sessionKey) {
    if (!ctx.pool.getForSession(sessionKey as SessionKey)) {
      return Response.json({ error: "Invalid or inactive session" }, { status: 403 });
    }
  } else if (internalToken) {
    const expected = getGatewayInternalToken(ctx.config);
    if (internalToken !== expected) {
      return Response.json({ error: "Invalid token" }, { status: 403 });
    }
  } else {
    return Response.json({ error: "Missing sessionKey or token" }, { status: 400 });
  }

  // Resolve workspace
  const agentId = sessionKey ? (sessionKey.split(":")[1] || "main") : "main";
  const agentDef = ctx.config.agents?.list.find((a) => a.id === agentId);
  const workspace = agentDef?.workspace ?? process.cwd();

  // Validate path security
  if (!validateMediaPath(filePath, workspace)) {
    return Response.json({ error: "Path blocked by security policy" }, { status: 403 });
  }

  const fullPath = pathResolve(workspace, filePath);
  if (!existsSync(fullPath)) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  // Infer media type from extension if not provided
  const ext = fullPath.split(".").pop()?.toLowerCase() || "";
  const resolvedType =
    mediaType ||
    (PHOTO_EXTS.has(ext) ? "photo" : AUDIO_EXTS.has(ext) ? "audio" : VIDEO_EXTS.has(ext) ? "video" : "document");

  // Parse channel from session key (format: agent:{agentId}:{channel}:{scope}:{id})
  const channel = sessionKey ? (sessionKey.split(":")[2] || "unknown") : "unknown";

  ctx.log.info(`[media-send] session=${sessionKey || "token-auth"} path=${filePath} type=${resolvedType} channel=${channel}`);

  return Response.json({
    ok: true,
    path: filePath,
    type: resolvedType,
    caption: caption || null,
    channel,
    directive: `MEDIA:${filePath}`,
  });
}

// ============================================================================
// Internal Token
// ============================================================================

let cachedToken: string | null = null;

/**
 * Derive a stable internal token from the gateway config.
 * Used to authenticate requests from spawned pi processes back to the gateway.
 * Token is per-process (includes PID), not persistent — regenerated on each gateway restart.
 * This is safe because spawned pi processes always receive fresh env vars at spawn time.
 */
export function getGatewayInternalToken(config: Config): string {
  if (cachedToken) return cachedToken;
  const { createHash } = require("node:crypto");
  // Derive from port + bind + auth config — stable across restarts with same config
  const seed = JSON.stringify({
    port: config.gateway.port,
    bind: config.gateway.bind,
    auth: config.gateway.auth,
    pid: process.pid,
  });
  cachedToken = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return cachedToken;
}

/** Reset cached token (for testing). */
export function resetInternalToken(): void {
  cachedToken = null;
}
