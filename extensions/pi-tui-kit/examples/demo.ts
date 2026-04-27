/**
 * pi-tui-kit 完整功能演示
 * 展示所有组件的用法和效果
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Component, Focusable, TUI, KeybindingsManager } from "@mariozechner/pi-tui";
import { matchesKey, CURSOR_MARKER } from "@mariozechner/pi-tui";
import {
  // Core
  Box, Text, Spacer, Flex, Stack, Segment, Powerline,
  // Widgets
  Panel, Button, List, Input, Dialog, Tabs, Tree, Table,
  ProgressBar, StepProgress, Modal, Toast,
  // Hooks
  useState, useSelect, useFocus,
  // Utils
  DefaultTheme, Borders,
  type ListItem, type TreeNode, type DialogAction, type TabItem,
} from "../src/index.js";

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

interface DemoState {
  activeSection: string;
  selectedComponent: string;
  showDialog: boolean;
  showModal: boolean;
  showToast: boolean;
  progressValue: number;
  inputValue: string;
  selectedListItem: string;
  expandedTreeNodes: Set<string>;
  selectedTab: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DEMO COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

class DemoComponent implements Component, Focusable {
  private state: DemoState;
  private tui: TUI;
  private theme = DefaultTheme;
  private done: () => void;

  // Components
  private header: Powerline;
  private sidebar: List;
  private contentPanel: Panel;
  private footer: Powerline;
  private toast?: Toast;

  // Demo instances
  private dialog?: Dialog;
  private modal?: Modal;
  private input?: Input;
  private tabs?: Tabs;
  private tree?: Tree;
  private table?: Table;
  private progressBar?: ProgressBar;
  private stepProgress?: StepProgress;

  private _focused = true;
  private focusManager: ReturnType<typeof useFocus>;

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
      selectedComponent: "overview",
      showDialog: false,
      showModal: false,
      showToast: false,
      progressValue: 45,
      inputValue: "Hello pi-tui-kit!",
      selectedListItem: "item1",
      expandedTreeNodes: new Set(["root"]),
      selectedTab: "general",
    };

    this.initComponents();
    this.focusManager = useFocus({
      items: [
        { id: "sidebar", component: this.sidebar },
        { id: "content", component: this.contentPanel },
      ],
      wrap: true,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMPONENT INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════════

  private initComponents(): void {
    // Header Powerline
    this.header = new Powerline({
      segments: [
        new Segment({
          content: " pi-tui-kit ",
          icon: "📦",
          bgColor: this.theme.accent,
          fgColor: this.theme.bold,
          separator: "",
        }),
        new Segment({
          content: " v1.0.0 ",
          separator: "│",
          separatorColor: this.theme.dim,
        }),
        new Segment({
          content: " Full Component Demo ",
          separator: "│",
          separatorColor: this.theme.dim,
        }),
      ],
      align: "left",
      fillColor: this.theme.dim,
    });

    // Sidebar List
    const sidebarItems: ListItem[] = [
      { id: "overview", label: "📋 Overview", description: "Introduction & features" },
      { id: "core", label: "🔧 Core Components", description: "Box, Text, Flex, Stack" },
      { id: "widgets", label: "🎨 Widgets", description: "Panel, Button, List, Input" },
      { id: "navigation", label: "🧭 Navigation", description: "Tabs, Tree, Dialog" },
      { id: "data", label: "📊 Data Display", description: "Table, Progress" },
      { id: "feedback", label: "💬 Feedback", description: "Toast, Modal" },
      { id: "interactive", label: "⌨️ Interactive", description: "Input, Focus Demo" },
    ];

    this.sidebar = new List({
      items: sidebarItems,
      maxVisible: 12,
      selectedPrefix: "▶ ",
      unselectedPrefix: "  ",
      selectedColor: this.theme.accent,
      mutedColor: this.theme.dim,
      onSelect: (item) => {
        this.state.selectedComponent = item.id;
        this.state.activeSection = item.id;
        this.updateContentPanel();
        this.tui.requestRender();
      },
    });

    // Content Panel
    this.contentPanel = new Panel({
      title: " Component Demo ",
      border: Borders.rounded,
      padding: 1,
      theme: this.theme,
    });

    // Footer
    this.footer = new Powerline({
      segments: [
        new Segment({
          content: " ↑/↓ Navigate ",
          separator: "│",
        }),
        new Segment({
          content: " Enter Select ",
          separator: "│",
        }),
        new Segment({
          content: " q Quit ",
          separator: "",
        }),
      ],
      align: "center",
      fillColor: this.theme.dim,
    });

    // Initialize content
    this.updateContentPanel();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONTENT GENERATION
  // ═══════════════════════════════════════════════════════════════════════════════

  private updateContentPanel(): void {
    this.contentPanel.clear();

    switch (this.state.activeSection) {
      case "overview":
        this.contentPanel.addChild(this.createOverviewContent());
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
        this.contentPanel.addChild(this.createDataDisplayDemo());
        break;
      case "feedback":
        this.contentPanel.addChild(this.createFeedbackDemo());
        break;
      case "interactive":
        this.contentPanel.addChild(this.createInteractiveDemo());
        break;
    }
  }

  private createOverviewContent(): Component {
    const container = new Box({ paddingY: 1 });

    const title = new Text({
      content: "🎉 Welcome to pi-tui-kit",
      align: "center",
      color: this.theme.accent,
    });

    const subtitle = new Text({
      content: "A high-level TUI component library for Pi",
      align: "center",
      color: this.theme.dim,
    });

    const spacer = new Spacer({ fixed: 1 });

    const features = new Text({
      content: "✨ Features:\n" +
        "  • 20+ production-ready components\n" +
        "  • ANSI-safe width calculations (no crashes!)\n" +
        "  • Full keyboard navigation support\n" +
        "  • Powerline-style status bars\n" +
        "  • Flexible theming system\n" +
        "  • TypeScript-first design",
      align: "left",
    });

    const spacer2 = new Spacer({ fixed: 1 });

    const usage = new Text({
      content: "🚀 Quick Start:\n" +
        "  import { Panel, List, Button } from \"pi-tui-kit\";\n\n" +
        "  const panel = new Panel({\n" +
        "    title: \"My App\",\n" +
        "    border: Borders.rounded\n" +
        "  });",
      align: "left",
      color: this.theme.dim,
    });

    container.addChild(title);
    container.addChild(subtitle);
    container.addChild(spacer);
    container.addChild(features);
    container.addChild(spacer2);
    container.addChild(usage);

    return container;
  }

  private createCoreDemo(): Component {
    const flex = new Flex({ direction: "column", gap: 1 });

    // Box demo
    const boxPanel = new Panel({
      title: "Box Component",
      border: Borders.single,
      padding: 1,
    });
    const boxContent = new Text({
      content: "Box provides padding and borders.\nUseful for grouping content.",
    });
    boxPanel.addChild(boxContent);

    // Text alignment demo
    const textPanel = new Panel({
      title: "Text Alignment",
      border: Borders.single,
      padding: 1,
    });
    const leftText = new Text({ content: "← Left aligned", align: "left" });
    const centerText = new Text({ content: "Center →", align: "center", color: this.theme.accent });
    const rightText = new Text({ content: "Right aligned →", align: "right" });
    textPanel.addChild(leftText);
    textPanel.addChild(centerText);
    textPanel.addChild(rightText);

    // Spacer demo
    const spacerPanel = new Panel({
      title: "Spacer",
      border: Borders.single,
      padding: 1,
    });
    spacerPanel.addChild(new Text({ content: "Above spacer" }));
    spacerPanel.addChild(new Spacer({ fixed: 2 }));
    spacerPanel.addChild(new Text({ content: "Below spacer (2 lines)" }));

    // Flex layout demo
    const flexPanel = new Panel({
      title: "Flex Layout",
      border: Borders.single,
      padding: 0,
    });
    // Flex demo content would go here
    const flexDemo = new Text({
      content: "Flex supports row/column directions\nwith gap, alignment, and distribution.",
    });
    flexPanel.addChild(flexDemo);

    flex.addChild(boxPanel);
    flex.addChild(textPanel);
    flex.addChild(spacerPanel);
    flex.addChild(flexPanel);

    return flex;
  }

  private createWidgetsDemo(): Component {
    const container = new Box({ paddingY: 1 });

    // Button demo
    const buttonTitle = new Text({
      content: "🔘 Button Component",
      color: this.theme.accent,
    });

    const button = new Button({
      label: "Click Me!",
      width: 15,
      onClick: () => this.showToastNotification("Button clicked! 🎉"),
      accentColor: this.theme.success,
    });
    button.focused = true;

    const spacer = new Spacer({ fixed: 1 });

    // Input demo
    const inputTitle = new Text({
      content: "⌨️ Input Component",
      color: this.theme.accent,
    });

    const inputBox = new Panel({
      border: Borders.single,
      padding: 1,
    });
    const input = new Input({
      initialValue: this.state.inputValue,
      placeholder: "Type something...",
      onChange: (value) => {
        this.state.inputValue = value;
      },
    });
    inputBox.addChild(new Text({ content: "Current value:" }));
    inputBox.addChild(input);

    container.addChild(buttonTitle);
    container.addChild(button);
    container.addChild(spacer);
    container.addChild(inputTitle);
    container.addChild(inputBox);

    return container;
  }

  private createNavigationDemo(): Component {
    const container = new Box({ paddingY: 1 });

    // Tabs demo
    const tabsTitle = new Text({
      content: "📑 Tabs Component",
      color: this.theme.accent,
    });

    const tabs: TabItem[] = [
      { id: "general", label: "General" },
      { id: "editor", label: "Editor" },
      { id: "terminal", label: "Terminal" },
      { id: "extensions", label: "Extensions" },
    ];

    const tabsComponent = new Tabs({
      tabs,
      activeTab: this.state.selectedTab,
      variant: "underline",
      onChange: (tabId) => {
        this.state.selectedTab = tabId;
        this.tui.requestRender();
      },
    });

    const tabsContent = new Panel({
      title: `Tab: ${this.state.selectedTab}`,
      border: Borders.rounded,
      padding: 1,
    });
    tabsContent.addChild(new Text({
      content: `This is the content for the "${this.state.selectedTab}" tab.\nTabs support multiple variants: border, underline, pills.`,
    }));

    const spacer = new Spacer({ fixed: 1 });

    // Tree demo
    const treeTitle = new Text({
      content: "🌳 Tree Component",
      color: this.theme.accent,
    });

    const treeNodes: TreeNode[] = [
      {
        id: "root",
        label: "project",
        icon: "📂",
        expanded: true,
        children: [
          {
            id: "src",
            label: "src",
            icon: "📁",
            expanded: false,
            children: [
              { id: "src/index.ts", label: "index.ts", icon: "📄" },
              { id: "src/utils.ts", label: "utils.ts", icon: "📄" },
            ],
          },
          { id: "package.json", label: "package.json", icon: "📦" },
          { id: "README.md", label: "README.md", icon: "📄" },
        ],
      },
    ];

    const tree = new Tree({
      roots: treeNodes,
      maxVisible: 6,
      showLines: true,
      onSelect: (node) => this.showToastNotification(`Selected: ${node.label}`),
      onToggle: (node) => {
        if (this.state.expandedTreeNodes.has(node.id)) {
          this.state.expandedTreeNodes.delete(node.id);
        } else {
          this.state.expandedTreeNodes.add(node.id);
        }
      },
    });

    const treePanel = new Panel({
      title: "File Browser",
      border: Borders.single,
      padding: 1,
    });
    treePanel.addChild(tree);

    container.addChild(tabsTitle);
    container.addChild(tabsComponent);
    container.addChild(tabsContent);
    container.addChild(spacer);
    container.addChild(treeTitle);
    container.addChild(treePanel);

    return container;
  }

  private createDataDisplayDemo(): Component {
    const container = new Box({ paddingY: 1 });

    // Progress bar demo
    const progressTitle = new Text({
      content: "📊 Progress Components",
      color: this.theme.accent,
    });

    const barStyle = new ProgressBar({
      value: this.state.progressValue,
      max: 100,
      label: "Bar Style",
      style: "bar",
      showValue: true,
    });

    const blocksStyle = new ProgressBar({
      value: this.state.progressValue,
      max: 100,
      label: "Blocks",
      style: "blocks",
      showValue: true,
    });

    const dotsStyle = new ProgressBar({
      value: this.state.progressValue,
      max: 100,
      label: "Dots",
      style: "dots",
      showValue: true,
    });

    const spacer = new Spacer({ fixed: 1 });

    // Step progress
    const stepTitle = new Text({
      content: "🎯 Step Progress",
      color: this.theme.accent,
    });

    const steps = new StepProgress({
      steps: ["Plan", "Code", "Test", "Deploy"],
      currentStep: 2,
      completed: [true, true, false, false],
    });

    const spacer2 = new Spacer({ fixed: 1 });

    // Table demo
    const tableTitle = new Text({
      content: "📋 Table Component",
      color: this.theme.accent,
    });

    const table = new Table({
      columns: [
        { key: "name", header: "Name", width: 15, align: "left" },
        { key: "type", header: "Type", width: 12, align: "center" },
        { key: "size", header: "Size", width: 10, align: "right" },
        { key: "status", header: "Status", width: "fill", align: "center" },
      ],
      data: [
        { name: "index.ts", type: "TypeScript", size: "2.4KB", status: "✓" },
        { name: "utils.ts", type: "TypeScript", size: "1.8KB", status: "✓" },
        { name: "README.md", type: "Markdown", size: "4.2KB", status: "✓" },
        { name: "package.json", type: "JSON", size: "0.8KB", status: "✓" },
      ],
      showBorders: true,
      showHeader: true,
    });

    container.addChild(progressTitle);
    container.addChild(barStyle);
    container.addChild(blocksStyle);
    container.addChild(dotsStyle);
    container.addChild(spacer);
    container.addChild(stepTitle);
    container.addChild(steps);
    container.addChild(spacer2);
    container.addChild(tableTitle);
    container.addChild(table);

    return container;
  }

  private createFeedbackDemo(): Component {
    const container = new Box({ paddingY: 1 });

    // Toast demo
    const toastTitle = new Text({
      content: "🍞 Toast Notifications",
      color: this.theme.accent,
    });

    const toastButtons = new Flex({ direction: "row", gap: 2 });

    const infoToast = new Button({
      label: "Info Toast",
      width: 14,
      onClick: () => this.showToastNotification("Information message", "info"),
      accentColor: this.theme.accent,
    });

    const successToast = new Button({
      label: "Success Toast",
      width: 14,
      onClick: () => this.showToastNotification("Operation successful!", "success"),
      accentColor: this.theme.success,
    });

    const warningToast = new Button({
      label: "Warning Toast",
      width: 14,
      onClick: () => this.showToastNotification("Warning: Check settings", "warning"),
      accentColor: this.theme.warning,
    });

    const errorToast = new Button({
      label: "Error Toast",
      width: 14,
      onClick: () => this.showToastNotification("Something went wrong!", "error"),
      accentColor: this.theme.error,
    });

    toastButtons.addChild(infoToast);
    toastButtons.addChild(successToast);
    toastButtons.addChild(warningToast);
    toastButtons.addChild(errorToast);

    const spacer = new Spacer({ fixed: 1 });

    // Dialog demo
    const dialogTitle = new Text({
      content: "💬 Dialog Component",
      color: this.theme.accent,
    });

    const dialogButton = new Button({
      label: "Show Dialog",
      width: 15,
      onClick: () => {
        this.state.showDialog = true;
        this.tui.requestRender();
      },
    });

    const spacer2 = new Spacer({ fixed: 1 });

    // Modal demo
    const modalTitle = new Text({
      content: "🪟 Modal Component",
      color: this.theme.accent,
    });

    const modalButton = new Button({
      label: "Show Modal",
      width: 15,
      onClick: () => {
        this.state.showModal = true;
        this.tui.requestRender();
      },
    });

    container.addChild(toastTitle);
    container.addChild(toastButtons);
    container.addChild(spacer);
    container.addChild(dialogTitle);
    container.addChild(dialogButton);
    container.addChild(spacer2);
    container.addChild(modalTitle);
    container.addChild(modalButton);

    return container;
  }

  private createInteractiveDemo(): Component {
    const container = new Box({ paddingY: 1 });

    const title = new Text({
      content: "⌨️ Interactive Demo",
      align: "center",
      color: this.theme.accent,
    });

    const spacer = new Spacer({ fixed: 1 });

    const instructions = new Text({
      content: "Use these keys to interact with the demo:\n\n" +
        "  ↑ / ↓     Navigate sidebar\n" +
        "  Enter     Select item\n" +
        "  Tab       Switch focus area\n" +
        "  q / Esc   Exit demo\n\n" +
        "All components support full keyboard navigation!",
    });

    const spacer2 = new Spacer({ fixed: 1 });

    const status = new Text({
      content: `Current section: ${this.state.activeSection}\n` +
        `Selected list item: ${this.state.selectedListItem}\n` +
        `Input value: ${this.state.inputValue}`,
      color: this.theme.dim,
    });

    container.addChild(title);
    container.addChild(spacer);
    container.addChild(instructions);
    container.addChild(spacer2);
    container.addChild(status);

    return container;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TOAST NOTIFICATION
  // ═══════════════════════════════════════════════════════════════════════════════

  private showToastNotification(message: string, type: "info" | "success" | "warning" | "error" = "info"): void {
    this.toast = new Toast({
      message,
      type,
      duration: 3000,
      theme: this.theme,
    });

    setTimeout(() => {
      this.toast = undefined;
      this.tui.requestRender();
    }, 3000);

    this.tui.requestRender();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DIALOG OVERLAY
  // ═══════════════════════════════════════════════════════════════════════════════

  private createDialog(): Component | undefined {
    if (!this.state.showDialog) return undefined;

    const actions: DialogAction[] = [
      {
        id: "cancel",
        label: "Cancel",
        onClick: () => {
          this.state.showDialog = false;
          this.tui.requestRender();
        },
      },
      {
        id: "confirm",
        label: "Confirm",
        primary: true,
        onClick: () => {
          this.state.showDialog = false;
          this.showToastNotification("Confirmed!", "success");
          this.tui.requestRender();
        },
      },
    ];

    return new Dialog({
      title: "Confirm Action",
      content: "This is a dialog example.\nDialogs can contain any content and actions.",
      actions,
      width: 50,
      theme: this.theme,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // MODAL OVERLAY
  // ═══════════════════════════════════════════════════════════════════════════════

  private createModal(): Component | undefined {
    if (!this.state.showModal) return undefined;

    const modalContent = new Box({ padding: 2 });

    const title = new Text({
      content: "🪟 Modal Window",
      align: "center",
      color: this.theme.accent,
    });

    const desc = new Text({
      content: "This is a modal overlay with a backdrop.\n" +
        "Press Esc or click outside to close.",
      align: "center",
    });

    const button = new Button({
      label: "Close Modal",
      width: 15,
      onClick: () => {
        this.state.showModal = false;
        this.tui.requestRender();
      },
    });

    modalContent.addChild(title);
    modalContent.addChild(new Spacer({ fixed: 1 }));
    modalContent.addChild(desc);
    modalContent.addChild(new Spacer({ fixed: 1 }));
    modalContent.addChild(button);

    return new Modal({
      width: 50,
      height: 12,
      title: "Modal Example",
      content: modalContent,
      backdrop: true,
      theme: this.theme,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVENT HANDLING
  // ═══════════════════════════════════════════════════════════════════════════════

  handleInput(data: string): void {
    // Global shortcuts
    if (matchesKey(data, "q") || matchesKey(data, "escape")) {
      if (this.state.showDialog) {
        this.state.showDialog = false;
        this.tui.requestRender();
        return;
      }
      if (this.state.showModal) {
        this.state.showModal = false;
        this.tui.requestRender();
        return;
      }
      this.done();
      return;
    }

    // Tab to switch focus
    if (matchesKey(data, "tab")) {
      this.focusManager.focusNext();
      this.tui.requestRender();
      return;
    }

    // Arrow keys for progress demo
    if (this.state.activeSection === "data") {
      if (matchesKey(data, "left")) {
        this.state.progressValue = Math.max(0, this.state.progressValue - 5);
        this.updateContentPanel();
        this.tui.requestRender();
        return;
      }
      if (matchesKey(data, "right")) {
        this.state.progressValue = Math.min(100, this.state.progressValue + 5);
        this.updateContentPanel();
        this.tui.requestRender();
        return;
      }
    }

    // Forward to focused component
    const focusedItem = this.focusManager.focusedItem;
    if (focusedItem) {
      (focusedItem.component as unknown as { handleInput?(d: string): void })?.handleInput?.(data);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════════════════════

  render(width: number): string[] {
    const lines: string[] = [];

    // Header (2 lines)
    lines.push(...this.header.render(width));
    lines.push("".padEnd(width));

    // Main layout: sidebar (30%) + content (70%)
    const sidebarWidth = Math.floor(width * 0.25);
    const contentWidth = width - sidebarWidth - 1;

    const sidebarLines = this.sidebar.render(sidebarWidth);
    const contentLines = this.contentPanel.render(contentWidth);

    const mainHeight = Math.max(sidebarLines.length, contentLines.length, 18);

    for (let i = 0; i < mainHeight; i++) {
      const sidebarLine = sidebarLines[i] || " ".repeat(sidebarWidth);
      const contentLine = contentLines[i] || " ".repeat(contentWidth);
      lines.push(sidebarLine + "│" + contentLine);
    }

    // Footer (2 lines)
    lines.push("".padEnd(width));
    lines.push(...this.footer.render(width));

    // Toast overlay (if active)
    if (this.toast) {
      const toastLines = this.toast.render(Math.min(60, width));
      const startRow = Math.max(0, lines.length - toastLines.length - 2);
      const leftPad = Math.max(0, width - 60);

      for (let i = 0; i < toastLines.length && startRow + i < lines.length; i++) {
        const line = " ".repeat(leftPad) + toastLines[i];
        lines[startRow + i] = line.slice(0, width).padEnd(width);
      }
    }

    // Dialog overlay (if active)
    const dialog = this.createDialog();
    if (dialog) {
      const dialogLines = dialog.render(width);
      const startRow = Math.floor((lines.length - dialogLines.length) / 2);

      for (let i = 0; i < dialogLines.length && startRow + i < lines.length; i++) {
        lines[startRow + i] = dialogLines[i];
      }
    }

    // Modal overlay (if active)
    const modal = this.createModal();
    if (modal) {
      const modalLines = modal.render(width);
      const startRow = Math.floor((lines.length - modalLines.length) / 2);

      for (let i = 0; i < modalLines.length && startRow + i < lines.length; i++) {
        lines[startRow + i] = modalLines[i];
      }
    }

    // Ensure all lines are exactly width chars
    return lines.map((line) => {
      const visible = Array.from(line).reduce((len, char) => {
        // Simple handling - in real implementation use visibleWidth
        return len + (char.charCodeAt(0) >= 0x20 ? 1 : 0);
      }, 0);
      if (visible > width) {
        return line.slice(0, width);
      }
      return line.padEnd(width);
    });
  }

  invalidate(): void {
    this.header.invalidate();
    this.sidebar.invalidate();
    this.contentPanel.invalidate();
    this.footer.invalidate();
    this.toast?.invalidate();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

export default function piTuiKitDemoExtension(pi: ExtensionAPI): void {
  pi.registerCommand("tui-kit-demo", {
    description: "Show pi-tui-kit full component demo",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("Interactive mode required", "error");
        return;
      }

      await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
        return new DemoComponent(tui, () => done(undefined));
      }, {
        overlay: true,
        width: 100,
        maxHeight: "90%",
        anchor: "center",
      });
    },
  });

  pi.registerCommand("tui-kit", {
    description: "Quick pi-tui-kit commands",
    handler: async (args, ctx) => {
      const cmd = args.trim();

      if (cmd === "demo" || cmd === "") {
        // Run demo
        await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
          return new DemoComponent(tui, () => done(undefined));
        }, {
          overlay: true,
          width: 100,
          maxHeight: "90%",
          anchor: "center",
        });
        return;
      }

      if (cmd === "help") {
        ctx.ui.notify("Usage: /tui-kit [demo|help]", "info");
        return;
      }

      ctx.ui.notify(`Unknown command: ${cmd}. Try: demo, help`, "warning");
    },
  });
}

// Quick component showcase for testing
export async function showComponentDemo(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<void> {
  await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
    return new DemoComponent(tui, () => done(undefined));
  }, {
    overlay: true,
    width: 100,
    maxHeight: "90%",
    anchor: "center",
  });
}
