#!/usr/bin/env bun
// 初始化 Cloudflare Tunnel 配置

import {
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  saveConfig,
  exec,
  execSilent,
  ensureDir,
  prompt,
} from "./lib/utils.ts";

console.log("🚀 Cloudflare Tunnel 初始化\n");

// 检查 cloudflared
console.log("📋 检查 cloudflared...");
const version = execSilent("cloudflared --version");
if (!version) {
  console.error("❌ cloudflared 未安装");
  console.log("💡 安装命令:");
  console.log("   wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb");
  console.log("   sudo dpkg -i cloudflared-linux-amd64.deb");
  process.exit(1);
}
console.log(`✅ cloudflared ${version}\n`);

// 检查 tmux
console.log("📋 检查 tmux...");
const tmuxVersion = execSilent("tmux -V");
if (!tmuxVersion) {
  console.error("❌ tmux 未安装");
  console.log("💡 安装: sudo apt install tmux");
  process.exit(1);
}
console.log(`✅ ${tmuxVersion}\n`);

// 登录 Cloudflare
console.log("🔐 登录 Cloudflare...");
console.log("   将打开浏览器进行授权\n");
const loginResult = execSilent("cloudflared tunnel login");
if (!loginResult && !execSilent("ls ~/.cloudflared/*.json 2>/dev/null")) {
  console.error("❌ 登录失败");
  process.exit(1);
}
console.log("✅ 登录成功\n");

// 配置参数
const tunnelName = await prompt(`隧道名称 [${DEFAULT_CONFIG.tunnelName}]: `) || DEFAULT_CONFIG.tunnelName;
const hostname = await prompt("域名 (如 mysite.example.com): ");
if (!hostname) {
  console.error("❌ 域名不能为空");
  process.exit(1);
}

const portStr = await prompt("本地端口 (留空自动分配): ");
const localPort = parseInt(portStr, 10) || 0; // 0 表示自动分配

const webDir = await prompt(`网站目录 [${DEFAULT_CONFIG.webDir}]: `) || DEFAULT_CONFIG.webDir;

// 创建目录
ensureDir(webDir);
ensureDir(CONFIG_DIR);

// 创建隧道
console.log(`\n🔧 创建隧道 "${tunnelName}"...`);
const createOutput = exec(`cloudflared tunnel create ${tunnelName}`, true);

// 提取 tunnel ID
let tunnelId = "";
const match = createOutput.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
if (match) {
  tunnelId = match[1];
} else {
  // 尝试从 list 获取
  const listOutput = execSilent("cloudflared tunnel list");
  const lines = listOutput.split("\n");
  for (const line of lines) {
    if (line.includes(tunnelName)) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] && parts[0].includes("-")) {
        tunnelId = parts[0];
        break;
      }
    }
  }
}

if (!tunnelId) {
  console.error("❌ 无法获取隧道 ID");
  process.exit(1);
}
console.log(`✅ 隧道 ID: ${tunnelId}\n`);

// 创建配置文件（端口设为0表示自动分配）
const config = {
  ...DEFAULT_CONFIG,
  tunnelId,
  tunnelName,
  hostname,
  localPort: localPort || 0,
  webDir,
};

// 创建 cloudflared config.yml
const cloudflaredDir = `${process.env.HOME}/.cloudflared`;
ensureDir(cloudflaredDir);

const configYml = `tunnel: ${tunnelId}
credentials-file: ${cloudflaredDir}/${tunnelId}.json

ingress:
  - hostname: ${hostname}
    service: http://localhost:${localPort}
  - service: http_status:404
`;

import * as fs from "fs";
fs.writeFileSync(`${cloudflaredDir}/config-${tunnelName}.yml`, configYml);

// 添加 DNS 记录
console.log(`🌐 添加 DNS 记录: ${hostname}...`);
exec(`cloudflared tunnel route dns ${tunnelName} ${hostname}`);
console.log("✅ DNS 记录已添加\n");

// 保存配置
saveConfig(config);

console.log("✅ 初始化完成！\n");
console.log("配置信息:");
console.log(`  隧道: ${tunnelName} (${tunnelId})`);
console.log(`  域名: https://${hostname}`);
console.log(`  本地端口: ${localPort || "自动分配 (10000-65000)"}`);
console.log(`  网站目录: ${webDir}\n`);
console.log("启动命令:");
console.log(`  bun ~/.pi/agent/skills/cf-tunnel/scripts/start.ts\n`);
