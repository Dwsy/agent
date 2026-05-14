/**
 * pi-tui-kit 简化版完整演示
 * 纯文本版本，确保宽度计算正确
 */
import type { Component, Focusable, TUI } from "@earendil-works/pi-tui";
import { matchesKey } from "@earendil-works/pi-tui";

// 边框字符
const B = {
  tl: "╭", tr: "╮", bl: "╰", br: "╯",
  h: "─", v: "│",
};

// 菜单项
const MENU = [
  { id: "overview", icon: "📋", label: "Overview" },
  { id: "box", icon: "📦", label: "Box & Text" },
  { id: "button", icon: "🔘", label: "Button" },
  { id: "panel", icon: "🖼️", label: "Panel" },
  { id: "tabs", icon: "📑", label: "Tabs" },
  { id: "progress", icon: "📊", label: "ProgressBar" },
  { id: "table", icon: "📋", label: "Table" },
  { id: "dialog", icon: "💬", label: "Dialog" },
  { id: "tree", icon: "🌳", label: "Tree" },
  { id: "input", icon: "⌨️", label: "Input" },
  { id: "toast", icon: "🍞", label: "Toast" },
];

export class SimpleDemo implements Component, Focusable {
  private tui: TUI;
  private done: () => void;
  private selectedIndex = 0;
  private activeSection = "overview";
  private progressValue = 45;

  private _focused = true;
  get focused() { return this._focused; }
  set focused(v) { this._focused = v; }

  constructor(tui: TUI, done: () => void) {
    this.tui = tui;
    this.done = done;
  }

  handleInput(data: string): void {
    if (data === "q" || data === "\x1b" || matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.done();
      return;
    }

    // ↑ 上
    if (data === "\x1b[A" || matchesKey(data, "up")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.tui.requestRender();
      return;
    }

    // ↓ 下
    if (data === "\x1b[B" || matchesKey(data, "down")) {
      this.selectedIndex = Math.min(MENU.length - 1, this.selectedIndex + 1);
      this.tui.requestRender();
      return;
    }

    // Enter 选择
    if (data === "\r" || data === "\n" || matchesKey(data, "return")) {
      this.activeSection = MENU[this.selectedIndex].id;
      this.tui.requestRender();
      return;
    }

    // 左右调节进度条
    if (this.activeSection === "progress") {
      if (data === "\x1b[D" || matchesKey(data, "left")) {
        this.progressValue = Math.max(0, this.progressValue - 5);
        this.tui.requestRender();
        return;
      }
      if (data === "\x1b[C" || matchesKey(data, "right")) {
        this.progressValue = Math.min(100, this.progressValue + 5);
        this.tui.requestRender();
        return;
      }
    }
  }

  private renderHeader(width: number): string {
    const title = " pi-tui-kit ";
    const pad = Math.max(0, width - title.length - 2);
    const leftPad = Math.floor(pad / 2);
    const rightPad = pad - leftPad;
    return B.tl + B.h.repeat(leftPad) + title + B.h.repeat(rightPad) + B.tr;
  }

  private renderFooter(width: number): string {
    const nav = "  ↑/↓ Navigate  ";
    const select = "  Enter Select  ";
    const quit = "  q Quit  ";
    const content = nav + select + quit;
    const pad = Math.max(0, width - content.length - 2);
    const leftPad = Math.floor(pad / 2);
    const rightPad = pad - leftPad;
    return B.bl + B.h.repeat(leftPad) + content + B.h.repeat(rightPad) + B.br;
  }

  private renderSidebar(width: number, height: number): string[] {
    const lines: string[] = [];
    
    // 标题
    lines.push(" Menu ".padEnd(width).slice(0, width));
    lines.push(B.h.repeat(width));

    // 菜单项
    for (let i = 0; i < MENU.length && lines.length < height - 1; i++) {
      const item = MENU[i];
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? "> " : "  ";
      const line = prefix + item.icon + " " + item.label;
      lines.push(line.padEnd(width).slice(0, width));
    }

    // 填充剩余空间
    while (lines.length < height) {
      lines.push(" ".repeat(width));
    }

    return lines.slice(0, height);
  }

  private renderContent(width: number, height: number): string[] {
    const lines: string[] = [];
    const title = " " + this.activeSection.toUpperCase() + " ";
    
    // 上边框带标题
    const innerWidth = width - 2;
    const titlePad = Math.floor((innerWidth - title.length) / 2);
    const leftPad = Math.max(0, titlePad);
    const rightPad = Math.max(0, innerWidth - title.length - leftPad);
    
    lines.push(B.tl + B.h.repeat(leftPad) + title + B.h.repeat(rightPad) + B.tr);

    // 内容
    const contentLines = this.getContent();
    for (const line of contentLines) {
      if (lines.length >= height - 1) break;
      const contentLine = line.slice(0, innerWidth);
      lines.push(B.v + contentLine.padEnd(innerWidth) + B.v);
    }

    // 填充
    while (lines.length < height - 1) {
      lines.push(B.v + " ".repeat(innerWidth) + B.v);
    }

    // 下边框
    lines.push(B.bl + B.h.repeat(innerWidth) + B.br);

    return lines.slice(0, height);
  }

