/**
 * Media serving routes — extracted from server.ts for modularity.
 *
 * GET /api/media/:token/:filename — serve signed media files
 * processWebChatMediaDirectives() — parse MEDIA: directives in agent responses
 */

import { existsSync, statSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import type { Config } from "../core/config.ts";
import { validateMediaPath } from "../core/media-security.ts";
import { getMediaSecret, verifyMediaToken, signMediaUrl } from "../core/media-token.ts";

interface AgentDef {
  id: string;
  workspace?: string;
}

function resolveAgentWorkspace(config: Config, sessionKey: string): string {
  const agentId = sessionKey.split(":")[1] || "main";
  const agentDef = config.agents?.list?.find((a: AgentDef) => a.id === agentId);
  return (agentDef as AgentDef | undefined)?.workspace ?? process.cwd();
}

/**
 * Parse MEDIA: directives in agent response and convert to signed URLs.
 * Returns processed text (directives removed) and extracted image URLs.
 */
export function processWebChatMediaDirectives(
  text: string,
  sessionKey: string,
  config: Config,
): { text: string; images: string[] } {
  const images: string[] = [];
  const secret = getMediaSecret((config as any).channels?.webchat?.mediaSecret);
  const ttlMs = (config as any).channels?.webchat?.mediaTokenTtlMs ?? 3600_000;
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

  const processed = text.replace(/MEDIA:(\S+)/g, (_match, rawPath: string) => {
    const workspace = resolveAgentWorkspace(config, sessionKey);

    if (!validateMediaPath(rawPath, workspace)) {
      return `[blocked: ${rawPath}]`;
    }

    const url = signMediaUrl(sessionKey, rawPath, secret, ttlMs);
    const ext = rawPath.split(".").pop()?.toLowerCase() || "";

    if (imageExts.has(ext)) {
      images.push(url);
      return "";
    }
    return `[📎 ${rawPath.split("/").pop()}](${url})`;
  });

  return { text: processed.trim(), images };
}

/**
 * Handle GET /api/media/:token/:filename — serve signed media files.
 */
export function handleMediaServe(url: URL, config: Config): Response {
  const parts = url.pathname.slice("/api/media/".length).split("/");
  const token = parts[0];
  if (!token) return new Response("Bad Request", { status: 400 });

  const sk = url.searchParams.get("sk") || "";
  const filePath = url.searchParams.get("path") || "";
  const exp = url.searchParams.get("exp") || "";

  if (!sk || !filePath || !exp) {
    return new Response("Missing parameters", { status: 400 });
  }

  const secret = getMediaSecret((config as any).channels?.webchat?.mediaSecret);
  const verified = verifyMediaToken(token, sk, filePath, exp, secret);
  if (!verified) {
    return new Response("Forbidden", { status: 403 });
  }

  const workspace = resolveAgentWorkspace(config, sk);

  if (!validateMediaPath(filePath, workspace)) {
    return new Response("Forbidden", { status: 403 });
  }

  const fullPath = pathResolve(workspace, filePath);

  if (!existsSync(fullPath)) {
    return new Response("Not Found", { status: 404 });
  }

  const stat = statSync(fullPath);
  const maxMb = (config as any).channels?.webchat?.mediaMaxMb ?? 10;
  if (stat.size > maxMb * 1024 * 1024) {
    return new Response("File too large", { status: 413 });
  }

  const ext = fullPath.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    bmp: "image/bmp", ico: "image/x-icon",
  };
  const mime = mimeMap[ext] || "application/octet-stream";

  const file = Bun.file(fullPath);
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Length": String(stat.size),
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };

  if (ext === "svg") {
    const filename = filePath.split("/").pop() || "image.svg";
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    headers["Content-Security-Policy"] = "sandbox";
  }

  return new Response(file, { status: 200, headers });
}
