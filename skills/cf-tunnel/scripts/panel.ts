#!/usr/bin/env bun
// Cloudflare 通用临时暴露管理面板（本地）

import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { tmuxSessionExists, isPortInUse, findAvailablePort } from "./lib/utils.ts";

const SHARE_DIR = join(homedir(), ".cf-tunnel");
const SHARE_FILE = join(SHARE_DIR, "share.json");
const SHARE_LOG = join(SHARE_DIR, "share-tunnel.log");
const HISTORY_FILE = join(SHARE_DIR, "share-history.json");
const WEB_SESSION = "cf-share-web";
const TUNNEL_SESSION = "cf-share-tunnel";
const SHARE_SCRIPT = join(import.meta.dir, "share.ts");
const PANEL_HTML = join(import.meta.dir, "../web/panel.html");

function ensureShareDir() {
  if (!existsSync(SHARE_DIR)) mkdirSync(SHARE_DIR, { recursive: true });
}

function parsePanelArgs() {
  const args = process.argv.slice(2);

  // 兼容旧用法：panel.ts 8790 0.0.0.0
  let legacyPort: string | undefined;
  let legacyHost: string | undefined;
  if (args[0] && !args[0].startsWith("--")) legacyPort = args[0];
  if (args[1] && !args[1].startsWith("--")) legacyHost = args[1];

  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const b = args[i + 1];
    if (!a.startsWith("--")) continue;
    if (b && !b.startsWith("--")) {
      flags[a.slice(2)] = b;
      i++;
    } else {
      flags[a.slice(2)] = "true";
    }
  }

  const host = flags.host || legacyHost || "127.0.0.1";
  const askedPort = Number(flags.port || legacyPort || 8788);
  let port = Number.isFinite(askedPort) ? askedPort : 8788;

  if (isPortInUse(port)) {
    const fallback = findAvailablePort(port + 1, 50);
    if (!fallback) {
      console.error(`❌ 面板端口 ${port} 被占用，且未找到可用端口`);
      process.exit(1);
    }
    console.log(`⚠️ 面板端口 ${port} 被占用，自动改用 ${fallback}`);
    port = fallback;
  }

  return { host, port };
}

function getTryUrlFromLog(): string | null {
  try {
    if (!existsSync(SHARE_LOG)) return null;
    const content = readFileSync(SHARE_LOG, "utf-8");
    const m = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    return m?.[0] ?? null;
  } catch {
    return null;
  }
}

function getLastLogTail(lines = 40): string {
  try {
    if (!existsSync(SHARE_LOG)) return "";
    const content = readFileSync(SHARE_LOG, "utf-8").split("\n");
    return content.slice(-lines).join("\n").trim();
  } catch {
    return "";
  }
}

function loadShareConfig(): any | null {
  try {
    if (!existsSync(SHARE_FILE)) return null;
    return JSON.parse(readFileSync(SHARE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

type HistoryItem = {
  mode: string;
  localPort: number;
  webDir?: string;
  filePath?: string;
  fileRoute?: string;
  tunnelUrl: string;
  fileUrl?: string;
  startedAt?: string;
  stoppedAt?: string;
};

function loadHistory(): HistoryItem[] {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveHistory(list: HistoryItem[]) {
  ensureShareDir();
  writeFileSync(HISTORY_FILE, JSON.stringify(list.slice(0, 50), null, 2), "utf-8");
}

function pushHistory(item: HistoryItem) {
  const list = loadHistory();
  list.unshift(item);
  saveHistory(list);
}

function statusPayload() {
  const cfg = loadShareConfig();
  const tunnelUrl = getTryUrlFromLog();
  return {
    ok: true,
    webRunning: tmuxSessionExists(WEB_SESSION),
    tunnelRunning: tmuxSessionExists(TUNNEL_SESSION),
    config: cfg,
    tunnelUrl,
    fileUrl:
      cfg?.fileRoute && tunnelUrl
        ? `${tunnelUrl}${String(cfg.fileRoute).startsWith("/") ? cfg.fileRoute : `/${cfg.fileRoute}`}`
        : null,
    logTail: getLastLogTail(60),
    now: new Date().toISOString(),
  };
}

function runShare(args: string[]): { ok: boolean; output: string } {
  const result = spawnSync("bun", [SHARE_SCRIPT, ...args], {
    encoding: "utf-8",
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { ok: result.status === 0, output };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function recordStop() {
  const cfg = loadShareConfig();
  if (!cfg) return;
  const url = getTryUrlFromLog();
  if (url) {
    pushHistory({
      mode: cfg.mode,
      localPort: cfg.localPort,
      webDir: cfg.webDir,
      filePath: cfg.filePath,
      fileRoute: cfg.fileRoute,
      tunnelUrl: url,
      fileUrl: cfg.fileRoute
        ? `${url}${String(cfg.fileRoute).startsWith("/") ? cfg.fileRoute : `/${cfg.fileRoute}`}`
        : undefined,
      startedAt: cfg.startedAt,
      stoppedAt: new Date().toISOString(),
    });
  }
}

const { host, port } = parsePanelArgs();

const server = Bun.serve({
  port,
  hostname: host,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/panel")) {
      const html = readFileSync(PANEL_HTML, "utf-8");
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(statusPayload());
    }

    if (req.method === "POST" && url.pathname === "/api/start") {
      const body = (await req.json().catch(() => ({} as any))) as any;
      const args: string[] = ["start"];
      if (body?.port) args.push("--port", String(body.port));
      if (body?.dir) args.push("--dir", String(body.dir));
      if (body?.file) args.push("--file", String(body.file));
      if (body?.route) args.push("--route", String(body.route));

      const result = runShare(args);
      return json({ ...result, status: statusPayload() }, result.ok ? 200 : 500);
    }

    if (req.method === "POST" && url.pathname === "/api/stop") {
      recordStop();
      const result = runShare(["stop"]);
      return json({ ...result, status: statusPayload() }, result.ok ? 200 : 500);
    }

    if (req.method === "GET" && url.pathname === "/api/logs") {
      return json({ ok: true, logTail: getLastLogTail(200) });
    }

    if (req.method === "GET" && url.pathname === "/api/history") {
      return json({ ok: true, history: loadHistory() });
    }

    if (req.method === "POST" && url.pathname === "/api/history/clear") {
      saveHistory([]);
      return json({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`\n✨ CF Share Panel 已启动`);
console.log(`   http://${host}:${server.port}`);
console.log(`   管理接口: /api/status /api/start /api/stop /api/logs\n`);
