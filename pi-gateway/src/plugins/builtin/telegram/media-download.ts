import type { TelegramFileDownload } from "./types.ts";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  pdf: "application/pdf",
};

function inferMime(filePath?: string, headerMime?: string | null): string {
  if (headerMime && headerMime.trim()) {
    return headerMime.split(";")[0]?.trim() || "application/octet-stream";
  }
  const ext = filePath?.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export async function downloadTelegramFile(params: {
  token: string;
  fileId: string;
  maxBytes: number;
  fetchImpl?: typeof fetch;
}): Promise<TelegramFileDownload | null> {
  const fetcher = params.fetchImpl ?? globalThis.fetch;
  if (!fetcher) return null;

  try {
    const infoRes = await fetcher(
      `https://api.telegram.org/bot${params.token}/getFile?file_id=${encodeURIComponent(params.fileId)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!infoRes.ok) return null;
    const info = (await infoRes.json()) as { ok: boolean; result?: { file_path?: string } };
    if (!info.ok || !info.result?.file_path) return null;

    const url = `https://api.telegram.org/file/bot${params.token}/${info.result.file_path}`;
    const fileRes = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
    if (!fileRes.ok) return null;

    const arrayBuffer = await fileRes.arrayBuffer();
    if (arrayBuffer.byteLength > params.maxBytes) {
      throw new Error(`media exceeds ${Math.round(params.maxBytes / (1024 * 1024))}MB limit`);
    }

    const mimeType = inferMime(info.result.file_path, fileRes.headers.get("content-type"));
    const data = Buffer.from(arrayBuffer).toString("base64");

    return { data, mimeType, filePath: info.result.file_path };
  } catch {
    return null;
  }
}