  private getContent(): string[] {
    switch (this.activeSection) {
      case "overview":
        return [
          "",
          "  Welcome to pi-tui-kit!",
          "",
          "  A high-level TUI component library for Pi",
          "",
          "  Key Features:",
          "    * 20+ production-ready components",
          "    * ANSI-safe width calculations",
          "    * Full keyboard navigation",
          "    * Powerline-style status bars",
          "    * Rich widgets (Tree, Table, Dialog)",
          "",
          "  Use up/down to navigate the menu",
        ];

      case "box":
        return [
          "",
          "  Box Component Demo",
          "",
          "  Box provides:",
          "    * Padding control",
          "    * Border rendering",
          "    * Content nesting",
        ];

      case "button":
        return [
          "",
          "  Button Component Demo",
          "",
          "  Interactive button with:",
          "    * Focus state",
          "    * Click handling",
          "    * Customizable width",
          "",
          "  [ < Click Me > ]",
        ];

      case "panel":
        return [
          "",
          "  Panel Component Demo",
          "",
          "  Panel features:",
          "    * Bordered container",
          "    * Title support",
          "    * Child components",
          "    * Theming",
        ];

      case "tabs":
        return [
          "",
          "  Tabs Component Demo",
          "",
          "  > Tab 1 | Tab 2 | Tab 3",
          "  ----------------------",
          "",
          "  Tab content appears here",
        ];

      case "progress":
        const filled = Math.floor(this.progressValue / 5);
        const bar = "█".repeat(filled) + "░".repeat(20 - filled);
        return [
          "",
          "  ProgressBar Component Demo",
          "",
          "  Styles: bar, blocks, dots, spinner",
          "",
          `  [${bar}] ${this.progressValue}%`,
          "",
          "  Use left/right to adjust value",
        ];

      case "table":
        return [
          "",
          "  Table Component Demo",
          "",
          "  ┌────────┬────────┬───────┐",
          "  │ Name   │ Type   │ Size  │",
          "  ├────────┼────────┼───────┤",
          "  │ index  │ .ts    │ 2.4KB │",
          "  │ utils  │ .ts    │ 1.8KB │",
          "  │ README │ .md    │ 4.2KB │",
          "  └────────┴────────┴───────┘",
        ];

      case "dialog":
        return [
          "",
          "  Dialog Component Demo",
          "",
          "  Modal dialog with:",
          "    * Title and content",
          "    * Action buttons",
          "    * Keyboard focus",
          "",
          "  +------------------+",
          "  │ Confirm Action?  │",
          "  │                  │",
          "  │ [ Cancel ][ OK ]│",
          "  +------------------+",
        ];

      case "tree":
        return [
          "",
          "  Tree Component Demo",
          "",
          "  📂 src",
          "  ├── 📄 index.ts",
          "  ├── 📄 utils.ts",
          "  └── 📁 components",
          "      ├── 📄 Button.ts",
          "      └── 📄 Panel.ts",
        ];

      case "input":
        return [
          "",
          "  Input Component Demo",
          "",
          "  Single-line text input:",
          "",
          `  > Hello World_`,
          "",
          "  Features:",
          "    * Cursor positioning",
          "    * Placeholder text",
          "    * Validation",
        ];

      case "toast":
        return [
          "",
          "  Toast Component Demo",
          "",
          "  Lightweight notifications:",
          "",
          "  +------------------+",
          "  │ ✓ Success!       │",
          "  +------------------+",
          "",
          "  Types: info, success, warning, error",
        ];

      default:
        return ["", "  Select a component to view demo"];
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    
    // 头部 - 不添加额外的空行
    lines.push(this.renderHeader(width));

    // 主体布局：左边栏 + 分隔符 + 右边内容
    const separatorWidth = 1; // 分隔符 "│" 的宽度
    const sidebarWidth = Math.floor((width - separatorWidth) * 0.25);
    const contentWidth = width - sidebarWidth - separatorWidth;
    const mainHeight = 20;

    const sidebarLines = this.renderSidebar(sidebarWidth, mainHeight);
    const contentLines = this.renderContent(contentWidth, mainHeight);

    // 合并边栏和内容
    for (let i = 0; i < mainHeight; i++) {
      const left = (sidebarLines[i] || "").slice(0, sidebarWidth).padEnd(sidebarWidth);
      const right = (contentLines[i] || "").slice(0, contentWidth).padEnd(contentWidth);
      lines.push(left + "│" + right);
    }

    // 底部
    lines.push(this.renderFooter(width));

    // 确保每行都精确到指定宽度
    return lines.map(l => l.slice(0, width).padEnd(width));
  }

  invalidate(): void {}
}
