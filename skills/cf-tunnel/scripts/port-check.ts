#!/usr/bin/env bun
// 端口检测工具

import {
  isPortInUse,
  getPortPid,
  getProcessInfo,
  findAvailablePort,
  execSilent,
  confirm,
} from "./lib/utils.ts";

const port = parseInt(process.argv[2], 10) || 8080;

console.log(`🔍 端口检测: ${port}\n`);

if (!isPortInUse(port)) {
  console.log(`✅ 端口 ${port} 可用\n`);
  process.exit(0);
}

const pid = getPortPid(port);
console.log(`❌ 端口 ${port} 已被占用\n`);

if (pid) {
  const info = getProcessInfo(pid);
  console.log("占用进程信息:");
  console.log(`  PID: ${pid}`);
  if (info) {
    console.log(`  命令: ${info.command}`);
    console.log(`  用户: ${info.user}`);
  }
  
  // 尝试获取更多信息
  const cmdline = execSilent(`cat /proc/${pid}/cmdline 2>/dev/null | tr '\\0' ' '`);
  if (cmdline) {
    console.log(`  完整命令: ${cmdline.substring(0, 100)}${cmdline.length > 100 ? "..." : ""}`);
  }
}

// 检查是否为 tmux 会话
const tmuxList = execSilent("tmux list-sessions -F '#{session_name} #{session_id}' 2>/dev/null");
if (tmuxList) {
  console.log("\n当前 tmux 会话:");
  console.log(tmuxList.split("\n").map(l => "  " + l).join("\n"));
}

console.log("\n选项:");
const available = findAvailablePort(port + 1);
if (available) {
  console.log(`  💡 推荐可用端口: ${available}`);
}

const shouldKill = await confirm("\n是否终止占用进程?");
if (shouldKill && pid) {
  console.log(`\n🛑 发送 SIGTERM 到进程 ${pid}...`);
  try {
    process.kill(pid, "SIGTERM");
    await new Promise(r => setTimeout(r, 1500));
    
    if (isPortInUse(port)) {
      console.log("进程未响应，发送 SIGKILL...");
      process.kill(pid, "SIGKILL");
      await new Promise(r => setTimeout(r, 500));
    }
    
    if (isPortInUse(port)) {
      console.log("❌ 无法终止进程（可能需要 sudo）\n");
    } else {
      console.log("✅ 端口已释放\n");
    }
  } catch (e) {
    console.error(`❌ 错误: ${e}\n`);
  }
}
