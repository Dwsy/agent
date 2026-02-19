/**
 * Sticker Tools — Unified Implementation
 * 
 * All sticker-related tools in one file:
 * - sticker_list_pack
 * - sticker_send  
 * - sticker_download_pack
 * - sticker_search_packs
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { ToolDefinition } from "../plugins/types.ts";

// =============================================================================
// Types
// =============================================================================

export interface StickerInfo {
  file_id: string;
  file_unique_id: string;
  index: number;
  is_animated: boolean;
  is_video: boolean;
  emoji?: string;
}

export interface StickerPackInfo {
  name: string;
  title: string;
  sticker_type: "regular" | "mask" | "custom_emoji";
  contains_animated: boolean;
  contains_video: boolean;
  stickers: StickerInfo[];
  total: number;
}

export interface StickerSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export interface StickerDownloadResult {
  success: boolean;
  downloaded: number;
  failed: number;
  outputPath?: string;
  files?: string[];
  error?: string;
}

// =============================================================================
// Telegram API Client
// =============================================================================

class TelegramApi {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async call(method: string, params?: Record<string, any>): Promise<any> {
    const url = `${this.baseUrl}/${method}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.description);
    return data.result;
  }

  getStickerSet = (name: string) => this.call("getStickerSet", { name });
  sendSticker = (chatId: string | number, fileId: string) => 
    this.call("sendSticker", { chat_id: chatId, sticker: fileId });
  getFile = (fileId: string) => this.call("getFile", { file_id: fileId });
  
  async downloadFile(filePath: string): Promise<Uint8Array> {
    const url = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const stickerListPackTool: ToolDefinition = {
  name: "sticker_list_pack",
  description: `List all stickers in a Telegram sticker pack.

Returns: pack name, title, total count, sticker types, file_ids for sending.`,
  parameters: {
    type: "object",
    properties: {
      packName: { type: "string", description: "Sticker pack name (from t.me/addstickers/<NAME>)" },
    },
    required: ["packName"],
  },
};

export const stickerSendTool: ToolDefinition = {
  name: "sticker_send",
  description: `Send sticker(s) to a chat. Options: by index, random, or batch.`,
  parameters: {
    type: "object",
    properties: {
      chatId: { type: "string", description: "Target chat ID" },
      packName: { type: "string", description: "Sticker pack name" },
      index: { type: "number", description: "Sticker index (1-based)" },
      fileId: { type: "string", description: "Direct file_id (optional)" },
      random: { type: "boolean", description: "Send random sticker from pack" },
      batch: { type: "array", description: "Batch: [{packName?, index?, fileId?}]" },
      delayMs: { type: "number", description: "Delay between batch sends (ms)", default: 500 },
    },
    required: ["chatId"],
  },
};

export const stickerDownloadPackTool: ToolDefinition = {
  name: "sticker_download_pack",
  description: `Download all stickers from a pack. Creates index.json with metadata.`,
  parameters: {
    type: "object",
    properties: {
      packName: { type: "string", description: "Sticker pack name" },
      outputDir: { type: "string", description: "Output directory" },
      limit: { type: "number", description: "Limit count (for testing)" },
      createIndex: { type: "boolean", description: "Create index.json", default: true },
    },
    required: ["packName"],
  },
};

export const stickerSearchPacksTool: ToolDefinition = {
  name: "sticker_search_packs",
  description: `Search popular sticker packs by keyword.`,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query (e.g., 'miku', 'anime')" },
      limit: { type: "number", description: "Max results", default: 10 },
    },
    required: ["query"],
  },
};

// =============================================================================
// Tool Implementations
// =============================================================================

export class StickerTools {
  private api: TelegramApi;
  private defaultDelay = 500;

  constructor(botToken: string) {
    this.api = new TelegramApi(botToken);
  }

  // ---------------------------------------------------------------------------
  // sticker_list_pack
  // ---------------------------------------------------------------------------
  async listPack(packName: string): Promise<StickerPackInfo> {
    const set = await this.api.getStickerSet(packName);
    return {
      name: set.name,
      title: set.title,
      sticker_type: set.sticker_type || "regular",
      contains_animated: set.contains_animated || false,
      contains_video: set.contains_video || false,
      stickers: set.stickers.map((s: any, i: number) => ({
        file_id: s.file_id,
        file_unique_id: s.file_unique_id,
        index: i + 1,
        is_animated: s.is_animated || false,
        is_video: s.is_video || false,
        emoji: s.emoji,
      })),
      total: set.stickers.length,
    };
  }

  // ---------------------------------------------------------------------------
  // sticker_send
  // ---------------------------------------------------------------------------
  async send(params: {
    chatId: string;
    packName?: string;
    index?: number;
    fileId?: string;
    random?: boolean;
    batch?: any[];
    delayMs?: number;
  }): Promise<StickerSendResult | StickerSendResult[]> {
    if (params.batch?.length) {
      return this.sendBatch(params.chatId, params.batch, params.delayMs);
    }
    return this.sendSingle(params);
  }

  private async sendSingle(params: any): Promise<StickerSendResult> {
    try {
      let fileId: string;
      
      if (params.fileId) {
        fileId = params.fileId;
      } else if (params.packName) {
        const set = await this.api.getStickerSet(params.packName);
        if (params.random) {
          const idx = Math.floor(Math.random() * set.stickers.length);
          fileId = set.stickers[idx].file_id;
        } else if (params.index) {
          if (params.index < 1 || params.index > set.stickers.length) {
            return { success: false, error: `Index out of range (1-${set.stickers.length})` };
          }
          fileId = set.stickers[params.index - 1].file_id;
        } else {
          return { success: false, error: "Missing index or random flag" };
        }
      } else {
        return { success: false, error: "Missing packName or fileId" };
      }

      const result = await this.api.sendSticker(params.chatId, fileId);
      return { success: true, messageId: result.message_id };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  private async sendBatch(chatId: string, batch: any[], delayMs?: number): Promise<StickerSendResult[]> {
    const results: StickerSendResult[] = [];
    for (const item of batch) {
      results.push(await this.sendSingle({ chatId, ...item }));
      if (results.length < batch.length) {
        await this.delay(delayMs || this.defaultDelay);
      }
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // sticker_download_pack
  // ---------------------------------------------------------------------------
  async download(params: {
    packName: string;
    outputDir?: string;
    limit?: number;
    createIndex?: boolean;
  }): Promise<StickerDownloadResult> {
    try {
      const set = await this.api.getStickerSet(params.packName);
      const outputDir = params.outputDir || `./downloads/${params.packName}`;
      await mkdir(outputDir, { recursive: true });

      const files: string[] = [];
      let downloaded = 0, failed = 0;
      const toDownload = params.limit ? set.stickers.slice(0, params.limit) : set.stickers;

      for (let i = 0; i < toDownload.length; i++) {
        const sticker = toDownload[i];
        const ext = sticker.is_video ? "webm" : sticker.is_animated ? "tgs" : "webp";
        const filename = `${params.packName}_${String(i + 1).padStart(3, "0")}.${ext}`;
        
        try {
          const fileInfo = await this.api.getFile(sticker.file_id);
          const data = await this.api.downloadFile(fileInfo.file_path);
          await writeFile(join(outputDir, filename), data);
          files.push(filename);
          downloaded++;
        } catch {
          failed++;
        }
        
        if (i < toDownload.length - 1) await this.delay(this.defaultDelay);
      }

      if (params.createIndex !== false) {
        const index = {
          name: set.name, title: set.title,
          total: set.stickers.length, downloaded, failed,
          stickers: toDownload.map((s: any, i: number) => ({
            index: i + 1, file_id: s.file_id,
            is_animated: s.is_animated, is_video: s.is_video, emoji: s.emoji,
          })),
        };
        await writeFile(join(outputDir, "index.json"), JSON.stringify(index, null, 2));
      }

      return { success: failed === 0, downloaded, failed, outputPath: outputDir, files };
    } catch (err) {
      return { success: false, downloaded: 0, failed: 0, error: (err as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // sticker_search_packs
  // ---------------------------------------------------------------------------
  async search(query: string, limit: number = 10): Promise<Array<{ name: string; title: string; stickerCount: number }>> {
    const popular = [
      { name: "LINE_HATSUNE_MIKU_Pom_Ver", title: "HATSUNE MIKU Pom Ver.", keywords: ["miku", "hatsune", "vocaloid"], count: 40 },
      { name: "Anya_Forger_S2_Part_2_by_Fix_x_Fox", title: "Anya Forger p2", keywords: ["anya", "spy", "family"], count: 49 },
      { name: "KawaiiChino", title: "Kafuu Chino", keywords: ["chino", "gochiusa", "rabbit"], count: 106 },
      { name: "Rieeeee_by_fStikBot", title: "李依依Bpl", keywords: ["meme", "chinese"], count: 49 },
      { name: "Pusheen", title: "Pusheen", keywords: ["cat", "cute"], count: 40 },
      { name: "PepeTheFrog", title: "Pepe The Frog", keywords: ["pepe", "frog", "meme"], count: 50 },
      { name: "Doge", title: "Doge", keywords: ["doge", "dog", "meme"], count: 30 },
    ];

    const q = query.toLowerCase();
    return popular
      .filter(p => p.keywords.some(k => k.includes(q)) || p.title.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, limit)
      .map(p => ({ name: p.name, title: p.title, stickerCount: p.count }));
  }

  private delay(ms: number) {
    return new Promise(r => setTimeout(r, ms));
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createStickerTools(botToken: string): StickerTools {
  return new StickerTools(botToken);
}
