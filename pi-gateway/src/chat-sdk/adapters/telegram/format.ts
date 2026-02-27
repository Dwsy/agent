/**
 * Telegram format converter — converts between markdown AST and Telegram HTML.
 *
 * Telegram supports a limited HTML subset:
 * <b>, <i>, <s>, <code>, <pre>, <a href="...">, <blockquote>
 */

import {
  BaseFormatConverter,
  type AdapterPostableMessage,
  type Root,
  getNodeChildren,
  getNodeValue,
  isBlockquoteNode,
  isCodeNode,
  isDeleteNode,
  isEmphasisNode,
  isInlineCodeNode,
  isLinkNode,
  isListItemNode,
  isListNode,
  isParagraphNode,
  isStrongNode,
  isTextNode,
  parseMarkdown,
} from "chat";
import type { Content } from "mdast";

/** Escape HTML special characters for Telegram. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convert markdown-ish text to Telegram-safe HTML subset. */
export function markdownToTelegramHtml(md: string): string {
  let html = md;

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

  // Preserve existing HTML tags
  html = html.replace(/<(blockquote|\/blockquote|pre|\/pre|code|\/code)>/g, (_m) => ph(_m));

  // Markdown formatting
  html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  html = html.replace(/__(.+?)__/g, "<b>$1</b>");
  html = html.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "<i>$1</i>");
  html = html.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<i>$1</i>");
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Restore placeholders
  html = html.replace(/\x00PH(\d+)\x00/g, (_m, idx) => placeholders[parseInt(idx)]!);

  return html;
}

/**
 * TelegramFormatConverter — AST-based format conversion for Telegram HTML.
 */
export class TelegramFormatConverter extends BaseFormatConverter {
  /**
   * Render an AST to Telegram HTML format.
   */
  fromAst(ast: Root): string {
    return this.fromAstWithNodeConverter(
      ast,
      (node) => this.nodeToTelegramHtml(node),
    );
  }

  /**
   * Parse Telegram HTML into an AST.
   * Converts Telegram HTML tags back to markdown, then parses.
   */
  toAst(telegramHtml: string): Root {
    let md = telegramHtml;
    md = md.replace(/<b>([\s\S]*?)<\/b>/g, "**$1**");
    md = md.replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**");
    md = md.replace(/<i>([\s\S]*?)<\/i>/g, "*$1*");
    md = md.replace(/<em>([\s\S]*?)<\/em>/g, "*$1*");
    md = md.replace(/<s>([\s\S]*?)<\/s>/g, "~~$1~~");
    md = md.replace(/<del>([\s\S]*?)<\/del>/g, "~~$1~~");
    md = md.replace(/<code>([\s\S]*?)<\/code>/g, "`$1`");
    md = md.replace(/<pre>([\s\S]*?)<\/pre>/g, "```\n$1\n```");
    md = md.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, "[$2]($1)");
    md = md.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    return parseMarkdown(md);
  }

  /**
   * Override renderPostable to handle Telegram-specific formatting.
   */
  renderPostable(message: AdapterPostableMessage): string {
    if (typeof message === "string") {
      return message;
    }
    if ("raw" in message) {
      return (message as { raw: string }).raw;
    }
    if ("markdown" in message) {
      return this.fromAst(parseMarkdown((message as { markdown: string }).markdown));
    }
    if ("ast" in message) {
      return this.fromAst((message as { ast: Root }).ast);
    }
    return "";
  }

  private nodeToTelegramHtml(node: Content): string {
    if (isParagraphNode(node)) {
      return getNodeChildren(node)
        .map((child) => this.nodeToTelegramHtml(child))
        .join("");
    }

    if (isTextNode(node)) {
      return escapeHtml(node.value);
    }

    if (isStrongNode(node)) {
      const content = getNodeChildren(node)
        .map((child) => this.nodeToTelegramHtml(child))
        .join("");
      return `<b>${content}</b>`;
    }

    if (isEmphasisNode(node)) {
      const content = getNodeChildren(node)
        .map((child) => this.nodeToTelegramHtml(child))
        .join("");
      return `<i>${content}</i>`;
    }

    if (isDeleteNode(node)) {
      const content = getNodeChildren(node)
        .map((child) => this.nodeToTelegramHtml(child))
        .join("");
      return `<s>${content}</s>`;
    }

    if (isInlineCodeNode(node)) {
      return `<code>${escapeHtml(node.value)}</code>`;
    }

    if (isCodeNode(node)) {
      const lang = node.lang ? ` class="language-${escapeHtml(node.lang)}"` : "";
      return `<pre><code${lang}>${escapeHtml(node.value)}</code></pre>`;
    }

    if (isLinkNode(node)) {
      const linkText = getNodeChildren(node)
        .map((child) => this.nodeToTelegramHtml(child))
        .join("");
      return `<a href="${escapeHtml(node.url)}">${linkText}</a>`;
    }

    if (isBlockquoteNode(node)) {
      const content = getNodeChildren(node)
        .map((child) => this.nodeToTelegramHtml(child))
        .join("\n");
      return `<blockquote>${content}</blockquote>`;
    }

    if (isListNode(node)) {
      return getNodeChildren(node)
        .map((item, i) => {
          const prefix = node.ordered ? `${i + 1}.` : "•";
          const content = getNodeChildren(item)
            .map((child) => this.nodeToTelegramHtml(child))
            .join("");
          return `${prefix} ${content}`;
        })
        .join("\n");
    }

    if (isListItemNode(node)) {
      return getNodeChildren(node)
        .map((child) => this.nodeToTelegramHtml(child))
        .join("");
    }

    if (node.type === "break") {
      return "\n";
    }

    if (node.type === "thematicBreak") {
      return "———";
    }

    const children = getNodeChildren(node);
    if (children.length > 0) {
      return children.map((child) => this.nodeToTelegramHtml(child)).join("");
    }

    return escapeHtml(getNodeValue(node));
  }
}
