#!/usr/bin/env bun
// 统一入口：Cloudflare 临时暴露 + 管理面板

import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  findAvailablePort,
  isPortInUse,
  tmuxSessionExists,
  killTmuxSession,
  execSilent,
  printStatus,
} from "./lib/utils.ts";

const SCRIPT_DIR = import.meta.dir;
const SHARE_SCRIPT = path.join(SCRIPT_DIR, "share.ts");
const PANEL_SCRIPT = path.join(SCRIPT_DIR, "panel.ts");

const SHARE_DIR = path.join(os.homedir(), ".cf-tunnel");
const SHARE_FILE = path.join(SHARE_DIR, "share.json");
const SHARE_LOG = path.join(SHARE_DIR, "share-tunnel.log");
const PANEL_STATE = path.join(SHARE_DIR, "panel.json");

const PANEL_SESSION = "cf-share-panel";
const DEFAULT_PANEL_PORT = 8788;
const DEFAULT_PANEL_HOST = "127.0.0.1";

type PanelState = {
  host: string;
  port: number;
  startedAt: string;
  session: string;
};

type Parsed = {
  cmd: string;
  sub?: string;
  flags: Record<string, string | boolean>;
  rest: string[];
};

function usage() {
  console.log(`
CF Tunnel 统一命令（Bun CLI）

用法：
  bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts <command> [options]

主命令：
  start [share options]     启动临时暴露（等同 share start）
  stop [--all|--share|--panel]
                            停止服务（默认 --all）
  status                    查看 share + panel 综合状态

子命令：
  share start [--port N|--dir PATH|--file PATH] [--route /path]
  share status
  share stop

  panel start [--port N|--host 127.0.0.1]
  panel status
  panel stop

示例：
  bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts start --dir ./demos/html
  bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts panel start --port 8788
  bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts status
`);
}

function ensureShareDir() {
  if (!fs.existsSync(SHARE_DIR)) fs.mkdirSync(SHARE_DIR, { recursive: true });
}

function parseArgs(argv: string[]): Parsed {
  const [cmd = "status", maybeSub, ...restRaw] = argv;
  const hasSub = cmd === "share" || cmd === "panel";
  const sub = hasSub ? maybeSub || "status" : undefined;
  const rest = hasSub ? restRaw : [maybeSub, ...restRaw].filter(Boolean) as string[];

  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }

  return { cmd, sub, flags, rest: positional };
}

function loadPanelState(): PanelState | null {
  try {
    if (!fs.existsSync(PANEL_STATE)) return null;
    return JSON.parse(fs.readFileSync(PANEL_STATE, "utf-8"));
  } catch {
    return null;
  }
}

function savePanelState(state: PanelState) {
  ensureShareDir();
  fs.writeFileSync(PANEL_STATE, JSON.stringify(state, null, 2), "utf-8");
}

