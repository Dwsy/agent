const MAX_WIDGET_CODE_BYTES = 2 * 1024 * 1024;
const ALLOWED_RESOURCE_HOSTS = new Set([
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "esm.sh",
  "fonts.bunny.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "unpkg.com",
]);

export function validateWidgetCode(code: string, interactive = false): void {
  if (Buffer.byteLength(code, "utf8") > MAX_WIDGET_CODE_BYTES) {
    throw new Error("widget_code must be smaller than 2 MB. Aggregate or downsample inline data.");
  }
  if (/<!doctype|<\/?(?:html|head|body)\b/i.test(code)) {
    throw new Error("widget_code must be an HTML fragment without DOCTYPE, html, head, or body tags.");
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*(?:\(|=|new\b)/i.test(code)) {
    throw new Error("widget_code cannot use fetch, XMLHttpRequest, or WebSocket. Keep widget data inline.");
  }
  for (const match of code.matchAll(/<(?:script|link|img|audio|video|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const source = match[1];
    if (source.startsWith("data:") || source.startsWith("blob:") || !/^https?:\/\//i.test(source)) continue;
    let host: string;
    try {
      host = new URL(source).hostname;
    } catch {
      throw new Error("widget_code contains an invalid external resource URL.");
    }
    if (!ALLOWED_RESOURCE_HOSTS.has(host)) {
      throw new Error("External widget resources must use an approved CDN host.");
    }
  }
  if (interactive && !/(?:window\.glimpse\.send|sendWidgetEvent|sendPrompt|sendAnnotation)\s*\(/.test(code)) {
    throw new Error("interactive widgets must send a choice or follow-up request through the widget event bridge.");
  }
}
