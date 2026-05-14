/**
 * Quick Start Example for pi-tui-kit
 * Demonstrates basic usage of core components
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI, Theme, KeybindingsManager } from "@earendil-works/pi-tui";
import { matchesKey } from "@earendil-works/pi-tui";

import {
  // Core
  Box, Text, Spacer, Flex, Stack,
  // Widgets
  Panel, Button, List, Input,
  // Utils
  DefaultTheme, Borders,
  type ListItem,
} from "../src/index.js";

/**
 * Simple Todo List Demo
 */
export function todoDemo(pi: ExtensionAPI) {
  pi.registerCommand("todo-demo", {
    description: "Simple todo list using pi-tui-kit",
    handler: async (_args, ctx) => {
      const theme = DefaultTheme;

      // State
      let todos: Array<{ id: string; text: string; done: boolean }> = [
        { id: "1", text: "Learn pi-tui-kit", done: false },
        { id: "2", text: "Build awesome TUI", done: false },
        { id: "3", text: "Profit!", done: false },
      ];
      let newTodoText = "";

      // Components
      const header = new Text({
        content: "📝 My Todo List",
        align: "center",
        color: theme.accent,
      });

      const todoList = new List({
        items: todos.map(t => ({
          id: t.id,
          label: `${t.done ? "✓" : "○"} ${t.text}`,
        })),
        maxVisible: 5,
        onSelect: (item) => {
          const todo = todos.find(t => t.id === item.id);
          if (todo) {
            todo.done = !todo.done;
            refreshList();
          }
        },
      });

      const input = new Input({
        placeholder: "Add new todo...",
        prefix: "> ",
        onSubmit: (value) => {
          if (value.trim()) {
            todos.push({
              id: String(Date.now()),
              text: value.trim(),
              done: false,
            });
            newTodoText = "";
            input.clear();
            refreshList();
          }
        },
      });

      const addButton = new Button({
        label: "Add",
        width: 12,
        onClick: () => {
          const value = input.getValue();
          if (value.trim()) {
            todos.push({
              id: String(Date.now()),
              text: value.trim(),
              done: false,
            });
            input.clear();
            refreshList();
          }
        },
      });

      const clearButton = new Button({
        label: "Clear Done",
        width: 16,
        onClick: () => {
          todos = todos.filter(t => !t.done);
          refreshList();
        },
      });

      function refreshList() {
        todoList.setItems(todos.map(t => ({
          id: t.id,
          label: `${t.done ? "✓" : "○"} ${t.text}`,
        })));
      }

      // Layout
      const buttonRow = new Flex({ direction: "row", gap: 2 });
      buttonRow.addChild(addButton, undefined, 12);
      buttonRow.addChild(clearButton, undefined, 16);
      buttonRow.addChild(Spacer.flex(), 1);

      const content = new Flex({ direction: "column", gap: 1 });
      content.addChild(header);
      content.addChild(todoList);
      content.addChild(new Spacer({ fixed: 1 }));
      content.addChild(input);
      content.addChild(buttonRow);

      const panel = new Panel({
        title: "Todo Demo (press 'q' to quit)",
        border: Borders.rounded,
        padding: 1,
        theme,
      });
      panel.addChild(content);

      await ctx.ui.custom((tui: TUI, theme: Theme, kb: KeybindingsManager, done: () => void) => {
        return {
          render: (width: number) => panel.render(width),
          handleInput: (data: string) => {
            if (matchesKey(data, "q")) {
              done();
              return;
            }

            if (matchesKey(data, "tab")) {
              // Simple focus cycle
              if (input.focused) {
                input.focused = false;
                addButton.focused = true;
              } else if (addButton.focused) {
                addButton.focused = false;
                clearButton.focused = true;
              } else if (clearButton.focused) {
                clearButton.focused = false;
                input.focused = true;
              } else {
                input.focused = true;
              }
              tui.requestRender();
              return;
            }

            // Forward to focused component
            if (input.focused) {
              input.handleInput(data);
            } else if (addButton.focused || clearButton.focused) {
              if (data === "\r" || data === " ") {
                if (addButton.focused) addButton.handleInput(data);
                if (clearButton.focused) clearButton.handleInput(data);
              }
            } else {
              // Default to list
              todoList.handleInput(data);
            }
          },
          invalidate: () => panel.invalidate(),
        };
      });
    },
  });
}

/**
 * Flex Layout Demo
 */
