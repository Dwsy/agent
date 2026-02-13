import { readFileSync } from "node:fs";
import { Bot, InputFile } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars");
  process.exit(1);
}

const bot = new Bot(token);

async function main() {
  try {
    // 创建测试音频文件
    const testPath = "/tmp/test-audio.mp3";
    const { execSync } = require("child_process");
    
    try {
      execSync(`say -o /tmp/test-audio.aiff "hello test" && ffmpeg -y -i /tmp/test-audio.aiff ${testPath} 2>/dev/null`);
    } catch {
      // fallback: 直接复制
      execSync(`cp /tmp/test-audio.aiff ${testPath}.bak 2>/dev/null || echo "test" > ${testPath}`);
    }
    
    const data = readFileSync(testPath);
    console.log(`File size: ${data.length} bytes`);
    
    const file = new InputFile(data, "test-audio.mp3");
    console.log("Sending audio...");
    
    const result = await bot.api.sendAudio(chatId, file, { caption: "test audio" });
    console.log("Success:", result.message_id);
  } catch (err: any) {
    console.error("Failed:", err?.message);
    console.error("Error code:", err?.error_code);
    console.error("Description:", err?.description);
    console.error("Full error:", JSON.stringify(err, null, 2));
  }
}

main();
