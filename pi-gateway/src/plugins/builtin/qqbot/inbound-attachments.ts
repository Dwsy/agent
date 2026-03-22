/**
 * 入站附件处理模块
 *
 * 负责处理用户发送的附件（图片/语音/文件），
 * 下载到本地并归类为统一的 ProcessedAttachments 结构。
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { QqbotInboundAttachment } from "./types.ts";

export interface ProcessedAttachments {
  attachmentInfo: string;
  imageUrls: string[];
  imageMediaTypes: string[];
  voicePaths: string[];
  voiceUrls: string[];
  voiceTranscripts: string[];
  attachmentLocalPaths: Array<string | null>;
}

interface AttachContext {
  accountId: string;
  log?: { info: (msg: string) => void; error: (msg: string) => void };
}

const EMPTY_RESULT: ProcessedAttachments = {
  attachmentInfo: "",
  imageUrls: [],
  imageMediaTypes: [],
  voicePaths: [],
  voiceUrls: [],
  voiceTranscripts: [],
  attachmentLocalPaths: [],
};

function getMediaDownloadDir(): string {
  const dir = join(homedir(), ".pi", "agent", "qqbot-credentials", "media", "downloads");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

interface RawAttachment {
  content_type?: string;
  url?: string;
  filename?: string;
  asr_refer_text?: string;
}

/**
 * 处理入站消息的附件列表。
 * - 图片：收集 URL
 * - 语音：收集 URL 和 ASR 文本
 * - 其他：生成描述
 */
export async function processAttachments(
  attachments: QqbotInboundAttachment[] | undefined,
  ctx: AttachContext,
): Promise<ProcessedAttachments> {
  if (!attachments?.length) return EMPTY_RESULT;

  const { accountId, log } = ctx;
  const prefix = `[qqbot:${accountId}]`;

  const imageUrls: string[] = [];
  const imageMediaTypes: string[] = [];
  const voicePaths: string[] = [];
  const voiceUrls: string[] = [];
  const voiceTranscripts: string[] = [];
  const attachmentLocalPaths: Array<string | null> = [];
  const otherAttachments: string[] = [];

  for (const att of attachments) {
    const raw = att as unknown as RawAttachment;
    const contentType = raw.content_type ?? att.contentType ?? "";
    const url = raw.url ?? att.url ?? "";

    if (!url) {
      attachmentLocalPaths.push(null);
      continue;
    }

    // 图片类附件
    if (contentType.startsWith("image/")) {
      imageUrls.push(url);
      imageMediaTypes.push(contentType);
      attachmentLocalPaths.push(null);
      continue;
    }

    // 语音类附件（silk/opus）
    if (isVoiceContentType(contentType)) {
      voiceUrls.push(url);
      voiceTranscripts.push(raw.asr_refer_text ?? "");
      attachmentLocalPaths.push(null);
      continue;
    }

    // 文件类附件
    const filename = raw.filename ?? att.filename ?? `file_${Date.now()}`;
    otherAttachments.push(`[文件] ${filename}`);
    attachmentLocalPaths.push(null);
  }

  // 生成附件描述文本
  const parts: string[] = [];
  if (imageUrls.length > 0) {
    parts.push(`📷 图片 ${imageUrls.length} 张`);
  }
  if (voiceUrls.length > 0) {
    parts.push(`🎤 语音 ${voiceUrls.length} 条`);
  }
  if (otherAttachments.length > 0) {
    parts.push(...otherAttachments);
  }

  const attachmentInfo = parts.join(" | ");

  if (attachmentInfo) {
    log?.info(`${prefix} attachments: ${attachmentInfo}`);
  }

  return {
    attachmentInfo,
    imageUrls,
    imageMediaTypes,
    voicePaths,
    voiceUrls,
    voiceTranscripts,
    attachmentLocalPaths,
  };
}

/**
 * 判断是否为语音内容类型
 */
function isVoiceContentType(contentType: string): boolean {
  return (
    contentType.includes("audio") ||
    contentType.includes("silk") ||
    contentType.includes("ogg") ||
    contentType.includes("opus")
  );
}

/**
 * 格式化语音文本，用于注入到消息内容中
 */
export function formatVoiceText(transcripts: string[]): string {
  const valid = transcripts.filter(Boolean);
  if (valid.length === 0) return "";
  return valid.map((t) => `🎤 ${t}`).join("\n");
}
