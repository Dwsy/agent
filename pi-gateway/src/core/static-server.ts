/**
 * Static file serving for Web UI.
 * Serves from embedded WEB_ASSETS (production) or filesystem (dev mode).
 */

import { WEB_ASSETS } from "../_web-assets.ts";

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
};

export function serveStaticFile(pathname: string, noGui: boolean): Response {
  if (noGui) {
    return Response.json({ error: "Web UI disabled (--no-gui mode)" }, { status: 404 });
  }

  let filename: string;
  if (pathname === "/" || pathname === "/index.html") {
    filename = "index.html";
  } else if (pathname.startsWith("/web/")) {
    filename = pathname.slice(5);
  } else {
    return new Response("Not Found", { status: 404 });
  }

  const ext = filename.split(".").pop() ?? "";
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  // Compiled binary: serve from embedded assets
  const embedded = WEB_ASSETS[filename];
  if (embedded) {
    return new Response(embedded, {
      headers: { "content-type": contentType, "cache-control": "no-cache" },
    });
  }

  // Dev mode fallback: serve from filesystem
  const webDir = new URL("../web", import.meta.url).pathname;
  const file = Bun.file(`${webDir}/${filename}`);
  if (!file.size) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(file, {
    headers: { "content-type": contentType, "cache-control": "no-cache" },
  });
}
