# pi-tui-kit

A high-level TUI component library for [Pi](https://github.com/badlogic/pi-mono/), inspired by Ratatui, Blessed, and modern UI frameworks.

Built on top of `@mariozechner/pi-tui` with **strict width safety** — no more `Rendered line X exceeds terminal width` crashes!

## ✨ Features

- 🔒 **ANSI-safe width calculations** — handles escape codes correctly
- 🎨 **Theming support** — semantic colors with easy customization  
- 🧩 **Composable components** — mix, match, nest freely
- ⚡ **Focus management** — keyboard navigation out of the box
- 📦 **Powerline-style segments** — for status bars and footers
- 🌳 **Rich widgets** — Tree, Table, Dialog, Modal, Toast, and more
- 🧪 **Fully tested** — comprehensive test suite with 60+ test cases

## 🚀 Quick Start

```typescript
import { 
  Panel, List, Button, 
  DefaultTheme, Borders 
} from "pi-tui-kit";

const panel = new Panel({
  title: "My App",
  border: Borders.rounded,
  theme: DefaultTheme
});

const list = new List({
  items: [
    { id: "1", label: "Option 1" },
    { id: "2", label: "Option 2" },
  ],
  onSelect: (item) => console.log(item.label)
});

panel.addChild(list);

await ctx.ui.custom((tui, theme, kb, done) => {
  return {
    render: (width) => panel.render(width),
    handleInput: (data) => list.handleInput(data),
    invalidate: () => panel.invalidate()
  };
});
```

## 📦 Components

### Core Components

| Component | Description | Example |
|-----------|-------------|---------|
| `Box` | Container with padding and optional border | `new Box({ border: true, paddingX: 2 })` |
| `Text` | Text display with alignment, color, wrapping | `new Text({ content: "Hello", align: "center" })` |
| `Spacer` | Flexible or fixed empty space | `new Spacer({ fixed: 3 })` or `Spacer.flex()` |
| `Flex` | Row/column layout with alignment | `new Flex({ direction: "row", gap: 2 })` |
| `Stack` | Z-index layered container for overlays | `new Stack()` with push/pop |
| `Segment` | Powerline-style status bar segment | `new Segment({ content: "main", icon: "📦" })` |
| `Powerline` | Multi-segment status bar | `new Powerline({ segments: [...] })` |

### Widgets

| Widget | Description | Key Features |
|--------|-------------|--------------|
| `Panel` | Bordered panel with title | Padding, borders, children |
| `Button` | Interactive button with focus state | Focus highlighting, click handling |
| `List` | Scrollable selection list | Keyboard navigation, scrolling |
| `Input` | Single-line text input | Password mode, prefix, events |
| `Dialog` | Modal dialog with actions | Button focus, keyboard nav |
| `Tabs` | Tab navigation | border/underline/pills variants |
| `Tree` | Expandable/collapsible tree view | Icons, expand/collapse |
| `Table` | Data table with column alignment | Auto/fill columns, borders |
| `ProgressBar` | Progress indicator | bar/blocks/dots/spinner styles |
| `StepProgress` | Multi-step progress indicator | Visual step states |
| `Modal` | Centered overlay with backdrop | Centering, backdrop char |
| `Toast` | Lightweight notification | Types (info/success/warning/error) |

### Hooks

| Hook | Description | Use Case |
|------|-------------|----------|
| `useState` | React-like state management | Component-local or keyed state |
| `useSelect` | Selection state with navigation | List/tree selection logic |
| `useFocus` | Multi-component focus management | Form/tab navigation |
| `useInput` | Input state with history | Text input with validation |

## 📚 Usage Examples

### Basic Layout

```typescript
import { Box, Text, Flex, Spacer, Borders, DefaultTheme } from "pi-tui-kit";

// Simple bordered box with text
const box = new Box({
  border: true,
  borderStyle: Borders.rounded,
  paddingX: 2,
  paddingY: 1,
  theme: DefaultTheme
});

box.addChild(new Text({ 
  content: "Hello, World!",
  align: "center",
  color: DefaultTheme.accent
}));
```

### Flex Layout (Row)

```typescript
import { Flex, Text, Button, DefaultTheme } from "pi-tui-kit";

const row = new Flex({ direction: "row", gap: 2, align: "center" });

row.addChild(new Text({ content: "Label:" }), undefined, 10);
row.addChild(new Button({ label: "Click Me" }), 1); // flex grow
```

### Flex Layout (Column)

```typescript
const col = new Flex({ direction: "column", gap: 1 });

col.addChild(new Text({ content: "Header" }), undefined, 1);
col.addChild(new Spacer({ fixed: 2 }));
col.addChild(new Button({ label: "Footer" }), undefined, 1);
```

### Interactive List with Selection

```typescript
import { List, ListItem } from "pi-tui-kit";

const items: ListItem[] = [
  { id: "1", label: "First Option" },
  { id: "2", label: "Second Option", description: "With description" },
  { id: "3", label: "Disabled", disabled: true },
];

const list = new List({
  items,
  maxVisible: 5,
  selectedIndex: 0,
  onSelect: (item) => console.log(`Selected: ${item.id}`),
  onChange: (item, idx) => console.log(`Focused: ${idx}`)
});

// Keyboard handling
list.handleInput("down");  // Next item
list.handleInput("up");    // Previous item
list.handleInput("\r");    // Select (Enter)
```

### Text Input

```typescript
import { Input } from "pi-tui-kit";

// Basic input
const input = new Input({
  placeholder: "Enter name...",
  initialValue: "",
  prefix: "> ",
  onChange: (value) => console.log(`Typing: ${value}`),
  onSubmit: (value) => console.log(`Submitted: ${value}`)
});

// Password input
const password = new Input({
  password: true,
  prefix: "🔒 ",
  onSubmit: (value) => handlePassword(value)
});

input.handleInput("H");
input.handleInput("i");
input.handleInput("\r"); // Submit
```

### Dialog with Actions

```typescript
import { Dialog, Button, Text, Flex } from "pi-tui-kit";

const content = new Flex({ direction: "column" });
content.addChild(new Text({ content: "Are you sure?" }));
content.addChild(new Text({ content: "This cannot be undone.", color: DefaultTheme.warning }));

const dialog = new Dialog({
  title: "Confirm Delete",
  content,
  width: 50,
  actions: [
    { id: "cancel", label: "Cancel", onClick: () => cancel() },
    { id: "delete", label: "Delete", danger: true, primary: true, onClick: () => confirm() }
  ]
});

dialog.focused = true;
dialog.handleInput("right");  // Move to Delete button
dialog.handleInput("\r");    // Activate
```

### Tab Navigation

```typescript
import { Tabs, Panel, Text } from "pi-tui-kit";

const tabs = new Tabs({
  tabs: [
    { id: "general", label: "General", content: generalPanel },
    { id: "display", label: "Display", content: displayPanel },
    { id: "advanced", label: "Advanced", disabled: true }
  ],
  activeTab: "general",
  variant: "underline",
  onChange: (tabId) => console.log(`Switched to: ${tabId}`)
});

tabs.handleInput("right");  // Next tab
tabs.handleInput("left"); // Previous tab
```

### Tree View

```typescript
import { Tree, TreeNode } from "pi-tui-kit";

const roots: TreeNode[] = [
  {
    id: "/project",
    label: "my-project",
    icon: "📁",
    expanded: true,
    children: [
      { id: "/project/src", label: "src", icon: "📂", expanded: false },
      { id: "/project/README.md", label: "README.md", icon: "📄" },
      { id: "/project/package.json", label: "package.json", icon: "📦" }
    ]
  }
];

const tree = new Tree({
  roots,
  indentSize: 2,
  showLines: true,
  onSelect: (node) => console.log(`Selected: ${node.id}`),
  onToggle: (node) => console.log(`${node.expanded ? "Expanded" : "Collapsed"}: ${node.id}`)
});

tree.handleInput("down");   // Navigate down
tree.handleInput(" ");      // Toggle expand/collapse
tree.handleInput("\r");      // Select
```

### Data Table

```typescript
import { Table } from "pi-tui-kit";

const table = new Table({
  columns: [
    { key: "name", header: "Name", width: 20, align: "left" },
    { key: "size", header: "Size", width: 10, align: "right" },
    { key: "modified", header: "Modified", width: "fill", align: "center" }
  ],
  data: [
    { name: "index.ts", size: "1.2KB", modified: "2025-01-15" },
    { name: "utils.ts", size: "3.4KB", modified: "2025-01-14" },
    { name: "README.md", size: "5.6KB", modified: "2025-01-13" }
  ],
  showHeader: true,
  showBorders: true,
  maxRows: 10
});
```

### Progress Indicators

```typescript
import { ProgressBar, StepProgress } from "pi-tui-kit";

// Bar style
const bar = new ProgressBar({
  value: 45,
  max: 100,
  style: "bar",
  label: "Downloading",
  showValue: true
});

// Spinner for indeterminate progress
const spinner = new ProgressBar({
  value: 0,
  style: "spinner",
  label: "Loading"
});

// Step progress
const steps = new StepProgress({
  steps: [
    { id: "1", label: "Initialize", status: "completed" },
    { id: "2", label: "Process", status: "current" },
    { id: "3", label: "Finalize", status: "pending" }
  ]
});
```

## 🎨 Theming

### Using Default Theme

```typescript
import { DefaultTheme, Borders, Panel } from "pi-tui-kit";

const panel = new Panel({
  theme: DefaultTheme,
  borderColor: DefaultTheme.accent,
  title: "Styled Panel"
});
```

### Creating Custom Theme

```typescript
import { createTheme, ansi, Theme } from "pi-tui-kit";

const myTheme = createTheme({
  primary: (text) => `${ansi.brightBlue}${text}${ansi.reset}`,
  secondary: (text) => `${ansi.cyan}${text}${ansi.reset}`,
  success: (text) => `${ansi.green}${text}${ansi.reset}`,
  warning: (text) => `${ansi.yellow}${text}${ansi.reset}`,
  error: (text) => `${ansi.red}${text}${ansi.reset}`,
  accent: (text) => `${ansi.magenta}${text}${ansi.reset}`,
  muted: (text) => `${ansi.dim}${text}${ansi.reset}`,
  border: (text) => `${ansi.dim}${text}${ansi.reset}`,
});

const panel = new Panel({ theme: myTheme });
```

### No-Color Theme

```typescript
import { NoColorTheme } from "pi-tui-kit";

// For terminals without color support
const panel = new Panel({ theme: NoColorTheme });
```

## ⌨️ Keyboard Navigation

### Focus Management

```typescript
import { useFocus, matchesKey } from "@mariozechner/pi-tui";
import { List, Button, Input } from "pi-tui-kit";

const list = new List({ items: [...] });
const saveBtn = new Button({ label: "Save" });
const cancelBtn = new Button({ label: "Cancel" });
const input = new Input({});

const focus = useFocus({
  items: [
    { id: "list", component: list },
    { id: "input", component: input },
    { id: "save", component: saveBtn },
    { id: "cancel", component: cancelBtn },
  ],
  wrap: true,
  onChange: (idx, item) => {
    console.log(`Focus moved to: ${item.id}`);
  }
});

// In your handleInput
handleInput(data: string): void {
  if (matchesKey(data, "tab")) {
    focus.focusNext();
    tui.requestRender();
    return;
  }
  
  // Forward to focused component
  focus.focusedItem?.component.handleInput?.(data);
}
```

### Key Handling Reference

| Component | Keys |
|-----------|------|
| `List` | ↑/↓, PgUp/PgDn, Home/End, Enter/Space |
| `Button` | Enter/Space (when focused) |
| `Input` | Type to input, Enter to submit, Backspace/Delete |
| `Tabs` | ←/→, Tab |
| `Dialog` | ←/→ (buttons), Tab, Enter/Space |
| `Tree` | ↑/↓, Space (toggle), Enter (select) |

## 📊 Powerline Status Bar

```typescript
import { Powerline, Segment, DefaultTheme } from "pi-tui-kit";

const statusBar = new Powerline({
  segments: [
    new Segment({
      content: "pi-tui-kit",
      icon: "📦",
      bgColor: DefaultTheme.accent,
      separator: "",
    }),
    new Segment({
      content: "v1.0.0",
      separator: "│",
      separatorColor: DefaultTheme.dim,
    }),
    new Segment({
      content: "main",
      icon: "",
      separator: "│",
    }),
    new Segment({
      content: "j/k: navigate · Enter: select",
      separator: "│",
      padding: 0,
    }),
  ],
  align: "left",
  fillChar: " ",
  fillColor: DefaultTheme.dim
});
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Type check
npm run typecheck
```

## 📁 Examples

### Complete Extension Example

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { TUI, Theme, KeybindingsManager } from "@mariozechner/pi-tui";
import { 
  Panel, List, Button, 
  DefaultTheme, Borders 
} from "pi-tui-kit";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("demo-panel", {
    description: "Show demo panel",
    handler: async (_args, ctx) => {
      const panel = new Panel({
        title: "Demo",
        border: Borders.rounded,
        theme: DefaultTheme,
        padding: 1
      });
      
      const list = new List({
        items: [
          { id: "1", label: "Option 1" },
          { id: "2", label: "Option 2" },
          { id: "3", label: "Option 3" }
        ],
        onSelect: (item) => ctx.ui.notify(`Selected: ${item.label}`, "info")
      });
      
      panel.addChild(list);
      
      await ctx.ui.custom((tui: TUI, theme: Theme, kb: KeybindingsManager, done: () => void) => {
        return {
          render: (width: number) => panel.render(width),
          handleInput: (data: string) => {
            if (data === "q") {
              done();
              return;
            }
            list.handleInput(data);
          },
          invalidate: () => panel.invalidate()
        };
      });
    }
  });
}
```

## 🔧 Installation

### For Development

```bash
# Clone to extensions directory
git clone <repo> ~/.pi/agent/extensions/pi-tui-kit

# Or symlink for development
ln -s $(pwd) ~/.pi/agent/extensions/pi-tui-kit
```

### As Dependency

Add to your extension's imports:

```typescript
import { Panel, List, Button } from "pi-tui-kit";
```

Ensure `pi-tui-kit` is in your extensions directory or referenced in your extension's path.

## 📋 API Reference

See source code for detailed type definitions:
- `src/core/` - Core layout components
- `src/widgets/` - UI widgets
- `src/hooks/` - State management hooks
- `src/utils/` - Utilities (text, borders, themes)

## 📝 License

MIT — inspired by [Ratatui](https://ratatui.rs/) and [pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer)

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## 🎮 Demo

Run the interactive demo:

```bash
# Install extension temporarily
pi -e ~/.pi/agent/extensions/pi-tui-kit/examples/demo.ts

# Run in Pi
/tui-kit-demo
```

---

<p align="center">
  Built with ❤️ for the Pi ecosystem
</p>
