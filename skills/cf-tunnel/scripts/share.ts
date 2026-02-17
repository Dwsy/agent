#!/usr/bin/env bun
// 通用临时暴露：任意本地端口 / 目录 / 单文件 -> trycloudflare 公网地址

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  findAvailablePort,
  isPortInUse,
  tmuxSessionExists,
  killTmuxSession,
  execSilent,
  printStatus,
} from "./lib/utils.ts";

const SHARE_DIR = path.join(os.homedir(), ".cf-tunnel");
const SHARE_FILE = path.join(SHARE_DIR, "share.json");
const SHARE_LOG = path.join(SHARE_DIR, "share-tunnel.log");

const WEB_SESSION = "cf-share-web";
const TUNNEL_SESSION = "cf-share-tunnel";

type ShareConfig = {
  mode: "port" | "dir" | "file";
  localPort: number;
  webDir?: string;
  filePath?: string;
  fileRoute?: string;
  startedAt: string;
};

function ensureShareDir(): void {
  if (!fs.existsSync(SHARE_DIR)) fs.mkdirSync(SHARE_DIR, { recursive: true });
}

function saveShareConfig(cfg: ShareConfig): void {
  ensureShareDir();
  fs.writeFileSync(SHARE_FILE, JSON.stringify(cfg, null, 2), "utf-8");
}

