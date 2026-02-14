import { splitMessage } from "../../../core/utils.ts";

/**
 * Format tool call for Discord display.
 * Discord natively renders markdown, so we use code blocks directly.
 */
export function formatToolLine(name: string, args?: Record<string, unknown>): string {
  const pick = (keys: string[]): string | undefined => {
    if (!args) return undefined;
    for (const k of keys) {
      const v = args[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  };

  const wrap = (content: string): string =>
    content.trim() ? "```\n" + content.trim() + "\n```" : `\`${name}\``;

  switch (name) {
    case "read":
    case "write":
    case "edit":
    case "multi_edit":
      return wrap(`${name} ${pick(["path", "file"]) ?? ""}`);
    case "bash": {
      const cmd = pick(["command", "cmd"]) ?? "";
      return cmd ? "```bash\n" + cmd + "\n```" : `\`${name}\``;
    }
    default: {
      if (!args) return `\`${name}\``;
      const preview = JSON.stringify(args);
      const content =
        preview.length > 120 ? preview.slice(0, 120) + "…" : preview;
      return wrap(`${name} ${content}`);
    }
  }
}

/** Split text for Discord's 2000 char limit */
export function splitDiscordText(text: string, max = 2000): string[] {
  return splitMessage(text, max);
}
