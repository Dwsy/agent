#!/usr/bin/env bun
// 查看日志

import { loadConfig, tmuxSessionExists } from "./lib/utils.ts";

const args = process.argv.slice(2);
const showWeb = args.includes("--web");
const showTunnel = args.includes("--tunnel");
const showAll = !showWeb && !showTunnel;

const config = loadConfig();
if (!config) {
  console.log("⚠️ 未找到配置\n");
  process.exit(1);
}

console.log("📜 日志查看\n");
console.log("提示: 按 Ctrl+B 然后 D 退出日志视图\n");

if ((showAll || showWeb) && tmuxSessionExists(config.tmux.webSession)) {
  console.log("正在打开 Web 服务器日志...\n");
  try {
    const { execSync } = await import("child_process");
    execSync(`tmux attach -t ${config.tmux.webSession}`, { stdio: "inherit" });
  } catch {
    // 用户退出
  }
}

if ((showAll || showTunnel) && tmuxSessionExists(config.tmux.tunnelSession)) {
  console.log("正在打开 Tunnel 日志...\n");
  try {
    const { execSync } = await import("child_process");
    execSync(`tmux attach -t ${config.tmux.tunnelSession}`, { stdio: "inherit" });
  } catch {
    // 用户退出
  }
}