function loadShareConfig(): ShareConfig | null {
  try {
    if (!fs.existsSync(SHARE_FILE)) return null;
    return JSON.parse(fs.readFileSync(SHARE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function usage() {
  console.log(`
Cloudflare 临时暴露（底层命令）

推荐统一入口：
  bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts start --dir ./demos/html

底层用法：
  bun ~/.pi/agent/skills/cf-tunnel/scripts/share.ts start [--port 8766] [--dir ./demos/html] [--file ./demos/html/index.html] [--route /index.html]
  bun ~/.pi/agent/skills/cf-tunnel/scripts/share.ts status
  bun ~/.pi/agent/skills/cf-tunnel/scripts/share.ts stop

说明：
  - start + --port: 仅暴露已有本地端口
  - start + --dir : 自动起本地静态服务并暴露
  - start + --file: 以文件所在目录起服务，并提示文件访问路径
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? "status";

  let port: number | undefined;
  let dir: string | undefined;
  let file: string | undefined;
  let route: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const b = args[i + 1];
    if (a === "--port" && b) {
      port = parseInt(b, 10);
      i++;
    } else if (a === "--dir" && b) {
      dir = b;
      i++;
    } else if (a === "--file" && b) {
      file = b;
      i++;
    } else if (a === "--route" && b) {
      route = b;
      i++;
    }
  }

  return { cmd, port, dir, file, route };
}

function mustHaveCloudflared() {
  if (!execSilent("which cloudflared")) {
    console.error("❌ 未找到 cloudflared，请先安装");
    process.exit(1);
  }
}

function getTryUrlFromLog(): string | null {
  try {
    if (!fs.existsSync(SHARE_LOG)) return null;
    const content = fs.readFileSync(SHARE_LOG, "utf-8");
    const m = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    return m?.[0] ?? null;
  } catch {
    return null;
  }
}

function startLocalWeb(dir: string, port: number): void {
  if (tmuxSessionExists(WEB_SESSION)) killTmuxSession(WEB_SESSION);

  let serverCmd = "";
  if (execSilent("which python3")) {
    serverCmd = `python3 -m http.server ${port} --bind 0.0.0.0`;
  } else if (execSilent("which bunx")) {
    serverCmd = `bunx serve -p ${port}`;
  } else if (execSilent("which npx")) {
    serverCmd = `npx serve -p ${port}`;
  } else {
    console.error("❌ 未找到可用静态服务工具 (python3/bunx/npx)");
    process.exit(1);
  }

  execSync(`tmux new-session -d -s ${WEB_SESSION} -c \"${dir}\" \"${serverCmd}\"`, { stdio: "inherit" });
}

function startTunnel(port: number): void {
  if (tmuxSessionExists(TUNNEL_SESSION)) killTmuxSession(TUNNEL_SESSION);
  ensureShareDir();
  if (fs.existsSync(SHARE_LOG)) fs.unlinkSync(SHARE_LOG);

  const cmd = `cloudflared tunnel --no-autoupdate --url http://localhost:${port} > \"${SHARE_LOG}\" 2>&1`;
  execSync(`tmux new-session -d -s ${TUNNEL_SESSION} \"${cmd}\"`, { stdio: "inherit" });
}

async function waitTryUrl(timeoutMs = 12000): Promise<string | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const url = getTryUrlFromLog();
    if (url) return url;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function status() {
  const cfg = loadShareConfig();
  const webOn = tmuxSessionExists(WEB_SESSION);
  const tunnelOn = tmuxSessionExists(TUNNEL_SESSION);
  const url = getTryUrlFromLog();

  console.log("\n📊 临时暴露状态\n");
  printStatus(webOn ? "running" : "stopped", `本地服务 (${WEB_SESSION})`);
  printStatus(tunnelOn ? "running" : "stopped", `Cloudflare Tunnel (${TUNNEL_SESSION})`);

  if (cfg) {
    console.log(`\n模式: ${cfg.mode}`);
    console.log(`端口: ${cfg.localPort}`);
    if (cfg.webDir) console.log(`目录: ${cfg.webDir}`);
    if (cfg.filePath) console.log(`文件: ${cfg.filePath}`);
  }

  if (url) {
    console.log(`\n🌐 公网地址: ${url}`);
    if (cfg?.fileRoute) {
      const suffix = cfg.fileRoute.startsWith("/") ? cfg.fileRoute : `/${cfg.fileRoute}`;
      console.log(`📄 文件直达: ${url}${suffix}`);
    }
  } else {
    console.log("\n🌐 公网地址: (等待中或未启动)");
  }
  console.log("");
}

function stop() {
  if (tmuxSessionExists(WEB_SESSION)) killTmuxSession(WEB_SESSION);
  if (tmuxSessionExists(TUNNEL_SESSION)) killTmuxSession(TUNNEL_SESSION);
  printStatus("stopped", "已停止临时暴露会话");
}

async function start() {
  mustHaveCloudflared();
  const { port, dir, file, route } = parseArgs();

  const modes = [port ? 1 : 0, dir ? 1 : 0, file ? 1 : 0].reduce((a, b) => a + b, 0);
  if (modes > 1) {
    console.error("❌ --port / --dir / --file 只能选一个");
    process.exit(1);
  }

  let mode: ShareConfig["mode"] = "port";
  let localPort = port ?? 0;
  let webDir: string | undefined;
  let filePath: string | undefined;
  let fileRoute: string | undefined;

  if (file) {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) {
      console.error(`❌ 文件不存在: ${abs}`);
      process.exit(1);
    }
    mode = "file";
    filePath = abs;
    webDir = path.dirname(abs);
    fileRoute = route || `/${path.basename(abs)}`;
    localPort = localPort || findAvailablePort() || 8766;
    startLocalWeb(webDir, localPort);
  } else if (dir) {
    const absDir = path.resolve(dir);
    if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
      console.error(`❌ 目录不存在: ${absDir}`);
      process.exit(1);
    }
    mode = "dir";
    webDir = absDir;
    localPort = localPort || findAvailablePort() || 8766;
    startLocalWeb(webDir, localPort);
  } else {
    mode = "port";
    localPort = localPort || 8766;
    if (!isPortInUse(localPort)) {
      console.error(`❌ 端口 ${localPort} 未监听，请先启动本地服务，或改用 --dir/--file`);
      process.exit(1);
    }
  }

  startTunnel(localPort);

  const cfg: ShareConfig = {
    mode,
    localPort,
    webDir,
    filePath,
    fileRoute,
    startedAt: new Date().toISOString(),
  };
  saveShareConfig(cfg);

  const url = await waitTryUrl();

  console.log("\n✅ 临时暴露已启动\n");
  console.log(`本地: http://localhost:${localPort}`);
  if (url) {
    console.log(`公网: ${url}`);
    if (fileRoute) {
      const suffix = fileRoute.startsWith("/") ? fileRoute : `/${fileRoute}`;
      console.log(`文件: ${url}${suffix}`);
    }
  } else {
    console.log("公网: 还在建立中，稍后执行 status 查看");
  }
  console.log("\n管理命令:");
  console.log(`  bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts status`);
  console.log(`  bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts stop --share`);
  console.log(`  bun ~/.pi/agent/skills/cf-tunnel/scripts/share.ts status  # 底层命令`);
}

(async () => {
  const { cmd } = parseArgs();

  if (cmd === "start") {
    await start();
  } else if (cmd === "status") {
    status();
  } else if (cmd === "stop") {
    stop();
  } else if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    usage();
  } else {
    usage();
    process.exit(1);
  }
})();