function removePanelState() {
  try {
    if (fs.existsSync(PANEL_STATE)) fs.unlinkSync(PANEL_STATE);
  } catch {
    // ignore
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

function loadShareConfig(): any | null {
  try {
    if (!fs.existsSync(SHARE_FILE)) return null;
    return JSON.parse(fs.readFileSync(SHARE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function runShare(args: string[]): number {
  try {
    execSync(`bun "${SHARE_SCRIPT}" ${args.map((a) => `"${a.replaceAll('"', '\\"')}"`).join(" ")}`, {
      stdio: "inherit",
    });
    return 0;
  } catch {
    return 1;
  }
}

function startPanel(flags: Record<string, string | boolean>) {
  if (tmuxSessionExists(PANEL_SESSION)) {
    const current = loadPanelState();
    printStatus("running", `Panel 已运行: http://${current?.host ?? DEFAULT_PANEL_HOST}:${current?.port ?? DEFAULT_PANEL_PORT}`);
    return;
  }

  const host = String(flags.host || DEFAULT_PANEL_HOST);
  const requestedPort = Number(flags.port || DEFAULT_PANEL_PORT);
  let port = Number.isFinite(requestedPort) ? requestedPort : DEFAULT_PANEL_PORT;

  if (isPortInUse(port)) {
    const nextPort = findAvailablePort(port + 1, 50);
    if (!nextPort) {
      console.error(`❌ 面板端口 ${port} 被占用，且未找到可用端口`);
      process.exit(1);
    }
    console.log(`⚠️ 端口 ${port} 被占用，自动改用 ${nextPort}`);
    port = nextPort;
  }

  const cmd = `bun "${PANEL_SCRIPT}" --port ${port} --host ${host}`;
  execSync(`tmux new-session -d -s ${PANEL_SESSION} "${cmd}"`, { stdio: "inherit" });

  savePanelState({ host, port, startedAt: new Date().toISOString(), session: PANEL_SESSION });
  printStatus("running", `Panel 已启动: http://${host}:${port}`);
}

function stopPanel() {
  if (tmuxSessionExists(PANEL_SESSION)) {
    killTmuxSession(PANEL_SESSION);
    printStatus("stopped", "Panel 已停止");
  } else {
    printStatus("stopped", "Panel 未运行");
  }
  removePanelState();
}

function statusPanel() {
  const running = tmuxSessionExists(PANEL_SESSION);
  const state = loadPanelState();
  printStatus(running ? "running" : "stopped", "Panel (cf-share-panel)");
  if (running) {
    const host = state?.host ?? DEFAULT_PANEL_HOST;
    const port = state?.port ?? DEFAULT_PANEL_PORT;
    console.log(`   URL: http://${host}:${port}`);
  }
}

function statusAll() {
  console.log("\n📊 CF Tunnel 综合状态\n");

  const shareCfg = loadShareConfig();
  const shareUrl = getTryUrlFromLog();

  const webRunning = tmuxSessionExists("cf-share-web");
  const tunnelRunning = tmuxSessionExists("cf-share-tunnel");
  printStatus(webRunning ? "running" : "stopped", "Share Web (cf-share-web)");
  printStatus(tunnelRunning ? "running" : "stopped", "Share Tunnel (cf-share-tunnel)");

  if (shareCfg) {
    console.log(`   模式: ${shareCfg.mode}`);
    console.log(`   端口: ${shareCfg.localPort}`);
  }

  console.log(`   公网: ${shareUrl ?? "(等待中或未启动)"}`);

  if (shareCfg?.fileRoute && shareUrl) {
    const route = String(shareCfg.fileRoute).startsWith("/")
      ? shareCfg.fileRoute
      : `/${shareCfg.fileRoute}`;
    console.log(`   文件: ${shareUrl}${route}`);
  }

  console.log("");
  statusPanel();
  console.log("");
}

function stopAll(flags: Record<string, string | boolean>) {
  const stopShareOnly = Boolean(flags.share);
  const stopPanelOnly = Boolean(flags.panel);
  const stopAll = Boolean(flags.all) || (!stopShareOnly && !stopPanelOnly);

  if (stopAll || stopShareOnly) {
    runShare(["stop"]);
  }
  if (stopAll || stopPanelOnly) {
    stopPanel();
  }
}

(function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (["help", "--help", "-h"].includes(parsed.cmd)) {
    usage();
    return;
  }

  if (parsed.cmd === "start") {
    process.exit(runShare(["start", ...process.argv.slice(3)]));
  }

  if (parsed.cmd === "stop") {
    stopAll(parsed.flags);
    return;
  }

  if (parsed.cmd === "status") {
    statusAll();
    return;
  }

  if (parsed.cmd === "share") {
    const sub = parsed.sub || "status";
    if (!["start", "stop", "status"].includes(sub)) {
      usage();
      process.exit(1);
    }
    process.exit(runShare([sub, ...process.argv.slice(4)]));
  }

  if (parsed.cmd === "panel") {
    const sub = parsed.sub || "status";
    if (sub === "start") {
      startPanel(parsed.flags);
      return;
    }
    if (sub === "stop") {
      stopPanel();
      return;
    }
    if (sub === "status") {
      statusPanel();
      return;
    }
    usage();
    process.exit(1);
  }

  usage();
  process.exit(1);
})();
