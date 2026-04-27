import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getLanguageFromPath, getMarkdownTheme, highlightCode } from "@mariozechner/pi-coding-agent";
import { Box, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { homedir } from "node:os";

type ThemeLike = {
  fg: (color: any, text: string) => string;
  bg: (color: any, text: string) => string;
  bold: (text: string) => string;
};

type ToolRenderContext = {
  lastComponent?: unknown;
  args?: Record<string, unknown>;
  expanded?: boolean;
};

type ToolRenderOptions = {
  expanded?: boolean;
  isPartial?: boolean;
};

type ToolResultLike = {
  content?: Array<{ type: string; text?: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
};

type ToolRenderFactory = {
  call: (args: Record<string, unknown> | undefined, theme: ThemeLike, context?: ToolRenderContext) => string;
  result: (result: ToolResultLike, options: ToolRenderOptions, theme: ThemeLike, context?: ToolRenderContext) => string | undefined;
};

function shortenPath(path: unknown, fallback = "."): string {
  if (typeof path !== "string" || !path.trim()) return fallback;
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function replaceTabs(text: string): string {
  return text.replace(/\t/g, "   ");
}

function normalizeText(text: string): string {
  return replaceTabs(text.replace(/\r/g, ""));
}

function trimTrailingEmptyLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end--;
  return lines.slice(0, end);
}

function extractText(result: ToolResultLike | undefined): string {
  if (!result?.content?.length) return "";
  return result.content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text || "")
    .join("\n")
    .replace(/\r/g, "");
}

function getTextComponent(context?: ToolRenderContext): Text {
  return context?.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
}

function expandHint(theme: ThemeLike): string {
  return `${theme.fg("accent", "Ctrl+O")} ${theme.fg("muted", "to expand")}`;
}

function formatStructuredPreview(
  body: string,
  options: ToolRenderOptions,
  theme: ThemeLike,
  opts?: {
    path?: string;
    collapsedLines?: number;
    color?: string;
    warning?: string;
  },
): string {
  const normalized = normalizeText(body).trimEnd();
  const warning = opts?.warning ? `\n${theme.fg("warning", opts.warning)}` : "";

  if (!normalized) return warning;

  const lang = opts?.path ? getLanguageFromPath(opts.path) : undefined;
  const renderedLines = lang
    ? highlightCode(normalized, lang)
    : normalized.split("\n").map((line) => theme.fg(opts?.color || "toolOutput", line));
  const lines = trimTrailingEmptyLines(renderedLines);
  const collapsedLines = Math.max(1, opts?.collapsedLines ?? 10);
  const maxLines = options.expanded ? lines.length : collapsedLines;
  const visibleLines = lines.slice(0, maxLines);
  const remaining = lines.length - visibleLines.length;

  let text = `\n${visibleLines.join("\n")}`;
  if (remaining > 0) {
    text += `${theme.fg("muted", `\n... (${remaining} more lines, ${expandHint(theme)})`)}`;
  }
  if (warning) text += warning;
  return text;
}

function formatSimpleResult(
  output: string,
  options: ToolRenderOptions,
  theme: ThemeLike,
  opts?: { collapsedLines?: number; warning?: string; color?: string },
): string {
  return formatStructuredPreview(output, options, theme, {
    collapsedLines: opts?.collapsedLines,
    warning: opts?.warning,
    color: opts?.color,
  });
}

function createTextToolRenderers(factory: ToolRenderFactory) {
  return {
    renderCall(args: Record<string, unknown>, theme: ThemeLike, context?: ToolRenderContext) {
      const text = getTextComponent(context);
      text.setText(factory.call(args, theme, context));
      return text;
    },
    renderResult(result: ToolResultLike, options: ToolRenderOptions, theme: ThemeLike, context?: ToolRenderContext) {
      const text = getTextComponent(context);
      text.setText(factory.result(result, options, theme, context) || "");
      return text;
    },
  };
}

function createMessageBox(title: string, content: string, expanded: boolean, theme: ThemeLike): Box {
  const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
  const markdownTheme = getMarkdownTheme();

  box.addChild(new Text(theme.fg("customMessageLabel", theme.bold(title)), 0, 0));
  box.addChild(new Spacer(1));

  if (expanded) {
    box.addChild(new Markdown(content, 0, 0, markdownTheme, {
      color: (text) => theme.fg("customMessageText", text),
    }));
  } else {
    const preview = formatSimpleResult(content, { expanded: false }, theme, {
      collapsedLines: 14,
      color: "customMessageText",
    }).replace(/^\n/, "");
    box.addChild(new Text(preview || theme.fg("customMessageText", "(empty)"), 0, 0));
  }

  return box;
}

function createMessageBoxRenderer(title: string) {
  return (message: { content?: unknown }, { expanded }: { expanded: boolean }, theme: ThemeLike) => {
    const content = typeof message.content === "string" ? message.content : extractText(message as ToolResultLike);
    return createMessageBox(title, content, expanded, theme);
  };
}

function formatActionCall(toolName: string, args: Record<string, unknown> | undefined, theme: ThemeLike, extra?: string): string {
  const action = textValue(args?.action) || "run";
  return `${theme.fg("toolTitle", theme.bold(toolName))} ${theme.fg("accent", action)}${extra ? ` ${theme.fg("muted", extra)}` : ""}`;
}

function createActionToolRenderers(toolName: string, options?: {
  callExtra?: (args: Record<string, unknown> | undefined) => string | undefined;
  resultWarning?: (result: ToolResultLike) => string | undefined;
  collapsedLines?: number;
}) {
  return createTextToolRenderers({
    call(args, theme) {
      return formatActionCall(toolName, args, theme, options?.callExtra?.(args));
    },
    result(result, renderOptions, theme) {
      const warning = options?.resultWarning?.(result);
      if (result.isError) {
        return formatSimpleResult(extractText(result), { ...renderOptions, expanded: true }, theme, {
          color: "error",
          warning,
          collapsedLines: options?.collapsedLines,
        });
      }
      return formatSimpleResult(extractText(result), renderOptions, theme, {
        warning,
        collapsedLines: options?.collapsedLines ?? 16,
      });
    },
  });
}

export const roleInfoToolRenderers = createTextToolRenderers({
  call(_args, theme) {
    return `${theme.fg("toolTitle", theme.bold("role_info"))} ${theme.fg("muted", "get role directory structure")}`;
  },
  result(result, options, theme) {
    const details = result.details || {};
    const count = typeof details.count === "number" ? `${details.count} entries` : undefined;
    const base = textValue(details.base);
    const warning = [count, base ? `base ${base}` : undefined].filter(Boolean).join(" · ");
    return formatSimpleResult(extractText(result), options, theme, { collapsedLines: 20, warning: warning || undefined });
  },
});

type MemorySearchMatchLike = {
  kind?: string;
  id?: string;
  text?: string;
  category?: string;
  used?: number;
  score?: number;
};

function formatMemorySearchItem(match: MemorySearchMatchLike, theme: ThemeLike, expanded: boolean): string {
  const kind = match.kind || "memory";
  const score = typeof match.score === "number" ? match.score.toFixed(2) : undefined;
  const used = typeof match.used === "number" ? `${match.used}x` : undefined;
  const category = match.category ? `[${match.category}]` : undefined;
  const id = match.id ? `[${match.id}]` : undefined;
  const meta = [kind, id, category, score ? `score ${score}` : undefined, used ? `used ${used}` : undefined]
    .filter(Boolean)
    .join(" · ");

  if (!expanded) {
    const text = textValue(match.text) || "";
    return `- ${theme.fg("accent", meta || kind)} ${theme.fg("toolOutput", text.replace(/\s+/g, " ").trim())}`;
  }

  return [
    `- ${theme.fg("accent", meta || kind)}`,
    theme.fg("toolOutput", `  ${(textValue(match.text) || "(empty)").replace(/\n/g, "\n  ")}`),
  ].join("\n");
}

function formatMemorySearchResult(result: ToolResultLike, options: ToolRenderOptions, theme: ThemeLike): string {
  const details = result.details || {};
  const matches = Array.isArray(details.matches) ? (details.matches as MemorySearchMatchLike[]) : [];
  const count = typeof details.count === "number" ? details.count : matches.length;
  const mode = textValue(details.mode);
  const query = textValue(details.query);

  if (result.isError) {
    return formatSimpleResult(extractText(result), { ...options, expanded: true }, theme, { color: "error" });
  }

  if (matches.length === 0) {
    return `\n${theme.fg("muted", "No matches")}`;
  }

  const previewCount = options.expanded ? matches.length : Math.min(matches.length, 3);
  const visible = matches.slice(0, previewCount).map((match) => formatMemorySearchItem(match, theme, !!options.expanded));
  const remaining = matches.length - previewCount;
  const summary = [
    query ? `query ${JSON.stringify(query)}` : undefined,
    mode,
    `${count} results`,
  ].filter(Boolean).join(" · ");

  let text = `\n${theme.fg("warning", summary)}`;
  text += `\n${visible.join("\n")}`;
  if (remaining > 0) {
    text += `\n${theme.fg("muted", `... (${remaining} more results, ${expandHint(theme)})`)}`;
  }
  return text;
}

export const memoryToolRenderers = createTextToolRenderers({
  call(args, theme) {
    const a = args || {};
    const extra = textValue(a.query)
      ? `query=${JSON.stringify(a.query)}`
      : textValue(a.id)
        ? `id=${a.id}`
        : textValue(a.category)
          ? `category=${a.category}`
          : undefined;
    return formatActionCall("memory", args, theme, extra);
  },
  result(result, renderOptions, theme, context) {
    const action = textValue(context?.args?.action);
    if (action === "search") {
      return formatMemorySearchResult(result, renderOptions, theme);
    }
    const warning = typeof result.details?.count === "number" ? `${result.details.count} results` : undefined;
    if (result.isError) {
      return formatSimpleResult(extractText(result), { ...renderOptions, expanded: true }, theme, {
        color: "error",
        warning,
      });
    }
    return formatSimpleResult(extractText(result), renderOptions, theme, {
      warning,
      collapsedLines: 16,
    });
  },
});

export const knowledgeToolRenderers = createActionToolRenderers("knowledge", {
  callExtra(args) {
    const a = args || {};
    return textValue(a.path)
      ? shortenPath(a.path)
      : textValue(a.query)
        ? JSON.stringify(a.query)
        : textValue(a.category)
          ? `category=${a.category}`
          : undefined;
  },
  resultWarning(result) {
    const count = typeof result.details?.count === "number" ? `${result.details.count} results` : undefined;
    const totalEntries = typeof result.details?.totalEntries === "number" ? `${result.details.totalEntries} entries` : undefined;
    return [count, totalEntries].filter(Boolean).join(" · ") || undefined;
  },
});

export function registerRoleMessageRenderers(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("role-notify", createMessageBoxRenderer("Role"));
  pi.registerMessageRenderer("role-memories", createMessageBoxRenderer("🧠 Role Memories"));
  pi.registerMessageRenderer("role-tags", createMessageBoxRenderer("🏷 Role Tags"));
  pi.registerMessageRenderer("memory-log", createMessageBoxRenderer("🧠 Memory Log"));
}
