/**
 * pi-tui-kit 演示组件（纯组件，不依赖扩展API）
 * 可以在任何扩展中使用
 */
import type { Component, Focusable, TUI, Key } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import {
  Box, Text, Spacer, Flex, Stack, Segment, Powerline,
  Panel, Button, List, Input, Dialog, Tabs, Tree, Table,
  ProgressBar, StepProgress, Modal, Toast,
  useState, useSelect, useFocus,
  DefaultTheme, Borders,
  type ListItem, type TreeNode, type DialogAction, type TabItem,
} from "../src/index.js";

interface DemoState {
  activeSection: string;
  progressValue: number;
  inputValue: string;
  selectedTab: string;
  showDialog: boolean;
  showModal: boolean;
}

/**
 * 演示组件 - 展示所有 pi-tui-kit 功能
 * 用法：
 * 
 * await ctx.ui.custom((tui, theme, kb, done) => {
 *   return new DemoShowcase(tui, () => done(undefined));
 * }, { overlay: true, width: 100 });
 */
export class DemoShowcase implements Component, Focusable {
  private state: DemoState;
  private tui: TUI;
  private theme = DefaultTheme;
  private done: () => void;

  private header: Powerline;
  private sidebar: List;
  private contentPanel: Panel;
  private footer: Powerline;
  private toast?: Toast;

  private _focused = true;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  constructor(tui: TUI, done: () => void) {
    this.tui = tui;
    this.done = done;
    this.state = {
      activeSection: "overview",
      progressValue: 45,
      inputValue: "Hello pi-tui-kit!",
      selectedTab: "general",
      showDialog: false,
      showModal: false,
    };

    this.initComponents();
  }

  private initComponents(): void {
    // Header
    this.header = new Powerline({
      segments: [
        new Segment({
          content: " pi-tui-kit ",
          icon: "📦",
          bgColor: this.theme.accent,
          separator: "",
        }),
        new Segment({ content: " Demo ", separator: "│" }),
      ],
      align: "left",
      fillColor: this.theme.dim,
    });

    // Sidebar
    const items: ListItem[] = [
      { id: "overview", label: "📋 Overview" },
      { id: "core", label: "🔧 Core" },
      { id: "widgets", label: "🎨 Widgets" },
      { id: "navigation", label: "🧭 Navigation" },
      { id: "data", label: "📊 Data" },
      { id: "feedback", label: "💬 Feedback" },
      { id: "interactive", label: "⌨️ Interactive" },
    ];

    this.sidebar = new List({
      items,
      maxVisible: 10,
      selectedPrefix: "▶ ",
      onSelect: (item) => {
        this.state.activeSection = item.id;
        this.updateContent();
        this.tui.requestRender();
      },
    });

    // Content panel
    this.contentPanel = new Panel({
      title: " Components ",
      border: Borders.rounded,
      padding: 1,
    });

    // Footer
    this.footer = new Powerline({
      segments: [
        new Segment({ content: " ↑/↓ Navigate ", separator: "│" }),
        new Segment({ content: " Enter Select ", separator: "│" }),
        new Segment({ content: " q Quit ", separator: "" }),
      ],
      align: "center",
    });

    this.updateContent();
  }

  private updateContent(): void {
    this.contentPanel.clear();

    switch (this.state.activeSection) {
      case "overview":
        this.contentPanel.addChild(this.createOverview());
        break;
      case "core":
        this.contentPanel.addChild(this.createCoreDemo());
        break;
      case "widgets":
        this.contentPanel.addChild(this.createWidgetsDemo());
        break;
      case "navigation":
        this.contentPanel.addChild(this.createNavigationDemo());
        break;
      case "data":
        this.contentPanel.addChild(this.createDataDemo());
        break;
      case "feedback":
        this.contentPanel.addChild(this.createFeedbackDemo());
        break;
      case "interactive":
        this.contentPanel.addChild(this.createInteractiveDemo());
        break;
    }
  }

  private createOverview(): Component {
    const box = new Box({ padding: 1 });
    box.addChild(new Text({
      content: "🎉 Welcome to pi-tui-kit\n\n" +
        "20+ ANSI-safe TUI components for Pi\n\n" +
        "✨ Features:\n" +
        "  • Zero width-overflow crashes\n" +
        "  • Full keyboard navigation\n" +
        "  • Powerline-style status bars\n" +
        "  • Rich widgets (Tree, Table, Dialog)\n" +
        "  • Flexible theming",
      align: "left",
    }));
    return box;
  }

  private createCoreDemo(): Component {
    const box = new Box({ padding: 1 });
    box.addChild(new Text({ content: "🔧 Core Components Demo", color: this.theme.accent }));
    box.addChild(new Spacer({ fixed: 1 }));
    box.addChild(new Text({ content: "Box - Container with padding/borders" }));
    box.addChild(new Text({ content: "Text - Aligned/colored text content" }));
    box.addChild(new Text({ content: "Flex - Row/Column layouts" }));
    box.addChild(new Text({ content: "Stack - Z-index layering" }));
    return box;
  }

  private createWidgetsDemo(): Component {
    const box = new Box({ padding: 1 });
    box.addChild(new Text({ content: "🎨 Widgets Demo", color: this.theme.accent }));
    box.addChild(new Spacer({ fixed: 1 }));
    
    const btn = new Button({
      label: "Click Me",
      width: 12,
      onClick: () => this.showToast("Button clicked!", "success"),
    });
    box.addChild(btn);
    
    return box;
  }

