/**
 * pi-tool-inspect - Split-pane tool inspector with fuzzy matching
 *
 * Shows all registered tools in a searchable overlay with:
 * - Fuzzy search by name/description
 * - Collapsible groups by source/plugin
 * - Split-pane details for selected groups and tools
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { Container, Input, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Focusable, KeybindingsManager, TUI } from "@earendil-works/pi-tui";

interface ToolGroup {
  source: string;
  tools: ToolInfo[];
}

interface FilteredTool {
  tool: ToolInfo;
  source: string;
  score: number;
}

type BrowserRow =
  | { kind: "group"; source: string; tools: ToolInfo[]; expanded: boolean }
  | { kind: "tool"; source: string; tool: ToolInfo };

function fuzzyScore(query: string, text: string): number {
  const lq = query.toLowerCase();
  const lt = text.toLowerCase();
  if (lt.includes(lq)) return 100 + (lq.length / Math.max(1, lt.length)) * 50;

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
        fuzzyScore(q, item.tool.description) * 0.8,
        fuzzyScore(q, item.source) * 0.6,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => ({ ...x.item, score: x.score }));
}

interface SourceInfoLike {
  path?: string;
  source?: string;
  type?: string;
  extension?: string;
  provider?: string;
}

function cleanSourceValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sourceNameFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined;

  const synthetic = path.match(/^<([^:>]+):([^>]+)>$/);
  if (synthetic) return synthetic[1] === "builtin" ? "builtin" : synthetic[2];

  const marker = "/extensions/";
  const markerIndex = path.lastIndexOf(marker);
  if (markerIndex >= 0) {
    const name = path.slice(markerIndex + marker.length).replace(/^\/+/, "").split("/")[0];
    return name?.replace(/\.(ts|tsx|js|mjs|cjs)$/i, "");
  }

  return path.split("/").filter(Boolean).pop()?.replace(/\.(ts|tsx|js|mjs|cjs)$/i, "");
}

function getToolSource(tool: ToolInfo): string {
  const info = tool.sourceInfo as SourceInfoLike | undefined;
  if (!info) return "unknown";

  const source = cleanSourceValue(info.source) ?? cleanSourceValue(info.type);
  const detail = cleanSourceValue(info.extension) ?? cleanSourceValue(info.provider) ?? sourceNameFromPath(info.path);
  if (!source) return detail ?? "unknown";
  if (source === "builtin") return "builtin";
  if (!detail || detail === source) return source;
  if (source === "extension" || source === "sdk") return detail;
  if (source === "mcp") return `mcp:${detail}`;
  return `${source}:${detail}`;
}

function groupTools(tools: ToolInfo[]): ToolGroup[] {
  const groups = new Map<string, ToolInfo[]>();

  for (const tool of tools) {
    const source = getToolSource(tool);
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source)!.push(tool);
  }

  const rank = (source: string) => {
    if (source === "builtin") return 0;
    if (source.startsWith("mcp:")) return 2;
    if (source === "unknown") return 3;
    return 1;
  };

  return Array.from(groups.entries())
    .map(([source, tools]) => ({
      source,
      tools: [...tools].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => rank(a.source) - rank(b.source) || a.source.localeCompare(b.source));
}

function countParams(params: unknown): number {
  const properties = getSchemaProperties(params);
  if (properties) return Object.keys(properties).length;
  if (!params || typeof params !== "object") return 0;
  return Object.keys(params as Record<string, unknown>).length;
}

function getSchemaProperties(params: unknown): Record<string, unknown> | undefined {
  if (!params || typeof params !== "object") return undefined;
  const schema = params as { properties?: unknown };
  if (!schema.properties || typeof schema.properties !== "object") return undefined;
  return schema.properties as Record<string, unknown>;
}

function getRequiredParams(params: unknown): Set<string> {
  if (!params || typeof params !== "object") return new Set();
  const required = (params as { required?: unknown }).required;
  return new Set(Array.isArray(required) ? required.filter((x): x is string => typeof x === "string") : []);
}

function describeSchema(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const value = schema as Record<string, unknown>;

  if (typeof value.type === "string") return value.type;
  if (Array.isArray(value.enum)) return value.enum.map(String).join(" | ");
  if (value.const !== undefined) return JSON.stringify(value.const);
  if (Array.isArray(value.anyOf)) return value.anyOf.map(describeSchema).join(" | ");
  if (Array.isArray(value.oneOf)) return value.oneOf.map(describeSchema).join(" | ");

  return "object";
}

function schemaDescription(schema: unknown): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const description = (schema as { description?: unknown }).description;
  return typeof description === "string" && description.trim() ? description.trim() : undefined;
}

function renderHeader(text: string, width: number, theme: ExtensionContext["ui"]["theme"]): string {
  const innerW = width - 2;
  const safeText = truncateToWidth(text, innerW);
  const padLen = Math.max(0, innerW - visibleWidth(safeText));
  const padLeft = Math.floor(padLen / 2);
  const padRight = padLen - padLeft;
  return (
    theme.fg("border", "╭" + "─".repeat(padLeft)) +
    theme.fg("accent", safeText) +
    theme.fg("border", "─".repeat(padRight) + "╮")
  );
}

function renderFooter(text: string, width: number, theme: ExtensionContext["ui"]["theme"]): string {
  const innerW = width - 2;
  const safeText = truncateToWidth(text, innerW);
  const padLen = Math.max(0, innerW - visibleWidth(safeText));
  const padLeft = Math.floor(padLen / 2);
  const padRight = padLen - padLeft;
  return (
    theme.fg("border", "╰" + "─".repeat(padLeft)) +
    theme.fg("dim", safeText) +
    theme.fg("border", "─".repeat(padRight) + "╯")
  );
}

function padAnsi(s: string, width: number): string {
  const clipped = truncateToWidth(s, Math.max(0, width));
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function row(content: string, width: number, theme: ExtensionContext["ui"]["theme"]): string {
  return theme.fg("border", "│") + padAnsi(content, width - 2) + theme.fg("border", "│");
}

function divider(leftWidth: number, rightWidth: number, theme: ExtensionContext["ui"]["theme"]): string {
  return theme.fg("border", "├" + "─".repeat(leftWidth) + "┼" + "─".repeat(rightWidth) + "┤");
}

function splitFooter(leftWidth: number, rightWidth: number, theme: ExtensionContext["ui"]["theme"]): string {
  return theme.fg("border", "╰" + "─".repeat(leftWidth) + "┴" + "─".repeat(rightWidth) + "╯");
}

function takeVisible(text: string, width: number): [head: string, tail: string] {
  let head = "";
  let used = 0;
  const chars = Array.from(text);

  for (let i = 0; i < chars.length; i++) {
    const next = chars[i];
    const nextWidth = visibleWidth(next);
    if (used + nextWidth > width) {
      return [head, chars.slice(i).join("")];
    }
    head += next;
    used += nextWidth;
  }

  return [head, ""];
}

function pushWrappedWord(lines: string[], word: string, width: number): void {
  let rest = word;
  while (visibleWidth(rest) > width) {
    const [head, tail] = takeVisible(rest, width);
    if (!head) break;
    lines.push(head);
    rest = tail;
  }
  if (rest) lines.push(rest);
}

function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(8, width);
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (visibleWidth(word) > safeWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      pushWrappedWord(lines, word, safeWidth);
    } else if (!current) {
      current = word;
    } else if (visibleWidth(`${current} ${word}`) <= safeWidth) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function selectedText(text: string, selected: boolean, theme: ExtensionContext["ui"]["theme"]): string {
  return selected ? theme.fg("accent", text) : text;
}

class ToolListComponent extends Container implements Focusable {
  private searchQuery = "";
  private cursor = 0;
  private scrollOffset = 0;
  private detailScroll = 0;
  private viewportHeight = 16;
  private rows: BrowserRow[] = [];
  private _focused = false;
  private readonly input = new Input();
  private readonly groups: ToolGroup[];
  private readonly expandedSources = new Set<string>();

  get focused(): boolean { return this._focused; }
  set focused(value: boolean) {
    this._focused = value;
    this.input.focused = value;
  }

  constructor(
    private tui: TUI,
    private theme: ExtensionContext["ui"]["theme"],
    tools: ToolInfo[],
    private done: () => void,
  ) {
    super();
    this.groups = groupTools(tools);
    this.input.onSubmit = () => this.toggleOrClose();
    this.input.onEscape = () => this.done();
    this.syncRows();
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.done();
      return;
    }

    if (matchesKey(data, "up")) {
      this.moveCursor(-1);
      return;
    }

    if (matchesKey(data, "down")) {
      this.moveCursor(1);
      return;
    }

    if (matchesKey(data, "pageUp")) {
      this.moveCursor(-this.viewportHeight);
      return;
    }

    if (matchesKey(data, "pageDown")) {
      this.moveCursor(this.viewportHeight);
      return;
    }

    if (matchesKey(data, "return") || matchesKey(data, "right")) {
      this.toggleOrClose();
      return;
    }

    if (matchesKey(data, "left")) {
      this.collapseCurrentGroup();
      return;
    }

    if (data === "[") {
      this.detailScroll = Math.max(0, this.detailScroll - 1);
      this.tui.requestRender();
      return;
    }

    if (data === "]") {
      this.detailScroll += 1;
      this.tui.requestRender();
      return;
    }

    const previous = this.searchQuery;
    this.input.handleInput(data);
    this.searchQuery = this.input.getValue() || "";

    if (this.searchQuery !== previous) {
      this.cursor = 0;
      this.scrollOffset = 0;
      this.detailScroll = 0;
      this.syncRows();
    }

    this.tui.requestRender();
  }

  override render(width: number): string[] {
    const terminalColumns = (this.tui as { terminal?: { columns?: number } }).terminal?.columns ?? width;
    const availableWidth = Math.max(width, terminalColumns);
    const maxWidth = Math.max(50, availableWidth - 2);
    const targetWidth = Math.max(120, Math.floor(availableWidth * 0.98));
    const dialogWidth = Math.min(targetWidth, maxWidth);
    const innerWidth = dialogWidth - 2;
    const leftWidth = Math.max(28, Math.min(44, Math.floor(innerWidth * 0.3)));
    const rightWidth = Math.max(16, innerWidth - leftWidth - 1);
    const terminalRows = (this.tui as { terminal?: { rows?: number } }).terminal?.rows ?? 32;
    this.viewportHeight = Math.max(12, Math.min(28, terminalRows - 8));
    this.syncRows();

    const lines: string[] = [];
    const totalTools = this.groups.reduce((sum, group) => sum + group.tools.length, 0);
    const title = this.searchQuery.trim()
      ? `Tool Inspect · ${this.rows.filter((r) => r.kind === "tool").length} matches`
      : `Tool Inspect · ${this.groups.length} sources · ${totalTools} tools`;

    lines.push(renderHeader(title, dialogWidth, this.theme));
    lines.push(row(`${this.theme.fg("dim", "Search:")} ${this.searchQuery}${this._focused ? "█" : ""}`, dialogWidth, this.theme));
    lines.push(divider(leftWidth, rightWidth, this.theme));
    lines.push(this.renderSplitRow(
      this.theme.fg("dim", "SOURCE / TOOL"),
      this.theme.fg("dim", "DETAILS"),
      leftWidth,
      rightWidth,
      dialogWidth,
    ));
    lines.push(divider(leftWidth, rightWidth, this.theme));

    const visibleRows = this.rows.slice(this.scrollOffset, this.scrollOffset + this.viewportHeight);
    const detailLines = this.detailLines(rightWidth);
    const clampedDetailScroll = Math.min(this.detailScroll, Math.max(0, detailLines.length - this.viewportHeight));
    this.detailScroll = clampedDetailScroll;
    const visibleDetails = detailLines.slice(clampedDetailScroll, clampedDetailScroll + this.viewportHeight);

    for (let i = 0; i < this.viewportHeight; i++) {
      const rowItem = visibleRows[i];
      const left = rowItem ? this.renderLeftRow(rowItem, this.scrollOffset + i === this.cursor, leftWidth) : "";
      const right = visibleDetails[i] ?? "";
      lines.push(this.renderSplitRow(left, right, leftWidth, rightWidth, dialogWidth));
    }

    const scrollInfo = this.rows.length > this.viewportHeight
      ? `${this.scrollOffset + 1}-${Math.min(this.scrollOffset + this.viewportHeight, this.rows.length)} / ${this.rows.length}`
      : `${this.rows.length} rows`;
    const detailInfo = detailLines.length > this.viewportHeight
      ? ` · details ${clampedDetailScroll + 1}-${Math.min(clampedDetailScroll + this.viewportHeight, detailLines.length)} / ${detailLines.length} ([/])`
      : "";
    const footerText = `${scrollInfo}${detailInfo} · ↑↓ select · Enter/→ expand · ← collapse · type search · Esc`;
    lines.push(row(this.theme.fg("dim", footerText), dialogWidth, this.theme));
    lines.push(splitFooter(leftWidth, rightWidth, this.theme));

    return lines;
  }

  private syncRows(): void {
    this.rows = this.buildRows();
    if (this.rows.length === 0) {
      this.cursor = 0;
      this.scrollOffset = 0;
      return;
    }
    this.cursor = Math.max(0, Math.min(this.cursor, this.rows.length - 1));
    this.ensureScrollVisible();
  }

  private buildRows(): BrowserRow[] {
    const query = this.searchQuery.trim();
    const rows: BrowserRow[] = [];

    for (const group of this.groups) {
      const filtered = fuzzyFilter(
        group.tools.map((tool) => ({ tool, source: group.source, score: 0 })),
        query,
      );
      if (query && filtered.length === 0) continue;

      const groupTools = query ? filtered.map((item) => item.tool) : group.tools;
      const expanded = query.length > 0 || this.expandedSources.has(group.source);
      rows.push({ kind: "group", source: group.source, tools: groupTools, expanded });
      if (expanded) {
        for (const tool of groupTools) rows.push({ kind: "tool", source: group.source, tool });
      }
    }

    return rows;
  }

  private moveCursor(delta: number): void {
    this.syncRows();
    if (this.rows.length === 0) return;
    this.cursor = Math.max(0, Math.min(this.cursor + delta, this.rows.length - 1));
    this.detailScroll = 0;
    this.ensureScrollVisible();
    this.tui.requestRender();
  }

  private ensureScrollVisible(): void {
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    } else if (this.cursor >= this.scrollOffset + this.viewportHeight) {
      this.scrollOffset = this.cursor - this.viewportHeight + 1;
    }
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, Math.max(0, this.rows.length - this.viewportHeight)));
  }

  private toggleOrClose(): void {
    this.syncRows();
    const current = this.rows[this.cursor];
    if (!current) return;

    if (current.kind === "group") {
      if (this.expandedSources.has(current.source)) this.expandedSources.delete(current.source);
      else this.expandedSources.add(current.source);
      this.detailScroll = 0;
      this.syncRows();
      this.tui.requestRender();
    }
  }

  private collapseCurrentGroup(): void {
    this.syncRows();
    const current = this.rows[this.cursor];
    if (!current) return;

    const source = current.source;
    this.expandedSources.delete(source);
    this.detailScroll = 0;
    this.syncRows();
    const groupIndex = this.rows.findIndex((row) => row.kind === "group" && row.source === source);
    if (groupIndex >= 0) this.cursor = groupIndex;
    this.ensureScrollVisible();
    this.tui.requestRender();
  }

  private renderSplitRow(left: string, right: string, leftWidth: number, rightWidth: number, dialogWidth: number): string {
    return row(
      padAnsi(left, leftWidth) + this.theme.fg("border", "│") + padAnsi(right, rightWidth),
      dialogWidth,
      this.theme,
    );
  }

  private renderLeftRow(item: BrowserRow, selected: boolean, width: number): string {
    if (item.kind === "group") {
      const marker = item.expanded ? "▾" : "▸";
      const label = `${marker} ${item.source} (${item.tools.length})`;
      return selectedText(label, selected, this.theme);
    }

    const params = countParams(item.tool.parameters);
    const labelWidth = Math.max(8, width - 9);
    const name = truncateToWidth(item.tool.name, labelWidth);
    const label = `  ${name}${" ".repeat(Math.max(1, labelWidth - visibleWidth(name)))} ${this.theme.fg("dim", `${params}p`)}`;
    return selectedText(label, selected, this.theme);
  }

  private detailLines(width: number): string[] {
    this.syncRows();
    const current = this.rows[this.cursor];
    if (!current) return [this.theme.fg("warning", "No tools found")];

    if (current.kind === "group") {
      return this.groupDetailLines(current, width);
    }

    return this.toolDetailLines(current.tool, current.source, width);
  }

  private groupDetailLines(group: Extract<BrowserRow, { kind: "group" }>, width: number): string[] {
    const lines: string[] = [];
    lines.push(this.theme.fg("accent", this.theme.bold(group.source)));
    lines.push(`${this.theme.fg("accent", "Tools")}${this.theme.fg("dim", ": ")}${this.theme.fg("success", String(group.tools.length))}${this.theme.fg("dim", ` · ${group.expanded ? "expanded" : "collapsed"}`)}`);
    lines.push("");
    lines.push(...wrapText("Enter or → toggles this group. Select a tool on the left to inspect its full description and parameters here.", width));
    lines.push("");
    lines.push(this.theme.fg("dim", "Tools in this source:"));

    for (const tool of group.tools.slice(0, Math.max(4, this.viewportHeight - 7))) {
      const params = countParams(tool.parameters);
      lines.push(`${this.theme.fg("accent", "• " + tool.name)}${params ? this.theme.fg("dim", ` · ${params} params`) : ""}`);
    }

    if (group.tools.length > Math.max(4, this.viewportHeight - 7)) {
      lines.push(this.theme.fg("dim", `… ${group.tools.length - Math.max(4, this.viewportHeight - 7)} more`));
    }

    return lines;
  }

  private toolDetailLines(tool: ToolInfo, source: string, width: number): string[] {
    const lines: string[] = [];
    for (const line of wrapText(tool.name, width)) {
      lines.push(this.theme.fg("accent", this.theme.bold(line)));
    }
    for (const line of wrapText(`Source: ${source}`, width)) {
      lines.push(line.startsWith("Source:")
        ? `${this.theme.fg("accent", "Source")}${this.theme.fg("dim", ": ")}${this.theme.fg(source === "builtin" ? "success" : "text", line.slice("Source: ".length))}`
        : `  ${this.theme.fg("text", line)}`);
    }
    lines.push(`${this.theme.fg("accent", "Parameters")}${this.theme.fg("dim", ": ")}${this.theme.fg("success", String(countParams(tool.parameters)))}`);
    lines.push("");
    lines.push(this.theme.fg("accent", this.theme.bold("Description")));
    lines.push(...wrapText(tool.description || "No description", width).map((line) => this.theme.fg("text", line)));
    lines.push("");
    lines.push(this.theme.fg("accent", this.theme.bold("Parameters")));
    lines.push(...this.parameterLines(tool.parameters, width));
    return lines;
  }

  private parameterLines(params: unknown, width: number): string[] {
    const properties = getSchemaProperties(params);
    if (!properties || Object.keys(properties).length === 0) {
      return ["No parameters"];
    }

    const required = getRequiredParams(params);
    const lines: string[] = [];
    for (const [name, schema] of Object.entries(properties)) {
      const optional = required.has(name) ? "" : "?";
      const description = schemaDescription(schema);
      const type = describeSchema(schema);
      const requirement = required.has(name) ? "required" : "optional";
      const header = `${name}${optional}: ${type} ${requirement}`;
      const wrappedHeader = wrapText(header, Math.max(8, width - 2));
      for (let i = 0; i < wrappedHeader.length; i++) {
        const prefix = i === 0 ? "• " : "  ";
        lines.push(`${this.theme.fg("accent", prefix)}${this.theme.fg("text", wrappedHeader[i])}`);
      }
      if (description) {
        for (const line of wrapText(description, Math.max(8, width - 4))) {
          lines.push(`  ${this.theme.fg("text", line)}`);
        }
      }
    }
    return lines;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("tool-inspect", {
    description: "Inspect registered tools by source with fuzzy search",
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

      await ctx.ui.custom<void>(
        (tui: TUI, theme: ExtensionContext["ui"]["theme"], _keybindings: KeybindingsManager, done: () => void) => {
          return new ToolListComponent(tui, theme, allTools, done);
        },
        { overlay: true },
      );
    },
  });
}
