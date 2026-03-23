#!/usr/bin/env bun
/**
 * 微信登录 CLI - 用 qrcode 字段生成终端二维码
 */

import qrcode from "qrcode-terminal";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:52134";
const TIMEOUT_MS = 120_000;

interface LoginResponse {
  ok: boolean;
  qrcode?: string;        // 二维码内容字符串
  qrcodeUrl?: string;     // 小程序链接（不用于终端显示）
  sessionKey?: string;
  message?: string;
  error?: string;
}

interface StatusResponse {
  ok: boolean;
  connected: boolean;
  accountId?: string;
  message?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startLogin(): Promise<LoginResponse> {
  const response = await fetch(`${GATEWAY_URL}/api/wechat/login`);
  return response.json();
}

async function checkStatus(sessionKey: string): Promise<StatusResponse> {
  const response = await fetch(
    `${GATEWAY_URL}/api/wechat/login/status?sessionKey=${sessionKey}`
  );
  return response.json();
}

async function main(): Promise<void> {
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📱 微信扫码登录 (ilink 企业微信)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // 1. 获取二维码
  const loginResult = await startLogin();

  if (!loginResult.ok) {
    console.error("❌ 获取二维码失败:", loginResult.error || loginResult.message);
    process.exit(1);
  }

  // 直接调用 ilink API 获取 qrcode 字段
  const qrcodeResp = await fetch("https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3");
  const qrcodeData = await qrcodeResp.json() as { qrcode?: string; ret?: number };
  
  if (!qrcodeData.qrcode) {
    console.error("❌ 获取 qrcode 字段失败");
    process.exit(1);
  }

  const { sessionKey } = loginResult;

  // 2. 用 qrcode 字段生成终端二维码
  console.log("📱 请用微信扫描下方二维码:");
  console.log("");
  
  qrcode.generate(qrcodeData.qrcode, { small: true });

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`⏳ 等待扫码 (${TIMEOUT_MS / 1000} 秒超时)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // 3. 轮询登录状态
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > TIMEOUT_MS) {
      console.log("");
      console.log("⏰ 登录超时，请重新运行脚本");
      process.exit(1);
    }

    const status = await checkStatus(sessionKey!);

    if (status.connected) {
      console.log("");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ 登录成功！");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📋 账号ID:", status.accountId || "default");
      console.log("💾 账号信息已保存到 ~/.pi/state/wechat/accounts/");
      console.log("");
      console.log("🔄 请重启 Gateway:");
      console.log("   tmux send-keys -t gateway C-c");
      console.log("   tmux send-keys -t gateway 'cd ~/.pi/agent/pi-gateway && bun run src/cli.ts gateway' Enter");
      console.log("");
      process.exit(0);
    }

    const remaining = Math.ceil((TIMEOUT_MS - elapsed) / 1000);
    process.stdout.write(`\r   等待扫码... (剩余 ${remaining}s)   `);

    await sleep(2000);
  }
}

main().catch((err) => {
  console.error("❌ 错误:", err);
  process.exit(1);
});