  private createNavigationDemo(): Component {
    const box = new Box({ padding: 1 });
    box.addChild(new Text({ content: "🧭 Navigation Demo", color: this.theme.accent }));
    box.addChild(new Spacer({ fixed: 1 }));

    const tabs = new Tabs({
      tabs: [
        { id: "tab1", label: "Tab 1" },
        { id: "tab2", label: "Tab 2" },
        { id: "tab3", label: "Tab 3" },
      ],
      activeTab: this.state.selectedTab,
      variant: "underline",
    });
    box.addChild(tabs);

    return box;
  }

  private createDataDemo(): Component {
    const box = new Box({ padding: 1 });
    box.addChild(new Text({ content: "📊 Data Display Demo", color: this.theme.accent }));
    box.addChild(new Spacer({ fixed: 1 }));

    const progress = new ProgressBar({
      value: this.state.progressValue,
      max: 100,
      label: "Progress",
      style: "bar",
    });
    box.addChild(progress);

    return box;
  }

  private createFeedbackDemo(): Component {
    const box = new Box({ padding: 1 });
    box.addChild(new Text({ content: "💬 Feedback Demo", color: this.theme.accent }));
    box.addChild(new Spacer({ fixed: 1 }));

    const flex = new Flex({ direction: "row", gap: 1 });
    
    flex.addChild(new Button({
      label: "Info",
      width: 10,
      onClick: () => this.showToast("Info message", "info"),
    }));
    
    flex.addChild(new Button({
      label: "Success",
      width: 10,
      onClick: () => this.showToast("Success!", "success"),
    }));
    
    flex.addChild(new Button({
      label: "Error",
      width: 10,
      onClick: () => this.showToast("Error occurred", "error"),
    }));

    box.addChild(flex);
    return box;
  }

  private createInteractiveDemo(): Component {
    const box = new Box({ padding: 1 });
    box.addChild(new Text({ content: "⌨️ Interactive Demo", color: this.theme.accent }));
    box.addChild(new Spacer({ fixed: 1 }));
    box.addChild(new Text({ content: "Use keyboard to navigate:\n" +
      "  ↑/↓ - Navigate list\n" +
      "  Enter - Select\n" +
      "  q - Quit" }));
    return box;
  }

  private showToast(message: string, type: "info" | "success" | "warning" | "error"): void {
    this.toast = new Toast({ message, type, duration: 2000 });
    setTimeout(() => { this.toast = undefined; this.tui.requestRender(); }, 2000);
    this.tui.requestRender();
  }

  // Track current focus: "sidebar" | "content"
  private focusArea: "sidebar" | "content" = "sidebar";

  handleInput(data: string): void {
    // Debug: show what key was pressed
    // this.showToast(`Key: ${JSON.stringify(data)}`, "info");

    // Global quit - support multiple escape variants
    if (data === "q" || data === "\x1b" || data === "\x1b\x1b" || 
        matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.done();
      return;
    }

    // Tab to switch focus area
    if (data === "\t" || matchesKey(data, "tab")) {
      this.focusArea = this.focusArea === "sidebar" ? "content" : "sidebar";
      this.tui.requestRender();
      return;
    }

    // Navigation in sidebar - direct arrow key handling
    if (this.focusArea === "sidebar") {
      if (data === "\x1b[A" || matchesKey(data, "up")) {
        // Up arrow
        this.sidebar.handleInput("up");
        return;
      }
      if (data === "\x1b[B" || matchesKey(data, "down")) {
        // Down arrow
        this.sidebar.handleInput("down");
        return;
      }
      if (data === "\r" || data === "\n" || matchesKey(data, "return")) {
        // Enter
        this.sidebar.handleInput("\r");
        return;
      }
      // Try passing raw data to sidebar
      this.sidebar.handleInput(data);
      return;
    }

    // Data section: left/right to adjust progress
    if (this.focusArea === "content" && this.state.activeSection === "data") {
      if (data === "\x1b[D" || matchesKey(data, "left")) {
        this.state.progressValue = Math.max(0, this.state.progressValue - 5);
        this.updateContent();
        this.tui.requestRender();
        return;
      }
      if (data === "\x1b[C" || matchesKey(data, "right")) {
        this.state.progressValue = Math.min(100, this.state.progressValue + 5);
        this.updateContent();
        this.tui.requestRender();
        return;
      }
    }

    // Content area buttons
    if (this.focusArea === "content") {
      if (data === "\r" || data === " ") {
        if (this.state.activeSection === "feedback" || this.state.activeSection === "widgets") {
          this.showToast("Button activated!", "success");
          return;
        }
      }
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];

    // Header
    lines.push(...this.header.render(width));
    lines.push("".padEnd(width));

    // Main: sidebar + content
    const sidebarWidth = Math.floor(width * 0.25);
    const contentWidth = width - sidebarWidth - 1;

    const sidebarLines = this.sidebar.render(sidebarWidth);
    const contentLines = this.contentPanel.render(contentWidth);

    const mainHeight = Math.max(sidebarLines.length, contentLines.length, 15);

    for (let i = 0; i < mainHeight; i++) {
      const left = sidebarLines[i] || " ".repeat(sidebarWidth);
      const right = contentLines[i] || " ".repeat(contentWidth);
      lines.push(left + "│" + right);
    }

    // Footer
    lines.push("".padEnd(width));
    lines.push(...this.footer.render(width));

    // Toast overlay
    if (this.toast) {
      const toastLines = this.toast.render(50);
      const startRow = lines.length - toastLines.length - 2;
      const leftPad = width - 52;
      
      for (let i = 0; i < toastLines.length && startRow + i >= 0; i++) {
        lines[startRow + i] = " ".repeat(leftPad) + toastLines[i];
      }
    }

    return lines.map(l => l.slice(0, width).padEnd(width));
  }

  invalidate(): void {
    this.header.invalidate();
    this.sidebar.invalidate();
    this.contentPanel.invalidate();
    this.footer.invalidate();
    this.toast?.invalidate();
  }
}
