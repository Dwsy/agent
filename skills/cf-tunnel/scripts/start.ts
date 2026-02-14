#!/usr/bin/env bun
// 启动 Cloudflare Tunnel 和本地服务器

import {
  loadConfig,
  saveConfig,
  tmuxSessionExists,
  killTmuxSession,
  isPortInUse,
  getPortPid,
  getProcessInfo,
  findAvailablePort,
  printStatus,
  ensureDir,
  createSampleHtml,
  exec,
  execSilent,
  confirm,
} from "./lib/utils.ts";
import * as path from "path";
import * as fs from "fs";

console.log("🚀 启动 Cloudflare Tunnel\n");

// 解析参数
const args = process.argv.slice(2);
let customPort: number | null = null;
let customDir: string | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    customPort = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--dir" && args[i + 1]) {
    customDir = args[i + 1];
    i++;
  }
}

// 加载配置
let config = loadConfig();
if (!config) {
  console.log("⚠️ 未找到配置，请先运行初始化\n");
  console.log("  bun ~/.pi/agent/skills/cf-tunnel/scripts/init.ts\n");
  process.exit(1);
}

// 应用命令行参数
if (customPort) config.localPort = customPort;
if (customDir) config.webDir = customDir;
saveConfig(config);

// 确保网站目录存在
ensureDir(config.webDir);

// 如果没有 index.html，创建示例
const indexPath = path.join(config.webDir, "index.html");
if (!fs.existsSync(indexPath)) {
  console.log("📝 创建示例 index.html...\n");
  createSampleHtml(config.webDir);
}

// 自动检测并分配可用端口（除非用户明确指定）
let assignedPort: number;

if (customPort) {
  // 用户明确指定了端口，检查是否可用
  console.log(`🔍 检查指定端口 ${customPort}...`);
  if (isPortInUse(customPort)) {
    const pid = getPortPid(customPort);
    const info = pid ? getProcessInfo(pid) : null;
    
    console.log(`⚠️ 端口 ${customPort} 已被占用`);
    if (info) {
      console.log(`   进程: ${info.command} (PID: ${pid}, 用户: ${info.user})`);
    }
    
    console.log("\n选项:");
    console.log("  1. 终止占用进程");
    console.log("  2. 自动寻找其他端口");
    console.log("  3. 取消启动\n");
    
    const choice = await confirm("终止占用进程并继续?") ? "1" : 
                   await confirm("自动寻找其他端口?") ? "2" : "3";
    
    if (choice === "1" && pid) {
      console.log(`\n🛑 终止进程 ${pid}...`);
      try {
        process.kill(pid, "SIGTERM");
        await new Promise(r => setTimeout(r, 1000));
        if (isPortInUse(customPort)) {
          process.kill(pid, "SIGKILL");
        }
        console.log("✅ 进程已终止\n");
        assignedPort = customPort;
      } catch (e) {
        console.error("❌ 无法终止进程\n");
        process.exit(1);
      }
    } else if (choice === "2") {
      const newPort = findAvailablePort();
      if (!newPort) {
        console.error("❌ 未找到可用端口\n");
        process.exit(1);
      }
      console.log(`✅ 自动分配端口 ${newPort}\n`);
      assignedPort = newPort;
    } else {
      console.log("❌ 已取消\n");
      process.exit(0);
    }
  } else {
    console.log(`✅ 端口 ${customPort} 可用\n`);
    assignedPort = customPort;
  }
} else {
  // 自动寻找可用端口
  console.log("🔍 自动寻找可用端口...");
  const autoPort = findAvailablePort();
  if (!autoPort) {
    console.error("❌ 未找到可用端口\n");
    process.exit(1);
  }
  assignedPort = autoPort;
  console.log(`✅ 自动分配端口 ${assignedPort}\n`);
}

// 更新配置中的端口
config.localPort = assignedPort;
saveConfig(config);

// 检查现有会话
if (tmuxSessionExists(config.tmux.webSession)) {
  console.log("⚠️ Web 服务器已在运行");
  const restart = await confirm("是否重启?");
  if (restart) {
    killTmuxSession(config.tmux.webSession);
  } else {
    console.log("保持现有会话\n");
  }
}

if (tmuxSessionExists(config.tmux.tunnelSession)) {
  console.log("⚠️ Tunnel 已在运行");
  const restart = await confirm("是否重启?");
  if (restart) {
    killTmuxSession(config.tmux.tunnelSession);
  } else {
    console.log("保持现有会话\n");
  }
}

// 启动 Web 服务器
if (!tmuxSessionExists(config.tmux.webSession)) {
  console.log("🌐 启动 Web 服务器...");
  
  // 检测可用的 HTTP 服务器
  let serverCmd = "";
  if (execSilent("which bun")) {
    serverCmd = `bunx serve -p ${config.localPort}`;
  } else if (execSilent("which npx")) {
    serverCmd = `npx serve -p ${config.localPort}`;
  } else {
    serverCmd = `python3 -m http.server ${config.localPort}`;
  }
  
  exec(`tmux new-session -d -s ${config.tmux.webSession} -c "${config.webDir}" "${serverCmd}"`);
  
  // 等待服务器启动
  let retries = 10;
  while (retries-- > 0 && !isPortInUse(config.localPort)) {
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (isPortInUse(config.localPort)) {
    printStatus("running", `Web 服务器运行在端口 ${config.localPort}`);
  } else {
    printStatus("error", "Web 服务器启动失败");
    process.exit(1);
  }
}

// 启动 Tunnel
if (!tmuxSessionExists(config.tmux.tunnelSession)) {
  console.log("\n🔒 启动 Cloudflare Tunnel...");
  exec(`tmux new-session -d -s ${config.tmux.tunnelSession} "cloudflared tunnel run ${config.tunnelName}"`);
  
  // 等待 tunnel 启动
  await new Promise(r => setTimeout(r, 3000));
  
  if (tmuxSessionExists(config.tmux.tunnelSession)) {
    printStatus("running", "Cloudflare Tunnel 运行中");
  } else {
    printStatus("error", "Tunnel 启动失败");
    process.exit(1);
  }
}

console.log("\n✅ 全部启动成功！\n");
console.log("访问地址:");
console.log(`  🌐 https://${config.hostname}`);
console.log(`  🏠 http://localhost:${config.localPort}\n`);
console.log("管理命令:");
console.log(`  查看状态: bun ~/.pi/agent/skills/cf-tunnel/scripts/status.ts`);
console.log(`  停止服务: bun ~/.pi/agent/skills/cf-tunnel/scripts/stop.ts`);
console.log(`  查看日志: tmux attach -t ${config.tmux.webSession}`);
console.log(`           tmux attach -t ${config.tmux.tunnelSession}\n`);
