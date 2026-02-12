/**
 * POST /api/media/send — Direct media delivery via channel plugins (v3.3)
 *
 * Called by the gateway-tools extension's send_media tool.
 * Validates the request, resolves the channel plugin, and delivers
 * the media file directly — no MEDIA: directive round-trip.
 *
 * Auth: internalToken (HMAC-SHA256, per-process) OR active sessionKey.
 */

import { existsSync } from "node:fs";
import { resolve as pathResolve, isAbsolute } from "node:path";
import type { Config } from "../core/config.ts";
import type { SessionKey } from "../core/types.ts";
import { validateMediaPath } from "../core/media-security.ts";
import type { RpcPool } from "../core/rpc-pool.ts";
import type { Logger } from "../core/types.ts";
import type { PluginRegistryState } from "../plugins/loader.ts";
import type { SessionStore } from "../core/session-store.ts";

/** Allowed absolute path prefixes for agent tool calls (send_media). */
const ALLOWED_ABSOLUTE_PREFIXES = [
  "/tmp/",
  "/private/tmp/",
  "/var/folders/",  // macOS per-user temp
];

/**
 * Check if an absolute path is allowed for send_media.
 * Agent tools can access temp dirs; other absolute paths are blocked.
 */
function isAllowedAbsolutePath(filePath: string, workspace: string): boolean {
  if (!isAbsolute(filePath)) return false;
  // Allow files within workspace (absolute workspace path)
  const resolvedWorkspace = pathResolve(workspace);
  if (filePath.startsWith(resolvedWorkspace + "/")) return true;
  // Allow known temp directories
  return ALLOWED_ABSOLUTE_PREFIXES.some(prefix => filePath.startsWith(prefix));
}