export function flexDemo(pi: ExtensionAPI) {
  pi.registerCommand("flex-demo", {
    description: "Demonstrates Flex layouts",
    handler: async (_args, ctx) => {
      const theme = DefaultTheme;

      // Row layout - evenly distributed
      const row1 = new Flex({ direction: "row", gap: 2 });
      row1.addChild(new Panel({
        title: "Panel 1",
        border: Borders.single,
        padding: 1,
      }), 1);
      row1.addChild(new Panel({
        title: "Panel 2",
        border: Borders.single,
        padding: 1,
      }), 1);
      row1.addChild(new Panel({
        title: "Panel 3",
        border: Borders.single,
        padding: 1,
      }), 1);

      // Row layout - fixed + flex
      const row2 = new Flex({ direction: "row", gap: 2 });
      row2.addChild(new Panel({
        title: "Fixed 20",
        border: Borders.rounded,
        padding: 1,
      }), undefined, 20);
      row2.addChild(new Panel({
        title: "Flex grow",
        border: Borders.rounded,
        padding: 1,
      }), 1);
      row2.addChild(new Panel({
        title: "Fixed 15",
        border: Borders.rounded,
        padding: 1,
      }), undefined, 15);

      // Column layout
      const col = new Flex({ direction: "column", gap: 1 });
      col.addChild(new Text({
        content: "═══ Row Layout (Equal) ═══",
        align: "center",
        color: theme.accent,
      }));
      col.addChild(row1, undefined, 3);
      col.addChild(new Text({
        content: "═══ Row Layout (Mixed) ═══",
        align: "center",
        color: theme.accent,
      }));
      col.addChild(row2, undefined, 3);

      const panel = new Panel({
        title: "Flex Layout Demo (press 'q' to quit)",
        border: Borders.double,
        padding: 1,
        theme,
      });
      panel.addChild(col);

      await ctx.ui.custom((tui: TUI, theme: Theme, kb: KeybindingsManager, done: () => void) => {
        return {
          render: (width: number) => panel.render(width),
          handleInput: (data: string) => {
            if (matchesKey(data, "q")) {
              done();
            }
          },
          invalidate: () => panel.invalidate(),
        };
      });
    },
  });
}

/**
 * Tree and Table Demo
 */
export function dataDemo(pi: ExtensionAPI) {
  pi.registerCommand("data-demo", {
    description: "Tree and Table data display",
    handler: async (_args, ctx) => {
      const theme = DefaultTheme;

      const { Tree, Table, type TreeNode } = await import("../src/index.js");

      // Tree data
      const treeRoots: TreeNode[] = [
        {
          id: "project",
          label: "my-project",
          icon: "📁",
          expanded: true,
          children: [
            {
              id: "src",
              label: "src",
              icon: "📂",
              expanded: true,
              children: [
                { id: "index.ts", label: "index.ts", icon: "📄" },
                { id: "utils.ts", label: "utils.ts", icon: "📄" },
                { id: "styles.css", label: "styles.css", icon: "🎨" },
              ]
            },
            {
              id: "test",
              label: "test",
              icon: "📂",
              expanded: false,
              children: [
                { id: "index.test.ts", label: "index.test.ts", icon: "🧪" },
              ]
            },
            { id: "package.json", label: "package.json", icon: "📦" },
            { id: "README.md", label: "README.md", icon: "📄" },
          ]
        }
      ];

      const tree = new Tree({
        roots: treeRoots,
        maxVisible: 8,
        onSelect: (node) => ctx.ui.notify(`Selected: ${node.id}`, "info"),
      });

      // Table data
      const table = new Table({
        columns: [
          { key: "name", header: "Name", width: 20, align: "left" },
          { key: "type", header: "Type", width: 10, align: "center" },
          { key: "size", header: "Size", width: 8, align: "right" },
          { key: "modified", header: "Modified", width: "fill", align: "center" },
        ],
        data: [
          { name: "index.ts", type: "file", size: "2.4KB", modified: "2025-01-15" },
          { name: "utils.ts", type: "file", size: "1.8KB", modified: "2025-01-14" },
          { name: "styles.css", type: "file", size: "3.2KB", modified: "2025-01-13" },
          { name: "package.json", type: "file", size: "1.1KB", modified: "2025-01-12" },
        ],
        showHeader: true,
        showBorders: true,
      });

      const treePanel = new Panel({
        title: "File Tree",
        border: Borders.single,
        padding: 1,
      });
      treePanel.addChild(tree);

      const tablePanel = new Panel({
        title: "File Details",
        border: Borders.single,
        padding: 1,
      });
      tablePanel.addChild(table);

      const layout = new Flex({ direction: "row", gap: 2 });
      layout.addChild(treePanel, 1);
      layout.addChild(tablePanel, 1);

      const mainPanel = new Panel({
        title: "Data Display Demo (q to quit, arrows/j/k to navigate)",
        border: Borders.rounded,
        padding: 1,
        theme,
      });
      mainPanel.addChild(layout);

      await ctx.ui.custom((tui: TUI, theme: Theme, kb: KeybindingsManager, done: () => void) => {
        return {
          render: (width: number) => mainPanel.render(width),
          handleInput: (data: string) => {
            if (matchesKey(data, "q")) {
              done();
              return;
            }

            // Navigate tree
            if (data === "up" || data === "k") {
              tree.handleInput("up");
            } else if (data === "down" || data === "j") {
              tree.handleInput("down");
            } else if (data === " " || data === "\r") {
              tree.handleInput(data);
            }
          },
          invalidate: () => {
            treePanel.invalidate();
            tablePanel.invalidate();
          },
        };
      });
    },
  });
}

/**
 * Main entry point - register all demos
 */
export default function (pi: ExtensionAPI) {
  todoDemo(pi);
  flexDemo(pi);
  dataDemo(pi);
}
