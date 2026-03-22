/**
 * QQ Bot 文本解析工具
 */
import type { RefAttachmentSummary } from "../ref-index-store.ts";

/**
 * 解析 QQ 表情标签，替换为可读文本
 * 格式：<faceType=1,faceId="13",ext="base64...">
 */
export function parseFaceTags(text: string): string {
  if (!text) return text;
  return text.replace(/<faceType=\d+,faceId="[^"]*",ext="([^"]*)">/g, (_m, ext: string) => {
    try {
      const decoded = Buffer.from(ext, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      return `【表情: ${parsed.text || "未知"}】`;
    } catch {
      return _m;
    }
  });
}

/**
 * 过滤内部标记（如 [[reply_to: xxx]]）
 * AI 可能错误输出框架内部标记，需要在发送前移除
 */
export function filterInternalMarkers(text: string): string {
  if (!text) return text;
  let result = text;
  // 移除 [[marker: value]] 格式
  result = result.replace(/\[\[[a-z_]+:\s*[^\]]*\]\]/gi, "");
  // 移除框架内部图片/语音引用：@image:xxx.png、@voice:xxx.silk
  result = result.replace(/@(?:image|voice|video|file):[a-zA-Z0-9_.-]+/g, "");
  // 压缩多余空格（移除标记后可能产生连续空格）
  result = result.replace(/ {2,}/g, " ");
  // 压缩多余空行
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

/**
 * 从附件列表构建引用摘要
 */
export function buildAttachmentSummaries(
  attachments?: Array<{ content_type?: string; url?: string; filename?: string; voice_wav_url?: string }>,
  localPaths?: Array<string | null>,
): RefAttachmentSummary[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((att, idx) => {
    const ct = att.content_type?.toLowerCase() ?? "";
    let type: RefAttachmentSummary["type"] = "unknown";
    if (ct.startsWith("image/")) type = "image";
    else if (ct === "voice" || ct.startsWith("audio/") || ct.includes("silk") || ct.includes("amr")) type = "voice";
    else if (ct.startsWith("video/")) type = "video";
    else if (ct.startsWith("application/") || ct.startsWith("text/")) type = "file";
    return {
      type,
      filename: att.filename,
      contentType: att.content_type,
      localPath: localPaths?.[idx] ?? undefined,
      url: att.url,
    };
  });
}
