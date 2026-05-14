/**
 * pi-tool-list - Searchable tool browser with fuzzy matching
 * 
 * Shows all registered tools in a searchable overlay with:
 * - Fuzzy search by name/description
 * - Grouped by source (builtin, extension, MCP)
 * - Key info: name, description, parameters
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { Container, Text, Input, matchesKey } from "@earendil-works/pi-tui";
import type { Focusable, KeybindingsManager, TUI } from "@earendil-works/pi-tui";

// =============================================================================
// Types
// =============================================================================

interface ToolGroup {
  source: string;
  tools: ToolInfo[];
}

interface FilteredTool {
  tool: ToolInfo;
  source: string;
  score: number;
}

// =============================================================================
// Fuzzy Search (from tui-beautiful-rendering.md)
// =============================================================================

function fuzzyScore(query: string, text: string): number {
  const lq = query.toLowerCase();
  const lt = text.toLowerCase();
  if (lt.includes(lq)) return 100 + (lq.length / lt.length) * 50;

  let score = 0;
  let qi = 0;
  let consecutive = 0;
  for (let i = 0; i < lt.length && qi < lq.length; i++) {
    if (lt[i] === lq[qi]) {
      score += 10 + consecutive;
      consecutive += 5;
      qi++;
    } else {
      consecutive = 0;
    }
  }
  return qi === lq.length ? score : 0;
}

function fuzzyFilter(tools: FilteredTool[], query: string): FilteredTool[] {
  const q = query.trim();
  if (!q) return tools;

  return tools
    .map((item) => ({
      item,
      score: Math.max(
        fuzzyScore(q, item.tool.name),
        fuzzyScore(q, item.tool.description) * 0.8
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

// =============================================================================
// Tool Formatting
// =============================================================================

function getToolSource(tool: ToolInfo): string {
  const info = tool.sourceInfo as { type?: string; extension?: string; provider?: string } | undefined;
  if (!info) return "builtin";
  
  if (info.type === "mcp") return "mcp";
  if (info.type === "builtin") return "builtin";
  if (info.extension) return info.extension;
  if (info.provider) return info.provider;
  
  return "builtin";
}

function groupTools(tools: ToolInfo[]): ToolGroup[] {
  const groups = new Map<string, ToolInfo[]>();
  
  for (const tool of tools) {
    const source = getToolSource(tool);
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source)!.push(tool);
  }
  
  return Array.from(groups.entries())
    .map(([source, tools]) => ({ source, tools }))
    .sort((a, b) => {
      const order = ["builtin", "extension", "mcp"];
      const ai = order.indexOf(a.source);
      const bi = order.indexOf(b.source);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.source.localeCompare(b.source);
    });
}

function countParams(params: unknown): number {
  if (!params || typeof params !== "object") return 0;
  return Object.keys(params as Record<string, unknown>).length;
}

// =============================================================================
// Rendering Helpers (from tui-beautiful-rendering.md)
// =============================================================================

function renderHeader(text: string, width: number, theme: ExtensionContext["ui"]["theme"]): string {
  const innerW = width - 2;
  const padLen = Math.max(0, innerW - text.length);
  const padLeft = Math.floor(padLen / 2);
  const padRight = padLen - padLeft;
  return (
    theme.fg("border", "╭" + "─".repeat(padLeft)) +
    theme.fg("accent", text) +
    theme.fg("border", "─".repeat(padRight) + "╮")
  );
}

function renderFooter(text: string, width: number, theme: ExtensionContext["ui"]["theme"]): string {
  const innerW = width - 2;
  const padLen = Math.max(0, innerW - text.length);
  const padLeft = Math.floor(padLen / 2);
  const padRight = padLen - padLeft;
  return (
    theme.fg("border", "╰" + "─".repeat(padLeft)) +
    theme.fg("dim", text) +
    theme.fg("border", "─".repeat(padRight) + "╯")
  );
}

function pad(s: string, len: number): string {
  return s + " ".repeat(Math.max(0, len - s.length));
}

function row(content: string, width: number, theme: ExtensionContext["ui"]["theme"]): string {
  const innerW = width - 2;
  return theme.fg("border", "│") + pad(content, innerW) + theme.fg("border", "│");
}

function getSourceColor(source: string, theme: ExtensionContext["ui"]["theme"]): string {
  switch (source) {
    case "builtin": return theme.fg("success", source);
    case "mcp": return theme.fg("warning", source);
    default: return theme.fg("accent", source);
  }
}

// =============================================================================
// Tool List Component
// =============================================================================

class ToolListComponent extends Container implements Focusable {
  private searchQuery = "";
  private filteredTools: FilteredTool[] = [];
  private cursor = 0;
  private scrollOffset = 0;
  private viewportHeight = 12;
  private _focused = false;
  
  private readonly input: Input;
  private readonly groups: ToolGroup[];
  
  get focused(): boolean { return this._focused; }
  set focused(value: boolean) {
    this._focused = value;
    this.input.focused = value;
  }

  constructor(
    private tui: TUI,
    private theme: ExtensionContext["ui"]["theme"],
    tools: ToolInfo[],
    private keybindings: KeybindingsManager,
    private done: () => void,
  ) {
    super();
    
    // Group tools by source
    this.groups = groupTools(tools);
    
    // Flatten to filtered array for display
    this.filteredTools = this.groups.flatMap((g) =>
      g.tools.map((tool) => ({ tool, source: g.source, score: 0 }))
    );
    
    // Setup input
    this.input = new Input();
    this.input.onSubmit = (_value) => {
      // Select current tool
      if (this.filteredTools.length > 0 && this.cursor < this.filteredTools.length) {
        const selected = this.filteredTools[this.cursor];
        this.done();
      }
    };
    this.input.onEscape = () => this.done();
  }

  private applyFilter(): void {
    const flat = this.groups.flatMap((g) =>
      g.tools.map((tool) => ({ tool, source: g.source, score: 0 }))
    );
    this.filteredTools = fuzzyFilter(flat, this.searchQuery);
    this.cursor = Math.min(this.cursor, Math.max(0, this.filteredTools.length - 1));
    this.scrollOffset = Math.min(this.scrollOffset, Math.max(0, this.filteredTools.length - this.viewportHeight));
  }

  handleInput(data: string): void {
    // Check global shortcuts first
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.done();
      return;
    }
    
    if (matchesKey(data, "up")) {
      this.cursor = Math.max(0, this.cursor - 1);
      this.ensureScrollVisible();
      this.tui.requestRender();
      return;
    }
    
    if (matchesKey(data, "down")) {
      this.cursor = Math.min(this.filteredTools.length - 1, this.cursor + 1);
      this.ensureScrollVisible();
      this.tui.requestRender();
      return;
    }
    
    if (matchesKey(data, "pageUp")) {
      this.cursor = Math.max(0, this.cursor - this.viewportHeight);
      this.scrollOffset = Math.max(0, this.scrollOffset - this.viewportHeight);
      this.tui.requestRender();
      return;
    }
    
    if (matchesKey(data, "pageDown")) {
      this.cursor = Math.min(this.filteredTools.length - 1, this.cursor + this.viewportHeight);
      this.ensureScrollVisible();
      this.tui.requestRender();
      return;
    }
    
    if (matchesKey(data, "return")) {
      this.done();
      return;
    }
    
    // Let input handle the rest
    const prevLen = this.searchQuery.length;
    this.input.handleInput(data);
    this.searchQuery = this.input.getValue() || "";
    
    if (this.searchQuery.length !== prevLen) {
      this.applyFilter();
    }
    
    this.tui.requestRender();
  }

  private ensureScrollVisible(): void {
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    } else if (this.cursor >= this.scrollOffset + this.viewportHeight) {
      this.scrollOffset = this.cursor - this.viewportHeight + 1;
    }
  }

  override render(width: number): string[] {
    const dialogWidth = Math.max(60, Math.floor(width * 0.9));
    const innerWidth = dialogWidth - 2;
    this.viewportHeight = Math.max(8, Math.min(20, Math.floor((process.stdout.rows ?? 24) * 0.6)));
    
    const lines: string[] = [];
    
    // Header
    const title = this.filteredTools.length === this.groups.flatMap(g => g.tools).length
      ? `Available Tools (${this.filteredTools.length})`
      : `Search: "${this.searchQuery}" (${this.filteredTools.length} matches)`;
    lines.push(renderHeader(title, dialogWidth, this.theme));
    
    // Column headers
    lines.push(row(
      pad("NAME", 20) + " " + pad("SOURCE", 12) + " " + pad("PARAMS", 6) + " DESCRIPTION",
      dialogWidth,
      this.theme
    ));
    lines.push(this.theme.fg("border", "├" + "─".repeat(20) + "┬" + "─".repeat(12) + "┬" + "─".repeat(6) + "┴" + "─".repeat(innerWidth - 42) + "┤"));
    
    // Tool list
    const visibleTools = this.filteredTools.slice(this.scrollOffset, this.scrollOffset + this.viewportHeight);
    const maxScroll = Math.max(0, this.filteredTools.length - this.viewportHeight);
    
    if (visibleTools.length === 0) {
      lines.push(row(pad("No tools found", dialogWidth - 2), dialogWidth, this.theme));
    } else {
      for (let i = 0; i < visibleTools.length; i++) {
        const item = visibleTools[i];
        const globalIndex = this.scrollOffset + i;
        const selected = globalIndex === this.cursor;
        
        const name = item.tool.name.slice(0, 20);
        const source = item.source.slice(0, 12);
        const params = countParams(item.tool.parameters).toString();
        const desc = item.tool.description.slice(0, innerWidth - 45);
        
        let line = pad(name, 20) + " " + pad(source, 12) + " " + pad(params, 6) + " " + desc;
        
        if (selected) {
          // Use dim color for selected item
          line = this.theme.fg("warning", "> ") + this.theme.fg("accent", line.slice(2));
        }
        
        lines.push(row(line, dialogWidth, this.theme));
      }
    }
    
    // Fill remaining space
    const remaining = this.viewportHeight - visibleTools.length;
    for (let i = 0; i < remaining; i++) {
      lines.push(row("", dialogWidth, this.theme));
    }
    
    // Scroll indicator
    const scrollInfo = this.scrollOffset > 0 || maxScroll > 0
      ? `↑↓ ${this.scrollOffset + 1}-${this.scrollOffset + visibleTools.length} of ${this.filteredTools.length}`
      : `${this.filteredTools.length} tools`;
    lines.push(renderFooter(`[${scrollInfo}]  [↑↓] Scroll  [/] Search  [Enter] Select  [Esc] Close`, dialogWidth, this.theme));
    
    // Input row
    const inputLabel = this.theme.fg("dim", "Search:");
    const inputValue = this.searchQuery + (this._focused ? "█" : "");
    lines.push(row(`${inputLabel} ${inputValue}`, dialogWidth, this.theme));
    
    return lines;
  }
}

// =============================================================================
// Extension Entry Point
// =============================================================================

export default function (pi: ExtensionAPI) {
  pi.registerCommand("tool-list", {
    description: "Browse all registered tools with fuzzy search",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("Tool list requires TUI", "error");
        return;
      }

      const allTools = pi.getAllTools();
      
      if (allTools.length === 0) {
        ctx.ui.notify("No tools registered", "info");
        return;
      }

      const result = await ctx.ui.custom<void>(
        (tui: TUI, theme: ExtensionContext["ui"]["theme"], keybindings: KeybindingsManager, done: () => void) => {
          return new ToolListComponent(tui, theme, allTools, keybindings, done);
        },
        { overlay: true }
      );
    },
  });
}
