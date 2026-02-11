import { splitMessage } from "../../../core/utils.ts";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convert Markdown-ish text to Telegram-safe HTML subset. */
export function markdownToTelegramHtml(md: string): string {
  let html = md;

  // Phase 1: Extract code blocks and inline code to protect from further processing
  const placeholders: string[] = [];
  const ph = (content: string) => {
    const idx = placeholders.length;
    placeholders.push(content);
    return `\x00PH${idx}\x00`;
  };

  // Fenced code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, (_m, code) => {
    return ph(`<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`);
  });

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, (_m, code) => ph(`<code>${escapeHtml(code)}</code>`));

  // Preserve existing HTML tags (blockquote etc.) from handlers.ts
  html = html.replace(/<(blockquote|\/blockquote|pre|\/pre|code|\/code)>/g, (_m) => ph(_m));

  // Phase 2: Markdown formatting (safe — code already extracted)
  html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  html = html.replace(/__(.+?)__/g, "<b>$1</b>");
  html = html.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "<i>$1</i>");
  html = html.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<i>$1</i>");
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Phase 3: Restore placeholders
  html = html.replace(/\x00PH(\d+)\x00/g, (_m, idx) => placeholders[parseInt(idx)]!);

  return html;
}

export function clipCaption(text: string, max = 1024): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 3)}...`;
}

export function splitCaption(text?: string): { caption?: string; followUpText?: string } {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return { caption: undefined, followUpText: undefined };
  if (trimmed.length > 1024) {
    return { caption: undefined, followUpText: trimmed };
  }
  return { caption: trimmed, followUpText: undefined };
}

export function splitTelegramText(text: string, max = 4096): string[] {
  return splitMessage(text, max);
}
