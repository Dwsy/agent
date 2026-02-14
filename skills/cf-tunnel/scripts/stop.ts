#!/usr/bin/env bun
// 停止 Cloudflare Tunnel 和本地服务器

import {
  loadConfig,
  tmuxSessionExists,
  killTmuxSession,
  printStatus,
} from "./lib/utils.ts";

console.log("🛑 停止 Cloudflare Tunnel\n");

const config = loadConfig();
if (!config) {
  console.log("⚠️ 未找到配置\n");
  process.exit(1);
}

let stopped = false;

// 停止 Web 服务器
if (tmuxSessionExists(config.tmux.webSession)) {
  console.log(`停止 Web 服务器 (${config.tmux.webSession})...`);
  killTmuxSession(config.tmux.webSession);
  printStatus("stopped", "Web 服务器已停止");
  stopped = true;
} else {
  printStatus("stopped", "Web 服务器未运行");
}

// 停止 Tunnel
if (tmuxSessionExists(config.tmux.tunnelSession)) {
  console.log(`\n停止 Cloudflare Tunnel (${config.tmux.tunnelSession})...`);
  killTmuxSession(config.tmux.tunnelSession);
  printStatus("stopped", "Cloudflare Tunnel 已停止");
  stopped = true;
} else {
  printStatus("stopped", "Cloudflare Tunnel 未运行");
}

console.log(stopped ? "\n✅ 已停止" : "\n所有服务已处于停止状态");
console.log("\n启动命令:");
console.log(`  bun ~/.pi/agent/skills/cf-tunnel/scripts/start.ts\n`);
