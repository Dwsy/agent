import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import type { Config } from "./config.ts";
import { validateMediaPath } from "./media-security.ts";
import { getMediaSecret, signMediaUrl } from "./media-token.ts";

export interface WebChatMediaOptions {
  caption?: string;
  type?: "photo" | "audio" | "video" | "document" | "sticker";
}

interface AgentDef {
  id: string;
  workspace?: string;
}

function resolveAgentWorkspace(config: Config, sessionKey: string): string {
  const agentId = sessionKey.split(":")[1] || "main";
  const agentDef = config.agents?.list?.find((a: AgentDef) => a.id === agentId);
  return (agentDef as AgentDef | undefined)?.workspace ?? process.cwd();
}

export function sendWebChatMediaEvent(
  config: Config,
  broadcastToWs: (event: string, payload: unknown) => void,
  sessionKey: string,
  filePath: string,
  opts?: WebChatMediaOptions,
): { ok: boolean; url: string } {
  const workspace = resolveAgentWorkspace(config, sessionKey);

  if (!validateMediaPath(filePath, workspace)) {
    return { ok: false, url: "" };
  }

  const fullPath = pathResolve(workspace, filePath);
  if (!existsSync(fullPath)) {
    return { ok: false, url: "" };
  }

  const secret = getMediaSecret(config.channels.webchat?.mediaSecret);
  const ttlMs = config.channels.webchat?.mediaTokenTtlMs ?? 3600_000;
  const url = signMediaUrl(sessionKey, filePath, secret, ttlMs);

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
  const type = opts?.type ?? (imageExts.has(ext) ? "photo" : "document");

  broadcastToWs("media_event", {
    sessionKey,
    url,
    type,
    caption: opts?.caption,
    filename: filePath.split("/").pop() || "file",
  });

  return { ok: true, url };
}
