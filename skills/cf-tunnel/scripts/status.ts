#!/usr/bin/env bun
// 查看 Cloudflare Tunnel 状态

import {
  loadConfig,
  tmuxSessionExists,
  getTmuxSessionPid,
  isPortInUse,
  printStatus,
  execSilent,
} from "./lib/utils.ts";

console.log("📊 Cloudflare Tunnel 状态\n");

const config = loadConfig();
if (!config) {
  console.log("⚠️ 未找到配置\n");
  process.exit(1);
}

console.log("配置信息:");
console.log(`  隧道: ${config.tunnelName}`);
console.log(`  域名: ${config.hostname}`);
console.log(`  端口: ${config.localPort || "自动分配"}`);
console.log(`  目录: ${config.webDir}\n`);

console.log("服务状态:");

// Web 服务器状态
const webRunning = tmuxSessionExists(config.tmux.webSession);
if (webRunning) {
  const portOpen = isPortInUse(config.localPort);
  const pid = getTmuxSessionPid(config.tmux.webSession);
  printStatus("running", `Web 服务器 (tmux: ${config.tmux.webSession}, PID: ${pid}, 端口: ${portOpen ? "开放" : "关闭"})`);
} else {
  printStatus("stopped", "Web 服务器");
}

// Tunnel 状态
const tunnelRunning = tmuxSessionExists(config.tmux.tunnelSession);
if (tunnelRunning) {
  const pid = getTmuxSessionPid(config.tmux.tunnelSession);
  printStatus("running", `Cloudflare Tunnel (tmux: ${config.tmux.tunnelSession}, PID: ${pid})`);
} else {
  printStatus("stopped", "Cloudflare Tunnel");
}

console.log("\n访问地址:");
if (webRunning && tunnelRunning) {
  console.log(`  🌐 https://${config.hostname}`);
  console.log(`  🏠 http://localhost:${config.localPort}`);
} else if (webRunning) {
  console.log(`  🏠 http://localhost:${config.localPort} (仅本地)`);
} else {
  console.log("  ❌ 服务未运行");
}

// 检查 tunnel 健康状态
if (tunnelRunning) {
  console.log("\n健康检查:");
  try {
    const info = execSilent(`cloudflared tunnel info ${config.tunnelName} 2>/dev/null`);
    if (info) {
      console.log("  ✅ Tunnel 连接正常");
    } else {
      console.log("  🟡 无法获取 Tunnel 信息");
    }
  } catch {
    console.log("  🟡 Tunnel 信息获取失败");
  }
}

console.log("\n");