const PHOTO_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const AUDIO_EXTS = new Set(["mp3", "ogg", "wav", "m4a", "flac", "aiff", "aac", "opus", "wma"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi"]);

export interface MediaSendContext {
  config: Config;
  pool: RpcPool;
  registry: PluginRegistryState;
  sessions: SessionStore;
  log: Logger;
  broadcastToWs?: (event: string, payload: unknown) => void;
  /** Called after successful delivery — used to track cron self-delivery. */
  onDelivered?: (sessionKey: string) => void;
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

  let sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
  const internalToken = typeof body.token === "string" ? body.token.trim() : "";
  const callerPid = typeof body.pid === "number" ? body.pid : 0;
  const filePath = typeof body.path === "string" ? body.path.trim() : "";
  const caption = typeof body.caption === "string" ? body.caption.trim() : undefined;
  const mediaType = typeof body.type === "string" ? body.type.trim() : undefined;

  if (!filePath) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  ctx.log.info(`[media-send] request: path=${filePath} sessionKey=${sessionKey || "(empty)"} pid=${callerPid} token=${internalToken ? "yes" : "no"}`);

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
    // Resolve session key from caller PID (extension passes process.pid)
    if (callerPid > 0) {
      const client = ctx.pool.getByPid(callerPid);
      if (client?.sessionKey) {
        sessionKey = client.sessionKey;
        ctx.log.info(`[media-send] resolved session from PID ${callerPid}: ${sessionKey}`);
      } else {
        ctx.log.warn(`[media-send] PID ${callerPid} not found in pool — cannot resolve session`);
      }
    }
  } else {
    return Response.json({ error: "Missing sessionKey or token" }, { status: 400 });
  }

  // Resolve workspace — prefer RPC client's CWD (where agent creates files)
  const agentId = sessionKey ? (sessionKey.split(":")[1] || "main") : "main";
  const agentDef = ctx.config.agents?.list.find((a) => a.id === agentId);
  const rpcClient = sessionKey ? ctx.pool.getForSession(sessionKey as SessionKey) : (callerPid > 0 ? ctx.pool.getByPid(callerPid) : null);
  const workspace = rpcClient?.cwd ?? agentDef?.workspace ?? process.cwd();

  // Path validation
  const workspaceOnly = ctx.config.media?.workspaceOnly ?? false;
  let fullPath: string;
  if (isAbsolute(filePath)) {
    if (workspaceOnly && !isAllowedAbsolutePath(filePath, workspace)) {
      return Response.json({ error: "Absolute path not in allowed directories" }, { status: 403 });
    }
    fullPath = filePath;
  } else {
    // Basic safety checks even when workspaceOnly is off
    if (filePath.includes("\0") || filePath.includes("..")) {
      return Response.json({ error: "Path blocked by security policy" }, { status: 403 });
    }
    if (workspaceOnly && !validateMediaPath(filePath, workspace)) {
      return Response.json({ error: "Path blocked by security policy" }, { status: 403 });
    }
    fullPath = pathResolve(workspace, filePath);
  }

  if (!existsSync(fullPath)) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  // Infer media type from extension if not provided
  const ext = fullPath.split(".").pop()?.toLowerCase() || "";
  const resolvedType =
    mediaType ||
    (PHOTO_EXTS.has(ext) ? "photo" : AUDIO_EXTS.has(ext) ? "audio" : VIDEO_EXTS.has(ext) ? "video" : "document");

  // Resolve channel + chatId from session
  const session = sessionKey ? ctx.sessions.get(sessionKey as SessionKey) : undefined;
  const channel = session?.lastChannel || (sessionKey ? sessionKey.split(":")[2] : undefined);
  const chatId = session?.lastChatId;

  if (!channel) {
    ctx.log.warn(`[media-send] no channel: sessionKey=${sessionKey} lastChannel=${session?.lastChannel} sessionExists=${!!session} totalSessions=${ctx.sessions.size}`);
    return Response.json({ error: "Cannot resolve channel from session" }, { status: 400 });
  }

  // Find channel plugin
  const channelPlugin = ctx.registry.channels.get(channel);
  if (!channelPlugin) {
    return Response.json({ error: `Channel plugin not found: ${channel}` }, { status: 404 });
  }

  if (!channelPlugin.outbound.sendMedia) {
    // WebChat: push signed URL via WS instead of returning a directive
    if (channel === "webchat" && ctx.broadcastToWs) {
      const { sendWebChatMedia } = await import("./media-routes.ts");
      const result = sendWebChatMedia(sessionKey, filePath, ctx.config, ctx.broadcastToWs, {
        caption,
        type: resolvedType as "photo" | "audio" | "video" | "document",
      });
      if (result.ok) {
        ctx.log.info(`[media-send] webchat push: sessionKey=${sessionKey} path=${filePath}`);
        return Response.json({
          ok: true,
          delivered: true,
          url: result.url,
          path: filePath,
          type: resolvedType,
          channel,
        });
      }
      return Response.json({ error: "Media path blocked or file not found" }, { status: 403 });
    }

    // Other channels: return directive fallback
    ctx.log.info(`[media-send] channel=${channel} lacks sendMedia, returning directive fallback`);
    return Response.json({
      ok: true,
      delivered: false,
      directive: `MEDIA:${filePath}`,
      path: filePath,
      type: resolvedType,
      channel,
    });
  }

  if (!chatId) {
    return Response.json({ error: "Cannot resolve chatId — no messages received in this session yet" }, { status: 400 });
  }

  ctx.log.info(`[media-send] direct delivery: channel=${channel} chatId=${chatId} path=${filePath} type=${resolvedType}`);

  try {
    const result = await channelPlugin.outbound.sendMedia(chatId, fullPath, {
      type: resolvedType as "photo" | "audio" | "document" | "video",
      caption,
    });

    if (!result.ok) {
      ctx.log.error(`[media-send] channel delivery failed: ${result.error}`);
      return Response.json({
        error: result.error ?? "Channel delivery failed",
        delivered: false,
        path: filePath,
        type: resolvedType,
        channel,
      }, { status: 502 });
    }

    if (sessionKey) ctx.onDelivered?.(sessionKey);

    return Response.json({
      ok: true,
      delivered: true,
      messageId: result.messageId,
      path: filePath,
      type: resolvedType,
      channel,
    });
  } catch (err: any) {
    ctx.log.error(`[media-send] delivery failed: ${err?.message}`);
    return Response.json({ error: err?.message ?? "Media delivery failed" }, { status: 500 });
  }
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
  const seed = JSON.stringify({
    port: config.gateway.port,
    bind: config.gateway.bind,
    auth: config.gateway.auth,
    pid: process.pid,
  });
  cachedToken = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return cachedToken!;
}

/** Reset cached token (for testing). */
export function resetInternalToken(): void {
  cachedToken = null;
}
