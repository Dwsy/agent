/**
 * Sticker CLI Commands
 * 
 * pi-gw sticker list <pack>
 * pi-gw sticker send <chat> <pack> [index|random]
 * pi-gw sticker download <pack> [dir]
 * pi-gw sticker search <query>
 */

import { createStickerTools } from "../tools/index.ts";

export async function runSticker(args: string[], getConfig: () => any): Promise<void> {
  const sub = args[1];
  const botToken = getConfig()?.channels?.telegram?.botToken;

  if (!botToken) {
    console.error("❌ Telegram bot token not configured");
    process.exit(1);
  }

  const sticker = createStickerTools(botToken);

  switch (sub) {
    case "list": {
      const packName = args[2];
      if (!packName) {
        console.error("Usage: pi-gw sticker list <pack_name>");
        process.exit(1);
      }

      const info = await sticker.listPack(packName);
      console.log(`\n📦 ${info.title}`);
      console.log(`   Name: ${info.name} | Total: ${info.total}`);
      console.log(`   Animated: ${info.contains_animated} | Video: ${info.contains_video}\n`);

      info.stickers.slice(0, 20).forEach(s => {
        const type = s.is_video ? "[video]" : s.is_animated ? "[anim]" : "[static]";
        console.log(`  ${String(s.index).padStart(3)} ${type} ${s.emoji || ""}`);
      });
      if (info.stickers.length > 20) console.log(`  ... ${info.stickers.length - 20} more`);
      console.log();
      break;
    }

    case "send": {
      const chatId = args[2];
      const packName = args[3];
      const idx = args[4] || "1";

      if (!chatId || !packName) {
        console.error("Usage: pi-gw sticker send <chat_id> <pack_name> [index|random]");
        process.exit(1);
      }

      const isRandom = idx === "random";
      const result = await sticker.send({
        chatId,
        packName,
        index: isRandom ? undefined : parseInt(idx),
        random: isRandom,
      });

      if (Array.isArray(result)) {
        console.log(`✅ Sent ${result.filter(r => r.success).length}/${result.length}`);
      } else if (result.success) {
        console.log(`✅ Sticker sent!`);
      } else {
        console.error(`❌ ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case "download": {
      const packName = args[2];
      const outputDir = args[3];

      if (!packName) {
        console.error("Usage: pi-gw sticker download <pack_name> [output_dir]");
        process.exit(1);
      }

      console.log(`⬇️  Downloading ${packName}...`);
      const result = await sticker.download({ packName, outputDir });

      if (result.success) {
        console.log(`✅ Downloaded ${result.downloaded} to ${result.outputPath}`);
        if (result.failed) console.log(`⚠️  Failed: ${result.failed}`);
      } else {
        console.error(`❌ ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case "search": {
      const query = args[2];
      if (!query) {
        console.error("Usage: pi-gw sticker search <query>");
        process.exit(1);
      }

      const results = await sticker.search(query, 10);
      console.log(`\n🔍 ${results.length} packs found:\n`);
      results.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.title} (${p.stickerCount})`);
        console.log(`     ${p.name}`);
      });
      console.log();
      break;
    }

    default:
      console.log("Usage:");
      console.log("  pi-gw sticker list <pack>");
      console.log("  pi-gw sticker send <chat> <pack> [idx|random]");
      console.log("  pi-gw sticker download <pack> [dir]");
      console.log("  pi-gw sticker search <query>");
  }
}
