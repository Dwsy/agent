import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import { listRoleMemory, readMemoryPromptBlocks, readRoleMemory } from "./memory-md.ts";

export type MemoryViewFilter = "all" | "learnings" | "preferences" | "events";

export function buildRoleMemoryViewerMarkdown(
  rolePath: string,
  roleName: string,
  filter: MemoryViewFilter = "all"
): string {
  const summary = listRoleMemory(rolePath, roleName).text;
  const blocks = readMemoryPromptBlocks(rolePath);

  if (filter === "all") {
    return [summary, ...blocks].join("\n\n---\n\n");
  }

  const data = readRoleMemory(rolePath, roleName);

  if (filter === "learnings") {
    const learnings = [...data.learnings].sort((a, b) => {
      if (b.used !== a.used) return b.used - a.used;
      return a.text.localeCompare(b.text);
    });
    const lines = [
      `# Learnings (${learnings.length})`,
      "",
      ...(learnings.length > 0 ? learnings.map((l) => `- [${l.id}] [${l.used}x] ${l.text}`) : ["- (none)"]),
    ];
    return lines.join("\n");
  }

  if (filter === "preferences") {
    const byCategory = new Map<string, string[]>();
    for (const pref of data.preferences) {
      const list = byCategory.get(pref.category) || [];
      list.push(pref.text);
      byCategory.set(pref.category, list);
    }

    const categories = Array.from(byCategory.keys()).sort();
    const lines: string[] = [`# Preferences (${data.preferences.length})`, ""];
    if (categories.length === 0) {
      lines.push("- (none)");
    } else {
      for (const cat of categories) {
        lines.push(`## ${cat}`);
        for (const text of (byCategory.get(cat) || []).sort()) {
          lines.push(`- ${text}`);
        }
        lines.push("");
      }
    }
    return lines.join("\n").replace(/\n+$/, "");
  }

  const dailyBlocks = blocks.filter((b) => b.startsWith("### Daily Memory:"));
  const lines: string[] = ["# Events", "", ...(data.events.length > 0 ? data.events : ["- (none)"])];

  if (dailyBlocks.length > 0) {
    lines.push("", "---", "", "# Daily Memory Logs", "", ...dailyBlocks);
  }

  return lines.join("\n");
}

export class RoleMemoryViewerComponent {
  private filter: MemoryViewFilter = "all";
  private scrollOffset = 0;
  private allLines: string[] = [];
  private lastWidth = 0;
  private md!: Markdown;
  private disposed = false;

  constructor(
    private rolePath: string,
    private roleName: string,
    private tui: any,
    private theme: any,
    private done: () => void,
  ) {
    this.rebuildMarkdown();
  }

  private rebuildMarkdown(): void {
    const content = buildRoleMemoryViewerMarkdown(this.rolePath, this.roleName, this.filter);
    this.md = new Markdown(content, 1, 0, getMarkdownTheme());
    this.lastWidth = 0;
    this.allLines = [];
  }

  private setFilter(next: MemoryViewFilter): void {
    if (this.filter === next) return;
    this.filter = next;
    this.scrollOffset = 0;
    this.rebuildMarkdown();
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (this.disposed) return;

    const pageSize = Math.max(1, this.visibleLines() - 2);
    const maxScroll = Math.max(0, this.allLines.length - this.visibleLines());

    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.disposed = true;
      this.done();
    } else if (data === "0" || data === "a" || data === "A") {
      this.setFilter("all");
    } else if (data === "1" || data === "l" || data === "L") {
      this.setFilter("learnings");
    } else if (data === "2" || data === "p" || data === "P") {
      this.setFilter("preferences");
    } else if (data === "3" || data === "e" || data === "E") {
      this.setFilter("events");
    } else if (matchesKey(data, "shift+up")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - pageSize);
      this.tui.requestRender();
    } else if (matchesKey(data, "shift+down")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + pageSize);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("u"))) {
      this.scrollOffset = Math.max(0, this.scrollOffset - pageSize);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("d"))) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + pageSize);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.home) || matchesKey(data, "g")) {
      this.scrollOffset = 0;
      this.tui.requestRender();
    } else if (matchesKey(data, Key.end) || data === "G") {
      this.scrollOffset = maxScroll;
      this.tui.requestRender();
    }
  }

  private visibleLines(): number {
    return Math.max(1, process.stdout.rows - 9);
  }

  render(width: number): string[] {
    const th = this.theme;
    const innerW = Math.max(1, width - 2);

    if (width !== this.lastWidth) {
      this.lastWidth = width;
      this.allLines = this.md.render(innerW);
    }

    const visible = this.visibleLines();
    const maxScroll = Math.max(0, this.allLines.length - visible);
    if (this.scrollOffset > maxScroll) this.scrollOffset = maxScroll;

    const border = (c: string) => th.fg("border", c);
    const accent = (c: string) => th.fg("accent", c);
    const dim = (c: string) => th.fg("dim", c);
    const result: string[] = [];

    const title = ` Role Memories `;
    const titleW = visibleWidth(title);
    const leftPad = Math.floor((innerW - titleW) / 2);
    const rightPad = innerW - titleW - leftPad;

    result.push(border("╭") + border("─".repeat(leftPad)) + accent(title) + border("─".repeat(rightPad)) + border("╮"));

    const total = this.allLines.length;
    const pos = total > 0 ? Math.floor(((this.scrollOffset + visible / 2) / Math.max(1, total)) * 100) : 0;
    const scrollInfo = `${Math.min(pos, 100)}% (${this.scrollOffset + 1}-${Math.min(this.scrollOffset + visible, total)}/${total})`;
    result.push(border("│") + truncateToWidth(dim(` ${scrollInfo}`), innerW, "", true) + border("│"));

    const tab = (label: string, key: string, active: boolean) =>
      active ? accent(th.bold(`[${key}] ${label}`)) : dim(`[${key}] ${label}`);

    const tabs = [
      tab("All", "0", this.filter === "all"),
      tab("Learnings", "1", this.filter === "learnings"),
      tab("Preferences", "2", this.filter === "preferences"),
      tab("Events", "3", this.filter === "events"),
    ].join("  ");

    result.push(border("│") + truncateToWidth(` ${tabs}`, innerW, "", true) + border("│"));
    result.push(border("├") + border("─".repeat(innerW)) + border("┤"));

    const visibleSlice = this.allLines.slice(this.scrollOffset, this.scrollOffset + visible);
    for (const line of visibleSlice) {
      result.push(border("│") + truncateToWidth(line, innerW, "…", true) + border("│"));
    }

    for (let i = visibleSlice.length; i < visible; i++) {
      result.push(border("│") + " ".repeat(innerW) + border("│"));
    }

    result.push(border("├") + border("─".repeat(innerW)) + border("┤"));
    const help = ` Role: ${this.roleName}  ·  0/1/2/3 filter  ↑↓/jk scroll  Shift+↑↓/PgUpDn page  Home/End jump  Esc close`;
    result.push(border("│") + truncateToWidth(dim(help), innerW, "", true) + border("│"));
    result.push(border("╰") + border("─".repeat(innerW)) + border("╯"));

    return result;
  }

  invalidate(): void {
    this.lastWidth = 0;
    this.md.invalidate();
  }
}
