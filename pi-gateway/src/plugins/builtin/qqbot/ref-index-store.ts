/**
 * REFIDX 引用消息索引存储
 *
 * QQ Bot 使用 REFIDX_xxx 索引体系做引用/回复消息：
 * - 出站：发送消息后 API 返回 ref_idx，缓存 {content, senderId, timestamp}
 * - 入站：消息 ext 数组含 msg_idx 和 ref_msg_idx
 *   - msg_idx = 当前消息索引 → 存储消息内容
 *   - ref_msg_idx = 被引用消息索引 → 查找历史消息内容，注入上下文
 *
 * 存储：内存 Map + JSONL 追加写持久化
 * 位置：~/.pi/gateway/qqbot-credentials/ref-index.jsonl
 */
import { existsSync, appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

const STORAGE_DIR = `${homedir()}/.pi/gateway/qqbot-credentials`;
const REF_INDEX_FILE = `${STORAGE_DIR}/ref-index.jsonl`;
const MAX_ENTRIES = 10000;

export interface RefIndexEntry {
  content: string;
  senderId: string;
  senderName?: string;
  timestamp: number;
  isBot?: boolean;
  attachments?: RefAttachmentSummary[];
}

/** 附件摘要（用于引用索引缓存） */
export interface RefAttachmentSummary {
  type: "image" | "voice" | "video" | "file" | "unknown";
  filename?: string;
  contentType?: string;
  transcript?: string;
  transcriptSource?: "stt" | "asr" | "tts" | "fallback";
  localPath?: string;
  url?: string;
}

interface JsonlRecord {
  k: string;
  v: RefIndexEntry;
  t: number;
}

// 内存缓存
const cache = new Map<string, RefIndexEntry>();

function loadCache(): void {
  if (cache.size > 0) return;
  try {
    if (!existsSync(REF_INDEX_FILE)) return;
    const lines = readFileSync(REF_INDEX_FILE, "utf-8").split("\n").filter(Boolean);
    for (const line of lines.slice(-MAX_ENTRIES)) {
      try {
        const rec: JsonlRecord = JSON.parse(line);
        cache.set(rec.k, rec.v);
      } catch {}
    }
  } catch {}
}

/**
 * 解析 ext 数组，返回 refMsgIdx 和 msgIdx
 * ext 示例: ["", "ref_msg_idx=REFIDX_xxx", "msg_idx=REFIDX_yyy"]
 */
export function parseRefIndices(ext?: string[]): { refMsgIdx?: string; msgIdx?: string } {
  if (!ext || ext.length === 0) return {};
  let refMsgIdx: string | undefined;
  let msgIdx: string | undefined;
  for (const item of ext) {
    if (item.startsWith("ref_msg_idx=")) refMsgIdx = item.slice("ref_msg_idx=".length);
    else if (item.startsWith("msg_idx=")) msgIdx = item.slice("msg_idx=".length);
  }
  return { refMsgIdx, msgIdx };
}

/**
 * 设置索引 → 消息内容的映射（出站/入站共用）
 */
export function setRefIndex(refIdx: string, entry: RefIndexEntry): void {
  loadCache();
  cache.set(refIdx, entry);
  // 追加写 JSONL
  try {
    const dir = STORAGE_DIR;
    if (!existsSync(dir)) {
      import("node:fs").then(({ mkdirSync }) => mkdirSync(dir, { recursive: true }));
    }
    const record: JsonlRecord = { k: refIdx, v: entry, t: Date.now() };
    appendFileSync(REF_INDEX_FILE, JSON.stringify(record) + "\n", "utf-8");
  } catch {
    // 静默失败
  }
}

/**
 * 获取索引对应的消息内容
 */
export function getRefIndex(refIdx: string): RefIndexEntry | undefined {
  loadCache();
  return cache.get(refIdx);
}

/**
 * 格式化引用消息为文本，注入到用户消息前
 */
export function formatRefEntryForAgent(entry: RefIndexEntry): string {
  const sender = entry.senderName || entry.senderId;
  return `「${sender}」: ${entry.content}`;
}

/**
 * 清理过期缓存（超过 7 天的条目）
 */
export function flushRefIndex(): void {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [k, v] of cache.entries()) {
    if (v.timestamp < cutoff) cache.delete(k);
  }
}
